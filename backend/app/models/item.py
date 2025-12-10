"""
Item model for marketplace listings
"""

from sqlalchemy import Column, String, Text, Float, Boolean, ForeignKey, Enum, TypeDecorator
from .base import BaseModel
from ..enums.item import ItemCondition, ItemStatus, ItemCategory


class ItemStatusType(TypeDecorator):
    """Custom type to handle ItemStatus enum conversion with case-insensitive lookup"""
    # Use String as base type to avoid native enum validation issues
    impl = String(50)
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        """Convert Python enum to database value"""
        if value is None:
            # Return default value if None (uppercase for database)
            return "AVAILABLE"
        if isinstance(value, ItemStatus):
            # Database enum expects uppercase except for 'removed'
            if value == ItemStatus.REMOVED:
                return "removed"  # Keep lowercase for removed
            else:
                return value.name  # Use enum name (uppercase) for others
        if isinstance(value, str):
            # If it's already a string, convert appropriately
            value_lower = value.lower()
            if value_lower == "removed":
                return "removed"
            # Convert to uppercase for other values
            return value.upper()
        return str(value)
    
    def process_result_value(self, value, dialect):
        """Convert database value to Python enum, handling case-insensitive lookup"""
        if value is None:
            return None
        # Convert to string and find matching enum member by value
        value_str = str(value).lower()
        for status in ItemStatus:
            if status.value.lower() == value_str:
                return status
        # Fallback: try direct lookup
        try:
            return ItemStatus(value_str)
        except ValueError:
            # If still not found, try to find by name (uppercase)
            value_upper = value_str.upper()
            for status in ItemStatus:
                if status.name == value_upper:
                    return status
            # Last resort: return None or raise error
            raise ValueError(f"Invalid ItemStatus value: {value}")


class Item(BaseModel):
    __tablename__ = "items"

    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    price = Column(Float, nullable=False, index=True)
    
    # Item details
    condition = Column(Enum(ItemCondition), nullable=False)
    # Use custom type to handle 'removed' value from database
    status = Column(ItemStatusType(), default=ItemStatus.AVAILABLE, nullable=False)
    category = Column(Enum(ItemCategory), nullable=False)
    
    # Location and availability
    location = Column(String(200), nullable=True)
    is_negotiable = Column(Boolean, default=True)
    
    # S3 URL for item image
    item_url = Column(String(500), nullable=True)  # S3 URL for item image
    
    # Foreign keys
    seller_id = Column(ForeignKey("users.id"), nullable=False)  # Reference to user ID