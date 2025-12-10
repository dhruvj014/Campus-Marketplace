"""
Logging middleware for FastAPI requests
"""

import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from ..core.logging import get_logger, log_request
import logging

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log HTTP requests and responses
    """
    
    async def dispatch(self, request: Request, call_next):
        # Generate unique request ID for tracing
        request_id = str(uuid.uuid4())[:8]
        
        # Add request ID to request state
        request.state.request_id = request_id
        
        # Start timing
        start_time = time.time()
        
        # Get client IP
        client_ip = self.get_client_ip(request)
        
        # Get user info if available (from JWT token)
        user_id = None
        try:
            # This will be available after authentication middleware
            if hasattr(request.state, 'user'):
                user_id = getattr(request.state.user, 'id', None)
        except:
            pass
        
        # Log request start only in full verbosity mode
        from ..config import settings
        if settings.log_verbosity == "full":
            logger.info(
                f"Request started: {request.method} {request.url.path}",
                extra={
                    'request_id': request_id,
                    'method': request.method,
                    'url': str(request.url),
                    'client_ip': client_ip,
                    'user_agent': request.headers.get('user-agent', ''),
                    'user_id': user_id
                }
            )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration = time.time() - start_time
            
            # Log request completion (respects verbosity setting)
            from ..config import settings
            log_request(
                logger=logger,
                method=request.method,
                url=str(request.url),
                status_code=response.status_code,
                duration=duration,
                user_id=user_id,
                request_id=request_id,
                verbosity=settings.log_verbosity
            )
            
            # Add request ID to response headers for debugging
            response.headers["X-Request-ID"] = request_id
            
            return response
            
        except Exception as e:
            # Calculate duration
            duration = time.time() - start_time
            
            # Log error
            logger.error(
                f"Request failed: {request.method} {request.url.path} - {str(e)}",
                extra={
                    'request_id': request_id,
                    'method': request.method,
                    'url': str(request.url),
                    'duration': f"{duration:.3f}s",
                    'error': str(e),
                    'user_id': user_id
                },
                exc_info=True
            )
            
            # Re-raise the exception
            raise
    
    def get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request"""
        # Check for forwarded headers (when behind proxy/load balancer)
        forwarded_for = request.headers.get('x-forwarded-for')
        if forwarded_for:
            # Take the first IP in the chain
            return forwarded_for.split(',')[0].strip()
        
        forwarded = request.headers.get('x-forwarded')
        if forwarded:
            return forwarded.split(',')[0].strip()
        
        real_ip = request.headers.get('x-real-ip')
        if real_ip:
            return real_ip.strip()
        
        # Fallback to client host
        if request.client:
            return request.client.host
        
        return "unknown"


class DatabaseLoggingMiddleware:
    """
    Context manager for database operation logging
    """
    
    def __init__(self, operation: str, table: str, logger: logging.Logger = None):
        self.operation = operation
        self.table = table
        self.logger = logger or get_logger('database')
        self.start_time = None
        self.record_count = None
    
    def __enter__(self):
        self.start_time = time.time()
        self.logger.debug(f"Starting {self.operation} on {self.table}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        
        from ..core.logging import log_database_operation
        log_database_operation(
            logger=self.logger,
            operation=self.operation,
            table=self.table,
            duration=duration,
            record_count=self.record_count,
            error=exc_val if exc_type else None
        )
    
    def set_record_count(self, count: int):
        """Set the number of records affected"""
        self.record_count = count


# Utility function to add request context to logs
def add_request_context(logger: logging.Logger, request: Request = None):
    """
    Add request context to logger for correlation
    """
    if request and hasattr(request.state, 'request_id'):
        return logging.LoggerAdapter(
            logger, 
            {'request_id': request.state.request_id}
        )
    return logger