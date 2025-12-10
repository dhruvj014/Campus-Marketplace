"""
Script to add missing columns to item_reports table
Run this script to update your database schema
"""

import sys
from sqlalchemy import text
from app.database import engine
from app.config import settings

def run_migration():
    """Add description and item_snapshot columns to item_reports table"""
    
    print("Running migration: Adding description and item_snapshot columns to item_reports...")
    
    try:
        with engine.connect() as conn:
            # Add description column
            conn.execute(text("""
                ALTER TABLE item_reports 
                ADD COLUMN IF NOT EXISTS description TEXT
            """))
            
            # Add item_snapshot column (using JSONB for PostgreSQL)
            conn.execute(text("""
                ALTER TABLE item_reports 
                ADD COLUMN IF NOT EXISTS item_snapshot JSONB
            """))
            
            # Commit the changes
            conn.commit()
            
            print("✓ Successfully added 'description' column")
            print("✓ Successfully added 'item_snapshot' column")
            print("\nMigration completed successfully!")
            
    except Exception as e:
        print(f"✗ Error running migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()

