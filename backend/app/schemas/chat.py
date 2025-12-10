"""
Chat schemas for request/response validation
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime
from .transaction import TransactionResponse


class MessageCreate(BaseModel):
    conversation_id: int
    content: str = Field(..., min_length=1, max_length=5000)


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
    sender_username: Optional[str] = None
    sender_full_name: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    user1_id: int
    user2_id: int
    item_id: Optional[int] = None
    last_message_at: Optional[datetime] = None
    created_at: datetime
    other_user_id: int
    other_user_username: str
    other_user_full_name: str
    other_user_profile_picture_url: Optional[str] = None
    unread_count: int = 0
    last_message: Optional[MessageResponse] = None
    status: str = "active"  # "active", "archived"
    is_sold: bool = False
    is_ended: bool = False
    transaction_id: Optional[int] = None
    transaction: Optional[TransactionResponse] = None  # Full transaction data if exists
    pending_offer_price: Optional[float] = None  # Price in dollars
    pending_offer_from_user_id: Optional[int] = None
    pending_offer_at: Optional[datetime] = None

    @model_validator(mode='after')
    def normalize_urls(self):
        """Normalize other_user_profile_picture_url to proper S3 URL if it's a relative path"""
        if self.other_user_profile_picture_url:
            try:
                from ..utils.s3_client import get_s3_client
                s3_client = get_s3_client()
                self.other_user_profile_picture_url = s3_client.get_s3_url(self.other_user_profile_picture_url)
            except Exception:
                # If S3 client is not available, keep original URL
                pass
        return self

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    user2_id: int
    item_id: Optional[int] = None

