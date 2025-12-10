"""
File upload routes using S3
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import Dict, Any
from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User
from ..utils.storage import get_file_storage

router = APIRouter(tags=["File Management"])


@router.get("/test")
async def test_files_route():
    """Test endpoint to verify files router is working"""
    return {"message": "Files router is working", "storage": "s3"}


@router.post("/upload", response_model=Dict[str, Any])
async def upload_file(
    file: UploadFile = File(...),
    folder: str = "uploads",
    upload_type: str = "general",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a file to S3 bucket with organized folder structure
    
    - **file**: The file to upload
    - **folder**: Base folder (optional, default: "uploads")
    - **upload_type**: Type of upload - "profile" for profile pictures, "listing" for item listings, "general" for other files
    
    Folder structure:
    - Profile pictures: profile-pictures/user_{user_id}/
    - Listing images: listings/user_{user_id}/
    - General uploads: uploads/user_{user_id}/
    
    Returns the S3 URL of the uploaded file
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a name")
    
    try:
        # Determine folder based on upload type
        if upload_type == "profile":
            upload_folder = f"profile-pictures/user_{current_user.id}"
        elif upload_type == "listing":
            upload_folder = f"listings/user_{current_user.id}"
        else:
            upload_folder = f"{folder}/user_{current_user.id}"
        
        # Upload file (S3 or local storage)
        storage = get_file_storage()
        file_url = await storage.upload_file(
            file=file, 
            folder=upload_folder,
            custom_filename=None  # Auto-generate UUID filename
        )
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "data": {
                "original_filename": file.filename,
                "s3_url": file_url,  # URL (works for both S3 and local)
                "file_url": file_url,  # Alias for clarity
                "content_type": file.content_type,
                "uploaded_by": current_user.id,
                "upload_type": upload_type,
                "folder": upload_folder
            }
        }
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions from S3 client
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to upload file: {str(e)}"
        )


@router.delete("/delete")
async def delete_file(
    s3_url: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a file from S3 bucket
    
    - **s3_url**: The full S3 URL of the file to delete
    """
    if not s3_url:
        raise HTTPException(status_code=400, detail="S3 URL is required")
    
    # Basic security check - ensure user can only delete files from their folder
    user_folder_path = f"user_{current_user.id}"
    if user_folder_path not in s3_url and current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=403, 
            detail="You can only delete your own files"
        )
    
    try:
        storage = get_file_storage()
        success = await storage.delete_file(s3_url)
        
        if success:
            return {
                "success": True,
                "message": "File deleted successfully",
                "data": {"s3_url": s3_url}
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="File not found or already deleted"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )


@router.post("/presigned-url")
async def generate_presigned_url(
    s3_key: str,
    expiration: int = 3600,
    current_user: User = Depends(get_current_user)
):
    """
    Generate a presigned URL for private file access
    
    - **s3_key**: The S3 object key (path within bucket)
    - **expiration**: URL expiration time in seconds (default: 1 hour)
    """
    if not s3_key:
        raise HTTPException(status_code=400, detail="S3 key is required")
    
    try:
        storage = get_file_storage()
        presigned_url = storage.generate_presigned_url(s3_key, expiration)
        
        if presigned_url:
            return {
                "success": True,
                "message": "Presigned URL generated successfully",
                "data": {
                    "presigned_url": presigned_url,
                    "expires_in_seconds": expiration
                }
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to generate presigned URL"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate presigned URL: {str(e)}"
        )


@router.get("/s3-url")
async def get_s3_url(
    file_path: str,
    current_user: User = Depends(get_current_user)
):
    """
    Convert a relative file path to a full S3 URL
    
    - **file_path**: Relative path (e.g., /uploads/user_2/file.jpg) or existing URL
    """
    if not file_path:
        raise HTTPException(status_code=400, detail="File path is required")
    
    try:
        from ..utils.s3_client import get_s3_client
        s3_client = get_s3_client()
        s3_url = s3_client.get_s3_url(file_path)
        
        return {
            "success": True,
            "data": {
                "original_path": file_path,
                "s3_url": s3_url
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert to S3 URL: {str(e)}"
        )