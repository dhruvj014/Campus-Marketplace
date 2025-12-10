"""
Enhanced authentication routes with JWT token management
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import timedelta
from typing import Optional
import anyio
from datetime import datetime

from ..database import get_db
from ..models.user import User
from ..schemas.auth import (
    Token, UserLogin, UserCreate, UserResponse, 
    RefreshToken, TokenUserInfo, PasswordChange, AdminLogin, AdminSecurityQuestion,
    SendVerificationCodeRequest, VerifyCodeRequest
)
from ..auth.jwt_handler import (
    verify_password, get_password_hash, create_access_token, 
    create_refresh_token, verify_refresh_token, verify_token
)
from jose import JWTError, jwt
from ..auth.dependencies import get_current_user, get_current_token_data, require_admin
from ..enums.user import UserRole
from ..config import settings
from ..core.logging import get_logger, log_auth_event
from ..middleware.logging import DatabaseLoggingMiddleware
from .chat import active_connections
from ..utils.verification import store_verification_code, verify_code, is_email_verified, remove_verification_code
from ..utils.email import generate_verification_code, send_verification_email

router = APIRouter()
logger = get_logger(__name__)
FORCE_LOGOUT_MESSAGE = "You were logged out because your account was accessed on another device."


async def _send_force_logout_notification(user_id: int, reason: str) -> None:
    """Send a force logout event to an active WebSocket connection."""
    websocket = active_connections.get(user_id)
    if not websocket:
        return
    try:
        await websocket.send_json({
            "type": "force_logout",
            "data": {
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
        })
    except Exception as exc:
        logger.warning(
            "Failed to send force logout notice to user %s: %s",
            user_id,
            exc,
            extra={"user_id": user_id, "event": "force_logout_failed"},
        )


def notify_existing_session_logout(user_id: int, reason: str) -> None:
    """
    Schedule a force-logout notification for an already connected session.
    Safe to call from sync route handlers.
    """
    try:
        anyio.from_thread.run(_send_force_logout_notification, user_id, reason)
    except RuntimeError:
        # If we're already in the event loop (async route), schedule directly
        import asyncio
        asyncio.create_task(_send_force_logout_notification(user_id, reason))


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def get_client_ip(request: Request) -> str:
    """Extract client IP from request"""
    if hasattr(request, 'client') and request.client:
        return request.client.host
    return "unknown"


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()


@router.post("/signup", response_model=UserResponse)
def signup(user_data: UserCreate, request: Request, db: Session = Depends(get_db)):
    """
    Create a new user account
    """
    client_ip = get_client_ip(request)
    
    try:
        # Check if user already exists
        if get_user_by_email(db, user_data.email):
            log_auth_event(
                logger=logger,
                event="signup",
                email=user_data.email,
                ip_address=client_ip,
                success=False,
                reason="Email already registered"
            )
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )
        
        # Check if username already exists
        if get_user_by_username(db, user_data.username):
            log_auth_event(
                logger=logger,
                event="signup",
                email=user_data.email,
                ip_address=client_ip,
                success=False,
                reason="Username already taken"
            )
            raise HTTPException(
                status_code=400,
                detail="Username already taken"
            )
        
        # Check if student ID already exists
        if db.query(User).filter(User.student_id == user_data.student_id).first():
            log_auth_event(
                logger=logger,
                event="signup",
                email=user_data.email,
                ip_address=client_ip,
                success=False,
                reason="Student ID already registered"
            )
            raise HTTPException(
                status_code=400,
                detail="Student ID already registered"
            )
        
        # Check if email is verified
        if not is_email_verified(user_data.email):
            log_auth_event(
                logger=logger,
                event="signup",
                email=user_data.email,
                ip_address=client_ip,
                success=False,
                reason="Email not verified"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not verified. Please verify your email with the OTP code before signing up."
            )
        
        # Create new user
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            email=user_data.email,
            username=user_data.username,
            hashed_password=hashed_password,
            full_name=user_data.full_name,
            phone=user_data.phone,
            student_id=user_data.student_id,
            role=user_data.role,
            created_by=user_data.username
        )
        
        # Store in database
        with DatabaseLoggingMiddleware("INSERT", "users", logger) as db_log:
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            db_log.set_record_count(1)
        
        # Remove verification code after successful signup
        remove_verification_code(db_user.email)
        
        # Log successful signup
        log_auth_event(
            logger=logger,
            event="signup",
            user_id=str(db_user.id),
            email=db_user.email,
            ip_address=client_ip,
            success=True
        )
        
        return db_user
    
    except HTTPException:
        raise
    except ValueError as e:
        # Handle password validation errors
        logger.warning(f"Password validation error for {user_data.email}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Signup error for {user_data.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed due to server error"
        )


@router.post("/login")
def login(user_credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login with email/username and password.
    For admin users, returns temp token for security question step.
    For regular users, returns full access token.
    """
    client_ip = get_client_ip(request)
    
    try:
        # Find user by email or username
        user = db.query(User).filter(
            or_(
                User.email == user_credentials.email,
                User.username == user_credentials.email
            )
        ).first()
        
        if not user or not verify_password(user_credentials.password, user.hashed_password):
            log_auth_event(
                logger=logger,
                event="login",
                email=user_credentials.email,
                ip_address=client_ip,
                success=False,
                reason="Invalid credentials"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email/username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            log_auth_event(
                logger=logger,
                event="login",
                user_id=str(user.id),
                email=user.email,
                ip_address=client_ip,
                success=False,
                reason="Account deactivated"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is deactivated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # If user is admin, return temp token for security question step
        if user.role == UserRole.ADMIN:
            # Create temporary token for security question step (short expiration: 5 minutes)
            temp_token_data = {
                "user_id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role.value,
                "full_name": user.full_name,
                "step": "security_question"  # Mark as security question step
            }
            
            # Debug: Log token data before encoding
            logger.debug(f"Creating temp token with data: {temp_token_data}")
            
            temp_token_expires = timedelta(minutes=5)
            temp_token = create_access_token(temp_token_data, expires_delta=temp_token_expires)
            
            # Debug: Decode token immediately to verify step field is included
            try:
                test_payload = jwt.decode(temp_token, settings.secret_key, algorithms=[settings.algorithm])
                logger.info(f"Temp token created successfully. Payload keys: {list(test_payload.keys())}, step: {test_payload.get('step')}")
                if test_payload.get('step') != 'security_question':
                    logger.error(f"CRITICAL: Temp token missing 'step' field! Full payload: {test_payload}")
                    raise ValueError("Temp token created without 'step' field")
            except Exception as e:
                logger.error(f"Error verifying temp token immediately after creation: {str(e)}")
                raise
            
            log_auth_event(
                logger=logger,
                event="admin_login_step1",
                user_id=str(user.id),
                email=user.email,
                ip_address=client_ip,
                success=True
            )
            
            return {
                "temp_token": temp_token,
                "security_question": "Best movie of all time?",
                "message": "Please answer the security question",
                "requires_security": True
            }
        
        # Regular user - create full tokens
        existing_session_active = bool(user.access_token)
        token_data = {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "full_name": user.full_name
        }
        
        # Create tokens
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(token_data, expires_delta=access_token_expires)
        refresh_token = create_refresh_token(user.id)
        
        # Store tokens in database
        with DatabaseLoggingMiddleware("UPDATE", "users", logger):
            user.access_token = access_token
            user.refresh_token = refresh_token
            user.updated_by = user.username
            db.commit()

        if existing_session_active:
            notify_existing_session_logout(user.id, FORCE_LOGOUT_MESSAGE)
        
        # Log successful login
        log_auth_event(
            logger=logger,
            event="login",
            user_id=str(user.id),
            email=user.email,
            ip_address=client_ip,
            success=True
        )
        
        # Create user info for response
        user_info = TokenUserInfo(
            user_id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_verified=user.is_verified
        )
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60,  # Convert to seconds
            user=user_info
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for {user_credentials.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )


@router.post("/refresh", response_model=Token)
def refresh_access_token(refresh_data: RefreshToken, db: Session = Depends(get_db)):
    """
    Refresh access token using refresh token
    """
    try:
        user_id = verify_refresh_token(refresh_data.refresh_token)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create new tokens
    token_data = {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role.value,
        "full_name": user.full_name
    }
    
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(token_data, expires_delta=access_token_expires)
    new_refresh_token = create_refresh_token(user.id)
    
    # Store new tokens in database
    user.access_token = access_token
    user.refresh_token = new_refresh_token
    user.updated_by = user.username
    db.commit()
    
    user_info = TokenUserInfo(
        user_id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_verified=user.is_verified
    )
    
    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=user_info
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current user information
    """
    return current_user


@router.post("/change-password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change user password
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Update password and clear tokens for security
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.access_token = None  # Force re-login after password change
    current_user.refresh_token = None
    current_user.updated_by = current_user.username
    db.commit()
    
    return {"message": "Password changed successfully. Please log in again."}


@router.post("/logout")
def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logout user (clear tokens from database)
    """
    # Clear tokens from database
    current_user.access_token = None
    current_user.refresh_token = None
    current_user.updated_by = current_user.username
    db.commit()
    
    return {"message": "Successfully logged out"}


# Admin login endpoints with 2FA
@router.post("/admin/login")
def admin_login_step1(admin_credentials: AdminLogin, request: Request, db: Session = Depends(get_db)):
    """
    Admin login step 1: Validate username and password
    Returns a temporary token for security question step
    """
    client_ip = get_client_ip(request)
    
    try:
        # Find user by username or email (admin login can use either)
        user = db.query(User).filter(
            or_(
                User.username == admin_credentials.username,
                User.email == admin_credentials.username
            )
        ).first()
        
        if not user:
            log_auth_event(
                logger=logger,
                event="admin_login",
                username=admin_credentials.username,
                ip_address=client_ip,
                success=False,
                reason="User not found"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user is admin
        if user.role != UserRole.ADMIN:
            log_auth_event(
                logger=logger,
                event="admin_login",
                username=admin_credentials.username,
                ip_address=client_ip,
                success=False,
                reason="Not an admin user"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )
        
        # Verify password
        if not verify_password(admin_credentials.password, user.hashed_password):
            log_auth_event(
                logger=logger,
                event="admin_login",
                username=admin_credentials.username,
                ip_address=client_ip,
                success=False,
                reason="Invalid password"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            log_auth_event(
                logger=logger,
                event="admin_login",
                username=admin_credentials.username,
                ip_address=client_ip,
                success=False,
                reason="Account deactivated"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is deactivated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create temporary token for security question step (short expiration: 5 minutes)
        temp_token_data = {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "full_name": user.full_name,
            "step": "security_question"  # Mark as security question step
        }
        
        temp_token_expires = timedelta(minutes=5)
        temp_token = create_access_token(temp_token_data, expires_delta=temp_token_expires)
        
        log_auth_event(
            logger=logger,
            event="admin_login_step1",
            user_id=str(user.id),
            username=user.username,
            ip_address=client_ip,
            success=True
        )
        
        return {
            "temp_token": temp_token,
            "security_question": "Best movie of all time?",
            "message": "Please answer the security question"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin login step 1 error for {admin_credentials.username}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )


@router.post("/admin/verify-security")
def admin_login_step2(
    security_answer: AdminSecurityQuestion,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Admin login step 2: Verify security question answer
    Returns full access token if answer is correct
    """
    client_ip = get_client_ip(request)
    
    # Get temp token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Temporary token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    temp_token = auth_header.split("Bearer ")[1].strip()
    
    try:
        # Verify temp token and check if it's a security question step token
        payload = jwt.decode(temp_token, settings.secret_key, algorithms=[settings.algorithm])
        
        # Debug: Log full payload for troubleshooting
        logger.info(f"Decoded token payload: {payload}")
        logger.info(f"Token payload keys: {list(payload.keys())}")
        logger.info(f"Token step value: {payload.get('step')}")
        logger.info(f"Token type: {payload.get('type')}")
        
        # Check if step field exists
        if "step" not in payload:
            logger.error(f"Token missing 'step' field. All payload keys: {list(payload.keys())}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing security step field. Please login again.",
            )
        
        if payload.get("step") != "security_question":
            logger.warning(f"Token step mismatch. Expected 'security_question', got: {payload.get('step')}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token for security question step. Token step: {payload.get('step')}",
            )
        
        token_data = verify_token(temp_token)
        
        # Get user
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if not user or user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user",
            )
        
        # Verify security answer (case-insensitive)
        correct_answer = "Baahubali"
        if security_answer.answer.strip().lower() != correct_answer.lower():
            log_auth_event(
                logger=logger,
                event="admin_login_step2",
                user_id=str(user.id),
                email=user.email,
                ip_address=client_ip,
                success=False,
                reason="Incorrect security answer"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect security answer",
            )
        
        existing_session_active = bool(user.access_token)
        # Create full access and refresh tokens
        token_data_dict = {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role.value,
            "full_name": user.full_name
        }
        
        access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
        access_token = create_access_token(token_data_dict, expires_delta=access_token_expires)
        refresh_token = create_refresh_token(user.id)
        
        # Store tokens in database
        with DatabaseLoggingMiddleware("UPDATE", "users", logger):
            user.access_token = access_token
            user.refresh_token = refresh_token
            user.updated_by = user.username
            db.commit()

        if existing_session_active:
            notify_existing_session_logout(user.id, FORCE_LOGOUT_MESSAGE)
        
        # Log successful login
        log_auth_event(
            logger=logger,
            event="admin_login",
            user_id=str(user.id),
            email=user.email,
            ip_address=client_ip,
            success=True
        )
        
        # Create user info for response
        user_info = TokenUserInfo(
            user_id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_verified=user.is_verified
        )
        
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60,
            user=user_info
        )
    
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Temporary token expired or invalid. Please login again.",
        )
    except Exception as e:
        logger.error(f"Admin login step 2 error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Verification failed due to server error"
        )


@router.post("/send-verification-code")
def send_verification_code(
    request_data: SendVerificationCodeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Send OTP verification code to user's email before signup
    """
    client_ip = get_client_ip(request)
    email = request_data.email.lower()
    
    try:
        # Check if email is already registered
        if get_user_by_email(db, email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Generate verification code
        code = generate_verification_code()
        
        # Store verification code
        store_verification_code(email, code)
        
        # Send verification email
        email_sent = send_verification_email(email, code)
        
        if not email_sent:
            # If email sending failed but SMTP is not configured, still allow in dev mode
            logger.warning(f"Verification email not sent to {email}, but code generated: {code}")
            # In production, you might want to raise an error here
            # For now, we'll allow it to continue (code is logged)
        
        logger.info(f"Verification code sent to {email}")
        
        return {
            "message": "Verification code sent to your email",
            "email": email
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending verification code to {email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification code"
        )


@router.post("/verify-code")
def verify_verification_code(
    request_data: VerifyCodeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Verify OTP code sent to user's email
    """
    client_ip = get_client_ip(request)
    email = request_data.email.lower()
    code = request_data.code.strip()
    
    try:
        # Verify the code
        is_valid = verify_code(email, code)
        
        if is_valid:
            logger.info(f"Verification code verified for {email}")
            return {
                "message": "Email verified successfully",
                "verified": True
            }
        else:
            logger.warning(f"Invalid verification code for {email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification code"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying code for {email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify code"
        )


