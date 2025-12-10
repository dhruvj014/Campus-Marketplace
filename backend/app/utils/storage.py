"""
Storage factory - chooses between S3 and local storage
"""

import logging
from .s3_client import get_s3_client
from ..config import settings

logger = logging.getLogger(__name__)

def get_storage():
    """
    Get the S3 storage backend
    
    Returns:
        S3Client instance
    """
    # Verify S3 credentials are provided
    aws_key = getattr(settings, 'aws_access_key_id', '')
    s3_bucket = getattr(settings, 's3_bucket_name', '')
    
    if not aws_key or not s3_bucket or not aws_key.strip() or not s3_bucket.strip():
        raise Exception("S3 credentials are missing. Please configure AWS S3 settings in .env file.")
    
    logger.info("Using AWS S3 storage")
    return get_s3_client()

# Global storage instance (lazy initialization)
_storage_instance = None

def get_file_storage():
    """
    Get the S3 file storage instance
    """
    global _storage_instance
    
    if _storage_instance is None:
        _storage_instance = get_storage()
        logger.info("S3 storage instance initialized")
    
    return _storage_instance

