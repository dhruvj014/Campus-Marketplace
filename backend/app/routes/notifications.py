"""
Notification routes for user notifications
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime

from ..database import get_db
from ..models.notification import Notification
from ..auth.dependencies import get_current_user
from ..schemas.notification import NotificationResponse, NotificationUpdate

router = APIRouter()


@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications for the current user"""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = query.order_by(desc(Notification.created_at)).offset(skip).limit(limit).all()
    
    return notifications


@router.get("/unread-count")
def get_unread_count(
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread notifications"""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    
    return {"unread_count": count}


@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    db.commit()
    db.refresh(notification)
    
    return notification


@router.put("/read-all")
def mark_all_notifications_read(
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications as read"""
    updated = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({
        "is_read": True,
        "read_at": datetime.utcnow()
    })
    
    db.commit()
    
    return {"message": f"Marked {updated} notifications as read"}


@router.put("/conversation/{conversation_id}/read")
def mark_conversation_notifications_read(
    conversation_id: int,
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all notifications related to a conversation as read"""
    updated = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.related_conversation_id == conversation_id,
        Notification.is_read == False
    ).update({
        "is_read": True,
        "read_at": datetime.utcnow()
    })
    
    db.commit()
    
    return {"message": f"Marked {updated} notifications as read"}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    current_user: Optional[object] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a notification"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    db.delete(notification)
    db.commit()
    
    return {"message": "Notification deleted"}

