"""
Main FastAPI application entry point for Campus Marketplace
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import engine, Base
from app.routes import auth, users, items, admin, files, chat, notifications
from app.config import settings
from app.core.logging import setup_logging, get_logger
from app.middleware.logging import LoggingMiddleware

# Initialize logging before anything else
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    """
    logger.info("Starting Campus Marketplace API")
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
    yield
    logger.info("Shutting down Campus Marketplace API")


# Create FastAPI application
app = FastAPI(
    title="Campus Marketplace API",
    description="Buy and sell textbooks, gadgets, and essentials within campus",
    version="1.0.0",
    lifespan=lifespan
)

# Add logging middleware (should be first)
app.add_middleware(LoggingMiddleware)

# Configure CORS
origins = settings.get_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],  # Allow all origins if "*" is set
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Extracted-Criteria", "X-Filters-Relaxed", "X-Requested-Condition", "X-Requested-Price", "X-Requested-Category", "X-Extraction-Method"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(items.router, prefix="/api/items", tags=["Items"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(files.router, prefix="/api/files", tags=["File Management"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])

logger.info("All routes registered successfully")


@app.get("/")
async def root():
    return {"message": "Welcome to Campus Marketplace API"}


@app.get("/health")
async def health_check():
    logger.info("Health check requested")
    return {
        "status": "healthy",
        "service": "Campus Marketplace API",
        "version": "1.0.0"
    }


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting development server")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)