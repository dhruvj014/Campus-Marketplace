"""
Authentication dependencies and middleware for FastAPI routes
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List
from functools import wraps

from ..database import get_db
from ..models.user import User
from .jwt_handler import verify_token, TokenData
from ..enums.user import UserRole

# Security scheme
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get current authenticated user from JWT token
    
    Args:
        credentials: Bearer token credentials
        db: Database session
        
    Returns:
        User object
        
    Raises:
        HTTPException: If token is invalid or user not found
    """
    token = credentials.credentials
    token_data = verify_token(token)
    
    # Get user from database
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if the token matches the one stored in database (optional security check)
    if user.access_token and user.access_token != token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked or is invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user



def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Get current active user (alias for get_current_user since we already check is_active)
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User object if active
    """
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Require admin role for route access
    
    Args:
        current_user: Current authenticated user
        
    Returns:
        User object if admin
        
    Raises:
        HTTPException: If user is not admin
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


def get_current_token_data(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenData:
    """
    Get token data without database lookup
    
    Args:
        credentials: Bearer token credentials
        
    Returns:
        TokenData object with user information from token
        
    Raises:
        HTTPException: If token is invalid
    """
    token = credentials.credentials
    return verify_token(token)







