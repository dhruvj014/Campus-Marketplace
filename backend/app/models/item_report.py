"""
Item Report model for tracking incomplete listing reports
"""

from sqlalchemy import Column, Integer, ForeignKey, String, Boolean, DateTime, Text, JSON
from sqlalchemy.sql import func
from .base import BaseModel


class ItemReport(BaseModel):
    __tablename__ = "item_reports"

    item_id = Column(ForeignKey("items.id"), nullable=False, index=True)
    reported_by_user_id = Column(ForeignKey("users.id"), nullable=True)  # Null for anonymous reports
    seller_id = Column(ForeignKey("users.id"), nullable=False, index=True)  # The seller who needs to be notified
    is_resolved = Column(Boolean, default=False, nullable=False)
    is_dismissed = Column(Boolean, default=False, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Store the report reason/type
    report_type = Column(String(50), default="incomplete", nullable=False)  # "incomplete_info", "no_photos", "inappropriate", "other"
    description = Column(Text, nullable=True)  # Custom comments for "other" reason
    
    # Store snapshot of item at time of report (JSON)
    item_snapshot = Column(JSON, nullable=True)  # Stores item state when reported

