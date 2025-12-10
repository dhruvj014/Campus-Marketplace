"""
Enhanced authentication schemas with detailed token information
"""

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from ..enums.user import UserRole


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int  # Expiration time in seconds
    user: "TokenUserInfo"


class RefreshToken(BaseModel):
    refresh_token: str


class TokenUserInfo(BaseModel):
    """User information embedded in token"""
    user_id: int
    username: str
    email: str
    full_name: str
    role: UserRole
    is_verified: bool


class UserLogin(BaseModel):
    email: str  # Can be email or username
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str
    phone: Optional[str] = None
    student_id: str
    role: UserRole = UserRole.USER


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    full_name: str
    phone: Optional[str]
    student_id: str
    role: UserRole
    is_active: bool
    is_verified: bool
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class AdminLogin(BaseModel):
    """Admin login with username/password"""
    username: str
    password: str


class AdminSecurityQuestion(BaseModel):
    """Admin security question answer"""
    answer: str


class AdminPasswordReset(BaseModel):
    """Admin password reset for any user"""
    new_password: str
    confirm_password: str


class AdminSecurityAnswerVerify(BaseModel):
    """Verify security answer for admin self-modification"""
    answer: str


class AdminSecurityAnswerUpdate(BaseModel):
    """Update security answer for admin"""
    new_answer: str
    confirm_answer: str


class SendVerificationCodeRequest(BaseModel):
    """Request to send verification code to email"""
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    """Request to verify OTP code"""
    email: EmailStr
    code: str