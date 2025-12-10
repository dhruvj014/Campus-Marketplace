"""
Item-related enums
"""

import enum


class ItemCategory(str, enum.Enum):
    TEXTBOOKS = "textbooks"
    ELECTRONICS = "electronics"
    FURNITURE = "furniture"
    CLOTHING = "clothing"
    SPORTS_FITNESS = "sports_fitness"
    OTHER = "other"


class ItemCondition(str, enum.Enum):
    NEW = "new"
    LIKE_NEW = "like_new"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class ItemStatus(str, enum.Enum):
    AVAILABLE = "available"
    SOLD = "sold"
    RESERVED = "reserved"
    INACTIVE = "inactive"
    REMOVED = "removed"
    INCOMPLETE = "incomplete"  