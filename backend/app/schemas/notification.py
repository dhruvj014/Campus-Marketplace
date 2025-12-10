"""
Notification schemas for request/response validation
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: NotificationType
    title: str
    message: str
    is_read: bool
    read_at: Optional[datetime] = None
    related_item_id: Optional[int] = None
    related_user_id: Optional[int] = None
    related_conversation_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationUpdate(BaseModel):
    is_read: bool



