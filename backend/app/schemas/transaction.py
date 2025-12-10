"""
Transaction schemas
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TransactionCreate(BaseModel):
    sale_price: float = Field(..., gt=0, description="Sale price must be greater than 0")


class TransactionResponse(BaseModel):
    id: int
    item_id: int
    seller_id: int
    buyer_id: int
    conversation_id: Optional[int]
    sale_price: float
    original_price: Optional[float]
    is_completed: bool
    completed_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class RatingCreate(BaseModel):
    transaction_id: int
    rated_user_id: int
    rating: int = Field(..., ge=1, le=5, description="Rating must be between 1 and 5")
    comment: Optional[str] = None


class RatingResponse(BaseModel):
    id: int
    transaction_id: int
    rater_id: int
    rated_user_id: int
    rating: int
    comment: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class TransactionDetailResponse(BaseModel):
    id: int
    item_id: int
    conversation_id: Optional[int]
    item_title: Optional[str]
    seller_id: int
    seller_name: Optional[str]
    buyer_id: int
    buyer_name: Optional[str]
    sale_price: float
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class UserTransactionSummaryResponse(BaseModel):
    sales: List[TransactionDetailResponse]
    purchases: List[TransactionDetailResponse]
    sold_items: int
    purchased_items: int
    total_amount_earned: float
    total_amount_spent: float

