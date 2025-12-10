"""
User management routes with role-based access control
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models.user import User
from ..schemas.user import UserUpdate, UserResponse
from ..auth.dependencies import (
    get_current_user, require_admin, get_current_active_user
)
from ..enums.user import UserRole

router = APIRouter()


@router.get("/", response_model=List[UserResponse])
def get_users(
    skip: int = 0,
    limit: int = 100,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all users (admin only)
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.get("/profile", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_active_user)):
    """
    Get current user profile
    """
    return current_user


@router.put("/profile", response_model=UserResponse)
def update_profile(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update current user profile
    Profile pictures should be uploaded using upload_type="profile" to: profile-pictures/user_{user_id}/
    """
    # Only allow updating certain fields for regular users
    allowed_fields = {"full_name", "phone", "profile_picture_url"}
    update_data = user_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        if field in allowed_fields:
            setattr(current_user, field, value)
    
    current_user.updated_by = current_user.username
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get user by ID (users can view their own profile, admins can view any)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Users can only view their own profile unless they are admin
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user"
        )
    
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update user by ID (admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update fields
    update_data = user_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    user.updated_by = admin_user.username
    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}")
def deactivate_user(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Deactivate user account (admin only) - soft delete
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Don't allow admin to deactivate themselves
    if user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )
    
    user.is_active = False
    user.updated_by = admin_user.username
    db.commit()
    
    return {"message": f"User {user.username} has been deactivated"}