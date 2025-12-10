"""
JWT token handling and authentication utilities
"""

import hashlib
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from fastapi import HTTPException, status
from ..config import settings
from ..enums.user import UserRole

# Bcrypt has a 72-byte limit
BCRYPT_MAX_LENGTH = 72


class TokenData:
    """Token data structure"""
    def __init__(self, user_id: int, username: str, email: str, role: UserRole, full_name: str):
        self.user_id = user_id
        self.username = username
        self.email = email
        self.role = role
        self.full_name = full_name


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.
    Uses the same password preparation logic as hashing.
    """
    try:
        # Prepare password the same way as in get_password_hash
        password_bytes = plain_password.encode('utf-8')
        if len(password_bytes) > BCRYPT_MAX_LENGTH:
            # Pre-hash with SHA256 if password exceeds bcrypt's limit
            password_bytes = hashlib.sha256(password_bytes).digest()
        
        # Ensure we don't exceed 72 bytes
        if len(password_bytes) > BCRYPT_MAX_LENGTH:
            password_bytes = password_bytes[:BCRYPT_MAX_LENGTH]
        
        # Use bcrypt directly to verify
        return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))
    except (ValueError, TypeError, Exception) as e:
        # Handle any errors during verification
        return False


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt directly.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Hashed password string
        
    Raises:
        ValueError: If password is too long (DoS protection)
    """
    # Validate password length to prevent DoS attacks
    if len(password) > 1000:
        raise ValueError("Password is too long. Maximum 1000 characters allowed.")
    
    if not password:
        raise ValueError("Password cannot be empty.")
    
    # Prepare password for bcrypt
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > BCRYPT_MAX_LENGTH:
        # For passwords longer than 72 bytes, pre-hash with SHA256
        # This is a common workaround for bcrypt's limitation
        password_bytes = hashlib.sha256(password_bytes).digest()
    
    # Ensure we don't exceed 72 bytes (shouldn't happen after SHA256, but just in case)
    if len(password_bytes) > BCRYPT_MAX_LENGTH:
        password_bytes = password_bytes[:BCRYPT_MAX_LENGTH]
    
    # Generate salt and hash using bcrypt directly
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    
    # Return as string (bcrypt returns bytes)
    return hashed.decode('utf-8')


def create_access_token(user_data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token with user data
    
    Args:
        user_data: Dictionary containing user information
        expires_delta: Token expiration time
        
    Returns:
        JWT token string
    """
    to_encode = user_data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access"
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT refresh token
    
    Args:
        user_id: User ID
        expires_delta: Token expiration time
        
    Returns:
        JWT refresh token string
    """
    to_encode = {
        "user_id": user_id,
        "type": "refresh"
    }
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=7)  # Refresh tokens last 7 days
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow()
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def verify_token(token: str) -> TokenData:
    """
    Verify and decode a JWT token
    
    Args:
        token: JWT token string
        
    Returns:
        TokenData object with user information
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        
        # Check if token is an access token
        if payload.get("type") != "access":
            raise credentials_exception
        
        # Extract user data from token
        user_id: int = payload.get("user_id")
        username: str = payload.get("username")
        email: str = payload.get("email")
        role: str = payload.get("role")
        full_name: str = payload.get("full_name")
        
        if user_id is None or username is None or email is None or role is None:
            raise credentials_exception
        
        # Convert role string to UserRole enum
        try:
            user_role = UserRole(role)
        except ValueError:
            raise credentials_exception
        
        return TokenData(
            user_id=user_id,
            username=username,
            email=email,
            role=user_role,
            full_name=full_name
        )
    
    except JWTError:
        raise credentials_exception


def verify_refresh_token(token: str) -> int:
    """
    Verify a refresh token and return user ID
    
    Args:
        token: JWT refresh token string
        
    Returns:
        User ID
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        
        # Check if token is a refresh token
        if payload.get("type") != "refresh":
            raise credentials_exception
        
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
        
        return user_id
    
    except JWTError:
        raise credentials_exception