"""
Verification code storage and management
"""

from datetime import datetime, timedelta
from typing import Dict, Optional
import threading
from ..core.logging import get_logger

logger = get_logger(__name__)

# In-memory storage for verification codes
# Format: {email: {"code": str, "expires_at": datetime, "attempts": int, "verified": bool}}
_verification_codes: Dict[str, Dict] = {}
# Track verified emails (separate from codes, so code can be reused for signup)
_verified_emails: Dict[str, datetime] = {}
_lock = threading.Lock()
CODE_EXPIRY_MINUTES = 10
MAX_ATTEMPTS = 5
VERIFICATION_VALID_MINUTES = 30  # How long verification remains valid


def store_verification_code(email: str, code: str) -> None:
    """Store verification code with expiration"""
    with _lock:
        _verification_codes[email.lower()] = {
            "code": code,
            "expires_at": datetime.utcnow() + timedelta(minutes=CODE_EXPIRY_MINUTES),
            "attempts": 0
        }
        logger.info(f"Stored verification code for {email}")


def verify_code(email: str, code: str) -> bool:
    """
    Verify the code for the given email
    
    Returns:
        True if code is valid, False otherwise
    """
    email_lower = email.lower()
    
    with _lock:
        if email_lower not in _verification_codes:
            logger.warning(f"Verification code not found for {email}")
            return False
        
        verification_data = _verification_codes[email_lower]
        
        # Check if expired
        if datetime.utcnow() > verification_data["expires_at"]:
            logger.warning(f"Verification code expired for {email}")
            del _verification_codes[email_lower]
            return False
        
        # Check attempts
        if verification_data["attempts"] >= MAX_ATTEMPTS:
            logger.warning(f"Max verification attempts reached for {email}")
            del _verification_codes[email_lower]
            return False
        
        # Increment attempts
        verification_data["attempts"] += 1
        
        # Verify code
        if verification_data["code"] == code:
            # Code is correct, mark as verified but don't delete yet (needed for signup)
            verification_data["verified"] = True
            _verified_emails[email_lower] = datetime.utcnow() + timedelta(minutes=VERIFICATION_VALID_MINUTES)
            logger.info(f"Verification code verified for {email} (code kept for signup)")
            return True
        else:
            logger.warning(f"Invalid verification code for {email} (attempt {verification_data['attempts']})")
            return False


def is_email_verified(email: str) -> bool:
    """
    Check if email has been verified (within validity period)
    
    Returns:
        True if email is verified and verification is still valid, False otherwise
    """
    email_lower = email.lower()
    with _lock:
        if email_lower in _verified_emails:
            if datetime.utcnow() < _verified_emails[email_lower]:
                return True
            else:
                # Verification expired
                del _verified_emails[email_lower]
                return False
        return False


def remove_verification_code(email: str) -> None:
    """Remove verification code (after successful signup)"""
    with _lock:
        email_lower = email.lower()
        if email_lower in _verification_codes:
            del _verification_codes[email_lower]
        if email_lower in _verified_emails:
            del _verified_emails[email_lower]
        logger.info(f"Removed verification code for {email}")


def cleanup_expired_codes() -> None:
    """Remove expired verification codes (can be called periodically)"""
    with _lock:
        now = datetime.utcnow()
        expired_emails = [
            email for email, data in _verification_codes.items()
            if now > data["expires_at"]
        ]
        for email in expired_emails:
            del _verification_codes[email]
        if expired_emails:
            logger.info(f"Cleaned up {len(expired_emails)} expired verification codes")

