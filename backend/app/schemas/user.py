"""
User schemas for request/response models
"""

from pydantic import BaseModel, EmailStr, model_validator
from typing import Optional
from datetime import datetime
from ..enums.user import UserRole


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    profile_picture_url: Optional[str] = None  # URL to user's profile picture
    role: Optional[UserRole] = None  # Only admins can update roles
    is_active: Optional[bool] = None  # Only admins can update status
    is_verified: Optional[bool] = None  # Only admins can verify users


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    phone: Optional[str]
    student_id: str
    profile_picture_url: Optional[str] = None
    role: UserRole
    is_active: bool
    is_verified: bool
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    @model_validator(mode='after')
    def normalize_urls(self):
        """Normalize profile_picture_url to proper S3 URL if it's a relative path"""
        if self.profile_picture_url:
            try:
                from ..utils.s3_client import get_s3_client
                s3_client = get_s3_client()
                self.profile_picture_url = s3_client.get_s3_url(self.profile_picture_url)
            except Exception:
                # If S3 client is not available, keep original URL
                pass
        return self

    class Config:
        from_attributes = True