"""
Comprehensive logging configuration for Campus Marketplace Backend
"""

import logging
import logging.handlers
import os
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Any, Dict
from ..config import settings


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for console output"""
    
    # Color codes
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
        'RESET': '\033[0m'       # Reset
    }
    
    def format(self, record):
        # Add color to level name
        if hasattr(record, 'levelname'):
            levelname = record.levelname
            if levelname in self.COLORS:
                record.levelname = f"{self.COLORS[levelname]}{levelname}{self.COLORS['RESET']}"
        
        return super().format(record)


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""
    
    def format(self, record):
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        
        # Add extra fields if present
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                          'filename', 'module', 'lineno', 'funcName', 'created',
                          'msecs', 'relativeCreated', 'thread', 'threadName',
                          'processName', 'process', 'exc_info', 'exc_text', 'stack_info']:
                log_entry[key] = value
        
        return json.dumps(log_entry, default=str)


class RequestFormatter(logging.Formatter):
    """Custom formatter for HTTP requests"""
    
    def format(self, record):
        # Enhance record with request info if available
        if hasattr(record, 'request_id'):
            self._style._fmt = f"[{record.request_id}] " + self._style._fmt
        
        return super().format(record)


def setup_logging():
    """
    Configure logging for the entire application
    """
    # Create logs directory if it doesn't exist
    log_file_path = Path(settings.log_file_path)
    log_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Setup formatters based on configuration
    formatters = {
        'simple': logging.Formatter(
            fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ),
        'detailed': logging.Formatter(
            fmt='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(funcName)s() - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ),
        'json': JSONFormatter()
    }
    
    selected_formatter = formatters.get(settings.log_format, formatters['detailed'])
    
    # Console handler
    if settings.log_to_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.DEBUG)
        
        # Use colored formatter for console in development
        if settings.debug and settings.log_format != 'json':
            console_formatter = ColoredFormatter(
                fmt='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            console_handler.setFormatter(console_formatter)
        else:
            console_handler.setFormatter(selected_formatter)
        
        root_logger.addHandler(console_handler)
    
    # File handler with rotation
    if settings.log_to_file:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=settings.log_file_path,
            maxBytes=settings.log_max_size_mb * 1024 * 1024,  # Convert MB to bytes
            backupCount=settings.log_backup_count,
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(selected_formatter)
        root_logger.addHandler(file_handler)
    
    # Error file handler (separate file for errors)
    error_log_path = log_file_path.parent / "error.log"
    error_handler = logging.handlers.RotatingFileHandler(
        filename=error_log_path,
        maxBytes=settings.log_max_size_mb * 1024 * 1024,
        backupCount=settings.log_backup_count,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(selected_formatter)
    root_logger.addHandler(error_handler)
    
    # Configure third-party loggers
    configure_third_party_loggers()
    
    # Log the setup completion
    logger = logging.getLogger(__name__)
    logger.info("Logging system initialized successfully")
    logger.info(f"Log Level: {settings.log_level}")
    logger.info(f"Log Format: {settings.log_format}")
    logger.info(f"Log Verbosity: {settings.log_verbosity}")
    logger.info(f"Log to File: {settings.log_to_file}")
    logger.info(f"Log to Console: {settings.log_to_console}")


def configure_third_party_loggers():
    """Configure logging levels for third-party libraries"""
    from ..config import settings
    # Reduce verbosity of third-party libraries
    # In minimal mode, suppress SQLAlchemy queries completely
    if settings.log_verbosity == "minimal":
        logging.getLogger("uvicorn").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.access").setLevel(logging.ERROR)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)
        logging.getLogger("sqlalchemy.dialects").setLevel(logging.ERROR)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.ERROR)
        logging.getLogger("sqlalchemy").setLevel(logging.ERROR)
    else:
        logging.getLogger("uvicorn").setLevel(logging.INFO)
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: str = None) -> logging.Logger:
    """
    Get a logger instance with optional name
    
    Args:
        name: Logger name (defaults to calling module)
        
    Returns:
        logging.Logger: Configured logger instance
    """
    if name is None:
        # Get the calling module name
        import inspect
        frame = inspect.currentframe().f_back
        name = frame.f_globals.get('__name__', 'unknown')
    
    return logging.getLogger(name)


def log_request(logger: logging.Logger, method: str, url: str, status_code: int, 
                duration: float, user_id: str = None, request_id: str = None, verbosity: str = "minimal"):
    """
    Log HTTP request information
    
    Args:
        logger: Logger instance
        method: HTTP method
        url: Request URL
        status_code: Response status code
        duration: Request duration in seconds
        user_id: Optional user ID
        request_id: Optional request ID for tracing
        verbosity: "minimal" or "full" - minimal only logs errors and important calls
    """
    extra = {
        'method': method,
        'url': url,
        'status_code': status_code,
        'duration': f"{duration:.3f}s",
        'user_id': user_id,
        'request_id': request_id
    }
    
    # In minimal mode, only log errors, warnings, and important endpoints
    if verbosity == "minimal":
        if status_code >= 500:
            logger.error(f"{method} {url} - {status_code} - {duration:.3f}s", extra=extra)
        elif status_code >= 400:
            logger.warning(f"{method} {url} - {status_code} - {duration:.3f}s", extra=extra)
        else:
            # Skip successful requests in minimal mode to keep the terminal clean
            return
    else:
        # Full mode - log everything
        if status_code >= 500:
            logger.error(f"{method} {url} - {status_code} - {duration:.3f}s", extra=extra)
        elif status_code >= 400:
            logger.warning(f"{method} {url} - {status_code} - {duration:.3f}s", extra=extra)
        else:
            logger.info(f"{method} {url} - {status_code} - {duration:.3f}s", extra=extra)


def log_database_operation(logger: logging.Logger, operation: str, table: str, 
                          duration: float = None, record_count: int = None, 
                          error: Exception = None):
    """
    Log database operations
    
    Args:
        logger: Logger instance
        operation: Database operation (SELECT, INSERT, UPDATE, DELETE)
        table: Table name
        duration: Optional operation duration
        record_count: Optional number of records affected
        error: Optional exception if operation failed
    """
    extra = {
        'operation': operation,
        'table': table,
        'duration': f"{duration:.3f}s" if duration else None,
        'record_count': record_count
    }
    
    if error:
        logger.error(f"Database {operation} failed on {table}: {str(error)}", 
                    extra=extra, exc_info=True)
    else:
        msg = f"Database {operation} on {table}"
        if duration:
            msg += f" completed in {duration:.3f}s"
        if record_count is not None:
            msg += f" ({record_count} records)"
        logger.debug(msg, extra=extra)


def log_auth_event(logger: logging.Logger, event: str, user_id: str = None, 
                   email: str = None, ip_address: str = None, success: bool = True, 
                   reason: str = None):
    """
    Log authentication events
    
    Args:
        logger: Logger instance
        event: Auth event type (login, logout, register, token_refresh, etc.)
        user_id: Optional user ID
        email: Optional user email
        ip_address: Optional client IP
        success: Whether the event was successful
        reason: Optional failure reason
    """
    extra = {
        'event': event,
        'user_id': user_id,
        'email': email,
        'ip_address': ip_address,
        'success': success,
        'reason': reason
    }
    
    status = "successful" if success else "failed"
    msg = f"Auth event '{event}' {status}"
    
    if user_id:
        msg += f" for user {user_id}"
    elif email:
        msg += f" for email {email}"
    
    if not success and reason:
        msg += f": {reason}"
    
    if success:
        logger.info(msg, extra=extra)
    else:
        logger.warning(msg, extra=extra)


def log_business_event(logger: logging.Logger, event: str, details: Dict[str, Any] = None):
    """
    Log business/application events
    
    Args:
        logger: Logger instance
        event: Business event description
        details: Optional event details
    """
    extra = {'event_type': 'business', 'details': details or {}}
    logger.info(f"Business Event: {event}", extra=extra)