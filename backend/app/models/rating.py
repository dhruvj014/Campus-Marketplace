"""
Rating model for user ratings after transactions
"""

from sqlalchemy import Column, Integer, ForeignKey, Integer as IntCol, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .base import BaseModel


class Rating(BaseModel):
    __tablename__ = "ratings"

    # Rating details
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    rater_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # User giving the rating
    rated_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # User being rated
    
    # Rating (1-5 stars)
    rating = Column(IntCol, nullable=False)  # 1-5
    
    # Optional comment
    comment = Column(Text, nullable=True)
    
    # Relationships
    transaction = relationship("Transaction", backref="ratings")
    rater = relationship("User", foreign_keys=[rater_id], backref="ratings_given")
    rated_user = relationship("User", foreign_keys=[rated_user_id], backref="ratings_received")



