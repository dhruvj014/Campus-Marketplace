"""
User-related enums
"""

import enum


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"