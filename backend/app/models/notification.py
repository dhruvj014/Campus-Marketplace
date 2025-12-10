"""
Notification model for user notifications
"""

from sqlalchemy import Column, Integer, ForeignKey, String, Text, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel
import enum


class NotificationType(str, enum.Enum):
    MESSAGE = "message"
    ITEM_INTEREST = "item_interest"
    ITEM_SOLD = "item_sold"
    SYSTEM = "system"


class Notification(BaseModel):
    __tablename__ = "notifications"

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(Enum(NotificationType), nullable=False, default=NotificationType.MESSAGE)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    # Optional references
    related_item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    related_conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="notifications")
    related_item = relationship("Item", foreign_keys=[related_item_id])
    related_user = relationship("User", foreign_keys=[related_user_id])
    related_conversation = relationship("Conversation", foreign_keys=[related_conversation_id])



