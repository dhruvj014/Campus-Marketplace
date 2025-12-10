"""
User model for authentication and user management
"""

from sqlalchemy import Column, String, Boolean, Enum
from .base import BaseModel
from ..enums.user import UserRole


class User(BaseModel):
    __tablename__ = "users"

    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    student_id = Column(String, unique=True, nullable=False)
    
    # User role (user, admin)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    
    # Status and verification
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Token storage for authentication management
    access_token = Column(String, nullable=True)  # Current active access token
    refresh_token = Column(String, nullable=True)  # Current active refresh token
    
    # Profile picture
    profile_picture_url = Column(String, nullable=True)  # URL to user's profile picture