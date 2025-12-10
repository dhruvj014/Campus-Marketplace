"""
Base model with common fields for all database models
"""

from sqlalchemy import Column, Integer, DateTime, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()


class BaseModel(Base):
    __abstract__ = True

    id = Column(Integer, primary_key=True, index=True)
    created_by = Column(String, nullable=True)  # Username or user ID who created the record
    updated_by = Column(String, nullable=True)  # Username or user ID who last updated the record
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)