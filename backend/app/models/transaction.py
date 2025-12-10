"""
Transaction model for item sales
"""

from sqlalchemy import Column, Integer, ForeignKey, Float, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel


class Transaction(BaseModel):
    __tablename__ = "transactions"

    # Transaction details
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True, index=True)
    
    # Sale details
    sale_price = Column(Float, nullable=False)
    original_price = Column(Float, nullable=True)  # Original listing price for reference
    
    # Status
    is_completed = Column(Boolean, default=True, nullable=False)  # Sale is completed
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Optional notes
    notes = Column(Text, nullable=True)
    
    # Relationships
    item = relationship("Item", backref="transactions")
    seller = relationship("User", foreign_keys=[seller_id], backref="sales")
    buyer = relationship("User", foreign_keys=[buyer_id], backref="purchases")
    conversation = relationship("Conversation", foreign_keys=[conversation_id])

