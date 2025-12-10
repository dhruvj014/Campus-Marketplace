"""
Chat models for conversations and messages
"""

from sqlalchemy import Column, Integer, ForeignKey, Text, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel


class Conversation(BaseModel):
    __tablename__ = "conversations"

    # Participants
    user1_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user2_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Related to item (optional - for item-specific conversations)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True, index=True)
    
    # Last message timestamp for sorting
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    
    # Sale status
    is_sold = Column(Boolean, default=False, nullable=False)
    sold_at = Column(DateTime(timezone=True), nullable=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    
    # Negotiation/Pending offers
    pending_offer_price = Column(Integer, nullable=True)  # Price in cents to avoid float issues
    pending_offer_from_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pending_offer_at = Column(DateTime(timezone=True), nullable=True)
    
    # Chat status
    is_ended = Column(Boolean, default=False, nullable=False)  # Chat ended after sale
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    # Reporting
    is_reported = Column(Boolean, default=False, nullable=False)
    reported_at = Column(DateTime(timezone=True), nullable=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    report_reason = Column(Text, nullable=True)
    
    # Archive/delete status per user - COMMENTED OUT until migration is run
    # Uncomment these and run the migration script when ready:
    # user1_status = Column(Text, default="active", nullable=False)  # "active", "archived", "deleted"
    # user2_status = Column(Text, default="active", nullable=False)  # "active", "archived", "deleted"
    
    # Relationships
    user1 = relationship("User", foreign_keys=[user1_id], backref="conversations_as_user1")
    user2 = relationship("User", foreign_keys=[user2_id], backref="conversations_as_user2")
    item = relationship("Item", backref="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    transaction = relationship("Transaction", foreign_keys=[transaction_id], uselist=False)


class Message(BaseModel):
    __tablename__ = "messages"

    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], backref="sent_messages")

