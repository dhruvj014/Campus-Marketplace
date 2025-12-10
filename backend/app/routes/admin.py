"""
Admin routes for moderation and management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Dict, Any

from ..database import get_db
from ..models.user import User
from ..models.item import Item
from ..models.item_report import ItemReport
from ..schemas.auth import UserResponse
from ..schemas.item import ItemResponse
from ..auth.dependencies import get_current_user, require_admin
from ..auth.jwt_handler import get_password_hash
from ..schemas.auth import AdminPasswordReset, AdminSecurityAnswerVerify, AdminSecurityAnswerUpdate
from ..enums.user import UserRole
from ..enums.item import ItemStatus

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)):
    """
    Dependency to require admin role
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user



@router.get("/users", response_model=List[UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Get all users (admin only)
    """
    return db.query(User).all()


@router.put("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Deactivate a user account (admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = False
    db.commit()
    return {"message": f"User {user.username} has been deactivated"}

@router.post("/revoke-user-tokens/{user_id}")
def revoke_user_tokens(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Revoke all tokens for a specific user (admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Clear all tokens
    user.access_token = None
    user.refresh_token = None
    user.updated_by = admin_user.username
    db.commit()
    
    return {"message": f"All tokens revoked for user {user.username}"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a user from the system (admin only)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Don't allow admin to delete themselves
    if user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    # Delete user (cascade will handle related items if configured)
    db.delete(user)
    db.commit()
    
    return {"message": f"User {user.username} has been deleted"}


@router.get("/sellers")
def get_sellers(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all sellers (users with >0 listings) (admin only)
    """
    # Get users who have at least one item
    sellers = db.query(User).join(Item, User.id == Item.seller_id).distinct().all()
    
    # Get listing count for each seller
    seller_data = []
    for seller in sellers:
        listing_count = db.query(Item).filter(
            and_(
                Item.seller_id == seller.id,
                Item.status != ItemStatus.REMOVED
            )
        ).count()
        
        seller_dict = UserResponse.from_orm(seller).dict()
        seller_dict["listing_count"] = listing_count
        seller_data.append(seller_dict)
    
    return seller_data


@router.get("/stats")
def get_admin_stats(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get admin dashboard statistics (admin only)
    """
    # Total registered users
    total_users = db.query(User).count()
    
    # Active users (is_active = True)
    active_users = db.query(User).filter(User.is_active == True).count()
    
    # Total listings (excluding removed)
    total_listings = db.query(Item).filter(Item.status != ItemStatus.REMOVED).count()
    
    # Active listings (status = AVAILABLE)
    active_listings = db.query(Item).filter(Item.status == ItemStatus.AVAILABLE).count()
    
    # Sold listings
    sold_listings = db.query(Item).filter(Item.status == ItemStatus.SOLD).count()
    
    # Reserved listings
    reserved_listings = db.query(Item).filter(Item.status == ItemStatus.RESERVED).count()
    
    # Users with listings (sellers)
    sellers_count = db.query(User).join(Item, User.id == Item.seller_id).distinct().count()
    
    # Listings by category
    category_stats = db.query(
        Item.category,
        func.count(Item.id).label('count')
    ).filter(
        Item.status != ItemStatus.REMOVED
    ).group_by(Item.category).all()
    
    category_breakdown = {cat.value: count for cat, count in category_stats}
    
    # Listings by status
    status_stats = db.query(
        Item.status,
        func.count(Item.id).label('count')
    ).filter(
        Item.status != ItemStatus.REMOVED
    ).group_by(Item.status).all()
    
    status_breakdown = {status.value: count for status, count in status_stats}
    
    # Recent registrations (last 30 days)
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_users = db.query(User).filter(User.created_at >= thirty_days_ago).count()
    
    # Recent listings (last 30 days)
    recent_listings = db.query(Item).filter(
        and_(
            Item.created_at >= thirty_days_ago,
            Item.status != ItemStatus.REMOVED
        )
    ).count()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "sellers": sellers_count,
            "recent_registrations": recent_users
        },
        "listings": {
            "total": total_listings,
            "active": active_listings,
            "sold": sold_listings,
            "reserved": reserved_listings,
            "recent": recent_listings
        },
        "category_breakdown": category_breakdown,
        "status_breakdown": status_breakdown
    }


@router.put("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    password_data: AdminPasswordReset,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Reset a user's password (admin only)
    """
    # Validate passwords match
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )
    
    # Validate password length
    if len(password_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long"
        )
    
    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Update password
    user.hashed_password = get_password_hash(password_data.new_password)
    user.updated_by = admin_user.username
    db.commit()
    db.refresh(user)
    
    return {"message": f"Password updated for user {user.username}"}


@router.post("/users/{user_id}/verify-security")
def verify_admin_security_answer(
    user_id: int,
    security_data: AdminSecurityAnswerVerify,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Verify security answer for admin self-modification (admin only)
    """
    # Only allow admin to verify their own security answer
    if user_id != admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only verify your own security answer"
        )
    
    # Verify security answer (case-insensitive)
    correct_answer = "Baahubali"
    if security_data.answer.strip().lower() != correct_answer.lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect security answer"
        )
    
    return {"message": "Security answer verified", "verified": True}


@router.put("/users/{user_id}/update-security-answer")
def update_admin_security_answer(
    user_id: int,
    security_data: AdminSecurityAnswerUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update security answer for admin (admin only, can only update own)
    """
    # Only allow admin to update their own security answer
    if user_id != admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own security answer"
        )
    
    # Validate answers match
    if security_data.new_answer != security_data.confirm_answer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security answers do not match"
        )
    
    # Validate answer length
    if len(security_data.new_answer.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security answer must be at least 3 characters long"
        )
    
    # Note: Currently security answer is hardcoded in auth routes
    # This endpoint is a placeholder for future implementation
    # where security answers could be stored in the database
    
    return {"message": "Security answer update functionality will be implemented in future version"}


@router.get("/reports")
def get_reported_items(
    include_resolved: bool = False,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all reported items (admin only)
    Returns items with their reports (unresolved by default, or all if include_resolved=True)
    """
    # Get reports based on include_resolved flag
    if include_resolved:
        # Get all reports (both resolved and unresolved)
        reports = db.query(ItemReport).order_by(ItemReport.created_at.desc()).all()
    else:
        # Get only unresolved reports (not resolved and not dismissed)
        reports = db.query(ItemReport).filter(
            ItemReport.is_resolved == False,
            ItemReport.is_dismissed == False
        ).order_by(ItemReport.created_at.desc()).all()
    
    # Get items for these reports
    result = []
    for report in reports:
        item = db.query(Item).filter(Item.id == report.item_id).first()
        if item:
            # Get reporter info if available
            reporter = None
            if report.reported_by_user_id:
                reporter = db.query(User).filter(User.id == report.reported_by_user_id).first()
            
            # Get seller info
            seller = db.query(User).filter(User.id == report.seller_id).first()
            
            from datetime import datetime
            resolved_at_str = None
            if report.resolved_at:
                if isinstance(report.resolved_at, datetime):
                    resolved_at_str = report.resolved_at.isoformat()
                else:
                    resolved_at_str = str(report.resolved_at)
            
            reported_at_str = report.created_at.isoformat() if isinstance(report.created_at, datetime) else str(report.created_at)
            
            # Calculate changes if item_snapshot exists (regardless of resolution status)
            changes = {}
            has_changes = False
            if report.item_snapshot:
                current_state = {
                    "title": item.title,
                    "description": item.description,
                    "price": float(item.price),
                    "condition": item.condition.value if hasattr(item.condition, 'value') else str(item.condition),
                    "category": item.category.value if hasattr(item.category, 'value') else str(item.category),
                    "location": item.location,
                    "is_negotiable": item.is_negotiable,
                    "item_url": item.item_url,
                    "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
                }
                for key, old_value in report.item_snapshot.items():
                    new_value = current_state.get(key)
                    # Normalize values for comparison (handle float/int/string differences)
                    if key == "price":
                        # For price, compare as floats
                        try:
                            old_normalized = float(old_value) if old_value is not None else None
                            new_normalized = float(new_value) if new_value is not None else None
                        except (ValueError, TypeError):
                            old_normalized = old_value
                            new_normalized = new_value
                    else:
                        # For other fields, compare as strings (but preserve original types in response)
                        old_normalized = str(old_value) if old_value is not None else None
                        new_normalized = str(new_value) if new_value is not None else None
                    
                    if old_normalized != new_normalized:
                        changes[key] = {
                            "old": old_value,
                            "new": new_value
                        }
                        has_changes = True
            
            result.append({
                "report_id": report.id,
                "item": ItemResponse.from_orm(item).dict(),
                "reported_at": reported_at_str,
                "report_type": report.report_type,
                "description": report.description,
                "is_resolved": report.is_resolved,
                "is_dismissed": report.is_dismissed,
                "resolved_at": resolved_at_str,
                "item_snapshot": report.item_snapshot,
                "changes": changes if has_changes else None,
                "has_changes": has_changes,
                "reporter": {
                    "id": reporter.id if reporter else None,
                    "username": reporter.username if reporter else "Anonymous",
                } if reporter else {"id": None, "username": "Anonymous"},
                "seller": {
                    "id": seller.id,
                    "username": seller.username,
                    "email": seller.email,
                } if seller else None,
            })
    
    return result