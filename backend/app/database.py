"""
Database configuration and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .config import settings
from .models.base import Base
# Import all models to ensure they're registered with SQLAlchemy
from .models import user, item, chat, notification, transaction, rating, item_report  # noqa: F401

# Create database engine
# For Cloud SQL, if host starts with /cloudsql/, use it as the Unix socket directory
if settings.db_host.startswith('/cloudsql/'):
    # Extract just the directory part for psycopg2
    unix_socket_path = '/cloudsql/' + settings.db_host.split('/cloudsql/')[1]
    engine = create_engine(
        settings.database_url,
        echo=(settings.log_verbosity == "full"),
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={
            "host": unix_socket_path
        }
    )
else:
    engine = create_engine(
        settings.database_url,
        echo=(settings.log_verbosity == "full"),
        pool_pre_ping=True,
        pool_recycle=300,
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """
    Database dependency for FastAPI routes
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()