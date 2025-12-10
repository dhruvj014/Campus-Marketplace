"""
Item schemas for request/response models
"""

from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
from ..enums.item import ItemCondition, ItemStatus, ItemCategory


class ItemCreate(BaseModel):
    title: str
    description: str
    price: float
    condition: ItemCondition
    category: ItemCategory
    location: Optional[str] = None
    is_negotiable: bool = True
    item_url: Optional[str] = None  # S3 URL for item image


class ItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    condition: Optional[ItemCondition] = None
    category: Optional[ItemCategory] = None
    location: Optional[str] = None
    is_negotiable: Optional[bool] = None
    status: Optional[ItemStatus] = None
    item_url: Optional[str] = None  # S3 URL for item image


class ItemResponse(BaseModel):
    id: int
    title: str
    description: str
    price: float
    condition: ItemCondition
    status: ItemStatus
    category: ItemCategory
    location: Optional[str]
    is_negotiable: bool
    item_url: Optional[str]  # S3 URL for item image
    seller_id: int
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    @model_validator(mode='after')
    def normalize_urls(self):
        """Normalize item_url to proper S3 URL if it's a relative path"""
        if self.item_url:
            try:
                from ..utils.s3_client import get_s3_client
                s3_client = get_s3_client()
                self.item_url = s3_client.get_s3_url(self.item_url)
            except Exception:
                # If S3 client is not available, keep original URL
                pass
        return self

    class Config:
        from_attributes = True


class ItemReportCreate(BaseModel):
    report_type: str  # "incomplete_info", "no_photos", "inappropriate", "other"
    description: Optional[str] = None  # Required for "other" type


class ItemReportResponse(BaseModel):
    report_id: int
    item_id: int
    reported_by_user_id: Optional[int]
    seller_id: int
    report_type: str
    description: Optional[str]
    is_resolved: bool
    is_dismissed: bool
    resolved_at: Optional[datetime]
    dismissed_at: Optional[datetime]
    item_snapshot: Optional[dict]
    created_at: datetime
    
    class Config:
        from_attributes = True


class ItemFilter(BaseModel):
    """Filter parameters for item search"""
    category: Optional[ItemCategory] = None
    condition: Optional[ItemCondition] = None
    status: Optional[ItemStatus] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    seller_id: Optional[str] = None
    location: Optional[str] = None
    search_term: Optional[str] = None  # Search in title/description


class AISearchContext(BaseModel):
    product_names: Optional[List[str]] = None  # Changed from keywords to product_names
    category: Optional[str] = None
    condition: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class AISearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language search query")
    context: Optional[AISearchContext] = None
    use_semantic_search: bool = False


class AISearchResponse(BaseModel):
    """Response model for AI search that includes both items and extracted criteria"""
    items: List[ItemResponse]
    extracted_criteria: AISearchContext  # The criteria that was used for this search