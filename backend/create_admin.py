"""
Script to create an admin user for testing
Usage: python create_admin.py
"""

import sys
import os
# Add parent directory to path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.user import User
from app.auth.jwt_handler import get_password_hash
from app.enums.user import UserRole

def create_admin_user():
    """Create an admin user"""
    db: Session = SessionLocal()
    
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.username == "admin").first()
        if existing_admin:
            print(f"Admin user already exists with username: {existing_admin.username}")
            print(f"Email: {existing_admin.email}")
            return
        
        # Create admin user
        admin_user = User(
            email="admin@marketplace.com",
            username="admin",
            hashed_password=get_password_hash("admin123"),  # Change this password!
            full_name="Admin User",
            phone=None,
            student_id="ADMIN001",
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
            created_by="system"
        )
        
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        
        print("=" * 50)
        print("Admin user created successfully!")
        print("=" * 50)
        print(f"Username: {admin_user.username}")
        print(f"Email: {admin_user.email}")
        print(f"Password: admin123")
        print(f"Security Question Answer: Baahubali")
        print("=" * 50)
        print("\n⚠️  IMPORTANT: Change the password after first login!")
        print("=" * 50)
        
    except Exception as e:
        db.rollback()
        print(f"Error creating admin user: {str(e)}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    create_admin_user()

