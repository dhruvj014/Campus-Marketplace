"""
AWS S3 client for file uploads and management
"""

import boto3
import magic
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import HTTPException, UploadFile
from typing import Optional
import uuid
import logging
from ..config import settings

logger = logging.getLogger(__name__)


class S3Client:
    def __init__(self):
        """Initialize S3 client with configuration from settings"""
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region_name=settings.aws_region
            )
            self.bucket_name = settings.s3_bucket_name
            self.region = settings.aws_region
            
            # Construct proper S3 URL if base_url is not a valid S3 URL
            base_url = settings.s3_base_url
            if base_url and (base_url.startswith('http://localhost') or base_url.startswith('http://127.0.0.1') or '/uploads' in base_url):
                # Construct proper S3 URL format: https://bucket-name.s3.region.amazonaws.com
                self.base_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com"
                logger.info(f"Constructed S3 URL: {self.base_url} (original base_url was local)")
            else:
                self.base_url = base_url
        except Exception as e:
            logger.error(f"Failed to initialize S3 client: {e}")
            raise HTTPException(status_code=500, detail="S3 configuration error")

    async def upload_file(
        self, 
        file: UploadFile, 
        folder: str = "uploads",
        custom_filename: Optional[str] = None
    ) -> str:
        """
        Upload file to S3 bucket
        
        Args:
            file: FastAPI UploadFile object
            folder: S3 folder/prefix (default: "uploads")
            custom_filename: Optional custom filename (generates UUID if not provided)
            
        Returns:
            str: Full S3 URL of uploaded file
        """
        try:
            # Validate file size
            file_size = 0
            content = await file.read()
            file_size = len(content)
            
            if file_size > settings.max_upload_size:
                raise HTTPException(
                    status_code=413, 
                    detail=f"File size {file_size} exceeds maximum allowed size {settings.max_upload_size}"
                )
            
            # Validate file type
            file_extension = self._get_file_extension(file.filename)
            # Remove leading dot for comparison (allowed extensions don't have dots)
            ext_without_dot = file_extension.lstrip('.')
            allowed_exts = settings.get_allowed_image_extensions()
            if ext_without_dot not in allowed_exts:
                raise HTTPException(
                    status_code=400,
                    detail=f"File type {file_extension} not allowed. Allowed types: {allowed_exts}"
                )
            
            # Generate filename
            if custom_filename:
                filename = f"{custom_filename}{file_extension}"
            else:
                filename = f"{uuid.uuid4().hex}{file_extension}"
            
            # S3 key (path)
            s3_key = f"{folder}/{filename}"
            
            # Upload to S3
            # Try with public-read ACL first, fall back to without ACL if bucket has ACLs disabled
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    Body=content,
                    ContentType=file.content_type or "application/octet-stream",
                    ContentDisposition="inline",
                    ACL='public-read'  # Make file publicly readable
                )
            except ClientError as acl_error:
                # If ACL fails (bucket has ACLs disabled), upload without ACL
                # Bucket must be configured with public access via bucket policy instead
                logger.warning(f"Failed to upload with ACL, retrying without: {acl_error}")
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    Body=content,
                    ContentType=file.content_type or "application/octet-stream",
                    ContentDisposition="inline"
                )
            
            # Return full S3 URL (ensure proper format)
            s3_url = f"{self.base_url}/{s3_key}"
            # Ensure URL doesn't have double slashes
            s3_url = s3_url.replace("//", "/").replace("https:/", "https://").replace("http:/", "http://")
            logger.debug(f"Generated S3 URL: {s3_url}")
            return s3_url
            
        except ClientError as e:
            logger.error(f"S3 upload error: {e}")
            raise HTTPException(status_code=500, detail="Failed to upload file to S3")
        except NoCredentialsError:
            logger.error("S3 credentials not found")
            raise HTTPException(status_code=500, detail="S3 credentials not configured")
        except Exception as e:
            logger.error(f"Unexpected error during S3 upload: {e}")
            raise HTTPException(status_code=500, detail="File upload failed")
        finally:
            await file.seek(0)  # Reset file pointer

    async def delete_file(self, s3_url: str) -> bool:
        """
        Delete file from S3 bucket
        
        Args:
            s3_url: Full S3 URL of the file
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Extract S3 key from URL - handle both full S3 URLs and relative paths
            if s3_url.startswith('http://') or s3_url.startswith('https://'):
                # Extract key from full URL (remove base URL part)
                if self.base_url in s3_url:
                    s3_key = s3_url.replace(f"{self.base_url}/", "")
                else:
                    # Try to extract from standard S3 URL format
                    # https://bucket.s3.region.amazonaws.com/key
                    parts = s3_url.split(f"{self.bucket_name}.s3.{self.region}.amazonaws.com/")
                    if len(parts) > 1:
                        s3_key = parts[1]
                    else:
                        # Fallback: try to extract from any S3 URL format
                        s3_key = s3_url.split(f"/{self.bucket_name}/")[-1] if f"/{self.bucket_name}/" in s3_url else s3_url.split("/")[-1]
            else:
                # Relative path - remove /uploads/ prefix if present
                s3_key = s3_url.lstrip('/')
                if s3_key.startswith('uploads/'):
                    s3_key = s3_key[8:]  # Remove 'uploads/' prefix
            
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            return True
            
        except ClientError as e:
            logger.error(f"S3 delete error: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during S3 delete: {e}")
            return False

    def _get_file_extension(self, filename: str) -> str:
        """Extract file extension from filename"""
        if not filename or '.' not in filename:
            return ""
        return f".{filename.split('.')[-1].lower()}"

    def generate_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL for private file access
        
        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 1 hour)
            
        Returns:
            Optional[str]: Presigned URL or None if failed
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': s3_key},
                ExpiresIn=expiration
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {e}")
            return None
    
    def get_s3_url(self, file_path: str) -> str:
        """
        Convert a relative path or existing URL to a proper S3 URL
        
        Args:
            file_path: Relative path (e.g., /uploads/user_2/file.jpg) or existing URL
            
        Returns:
            str: Full S3 URL
        """
        # If already a full S3 URL, return as-is
        if file_path.startswith('https://') and 'amazonaws.com' in file_path:
            return file_path
        if file_path.startswith('http://') and 'amazonaws.com' in file_path:
            return file_path
        
        # If it's a relative path, extract the S3 key and construct URL
        s3_key = file_path.lstrip('/')
        # Remove /uploads/ prefix if present (handles double uploads/uploads)
        if s3_key.startswith('uploads/'):
            s3_key = s3_key[8:]  # Remove 'uploads/' prefix
        
        # Construct full S3 URL
        s3_url = f"{self.base_url}/{s3_key}"
        # Ensure proper URL format
        s3_url = s3_url.replace("//", "/").replace("https:/", "https://").replace("http:/", "http://")
        return s3_url


# Global S3 client instance (lazy initialization)
_s3_client_instance = None

def get_s3_client() -> S3Client:
    """Get or create S3 client instance (lazy initialization)"""
    global _s3_client_instance
    if _s3_client_instance is None:
        try:
            _s3_client_instance = S3Client()
        except Exception as e:
            logger.warning(f"S3 client initialization failed: {e}. File uploads will not work until S3 is configured.")
            # Create a dummy client that will raise errors when used
            class DummyS3Client:
                async def upload_file(self, *args, **kwargs):
                    raise HTTPException(status_code=500, detail="S3 is not configured. Please configure AWS S3 credentials.")
                async def delete_file(self, *args, **kwargs):
                    raise HTTPException(status_code=500, detail="S3 is not configured. Please configure AWS S3 credentials.")
                def generate_presigned_url(self, *args, **kwargs):
                    raise HTTPException(status_code=500, detail="S3 is not configured. Please configure AWS S3 credentials.")
            _s3_client_instance = DummyS3Client()
    return _s3_client_instance

# For backward compatibility, create a proxy object
class S3ClientProxy:
    def __getattr__(self, name):
        return getattr(get_s3_client(), name)

s3_client = S3ClientProxy()