"""
Email utility for sending verification codes
"""

import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from ..config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


def generate_verification_code(length: int = 6) -> str:
    """Generate a random numeric verification code"""
    return ''.join(random.choices(string.digits, k=length))


def send_verification_email(email: str, code: str) -> bool:
    """
    Send verification code to user's email
    
    Args:
        email: Recipient email address
        code: Verification code to send
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Get SMTP settings from environment (with defaults for development)
        smtp_host = getattr(settings, 'smtp_host', 'smtp.gmail.com')
        smtp_port = getattr(settings, 'smtp_port', 587)
        smtp_user = getattr(settings, 'smtp_user', '')
        smtp_password = getattr(settings, 'smtp_password', '')
        smtp_from_email = getattr(settings, 'smtp_from_email', '') or smtp_user
        
        # If SMTP is not configured, log and return False
        if not smtp_user or not smtp_password:
            logger.warning(f"SMTP not configured. Verification code for {email}: {code}")
            logger.warning("In production, configure SMTP settings in .env file")
            # In debug mode, still log the code but don't send email
            debug_mode = getattr(settings, 'debug', False)
            if debug_mode:
                logger.info(f"DEBUG MODE: Email would be sent to {email} with code {code}")
            return False
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = smtp_from_email
        msg['To'] = email
        msg['Subject'] = "Email Verification Code - Campus Marketplace"
        
        # Email body
        body = f"""
        <html>
          <body>
            <h2>Email Verification</h2>
            <p>Thank you for signing up for Campus Marketplace!</p>
            <p>Your verification code is: <strong style="font-size: 24px; color: #2563eb;">{code}</strong></p>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">Campus Marketplace Team</p>
          </body>
        </html>
        """
        
        msg.attach(MIMEText(body, 'html'))
        
        # Send email
        try:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
            
            logger.info(f"Verification email sent successfully to {email}")
            return True
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP authentication failed for {smtp_user}: {str(e)}")
            logger.error("Please check your SMTP_USER and SMTP_PASSWORD in .env file")
            raise
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error while sending email to {email}: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending email to {email}: {str(e)}")
            raise
        
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {str(e)}", exc_info=True)
        return False

