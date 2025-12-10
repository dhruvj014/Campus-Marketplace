"""
Application configuration settings
"""

from pydantic_settings import BaseSettings
from pydantic import computed_field
from functools import lru_cache
from typing import List, Set, Optional
from urllib.parse import quote_plus


class Settings(BaseSettings):
    # Database Configuration (Individual Parameters)
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    db_driver: str = "postgresql"  # Only this has a default since it's unlikely to change
    
    @computed_field
    @property
    def database_url(self) -> str:
        """Compile database URL from individual parameters"""
        # For Cloud SQL Unix sockets, don't include the socket path in the URL
        # It will be passed via connect_args in database.py
        encoded_user = quote_plus(self.db_user)
        encoded_password = quote_plus(self.db_password)
        
        if self.db_host.startswith('/cloudsql/'):
            return f"{self.db_driver}://{encoded_user}:{encoded_password}@/{self.db_name}"
        return f"{self.db_driver}://{encoded_user}:{encoded_password}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    # Security (Required from environment)
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    
    # Application
    app_name: str
    debug: bool
    
    # CORS - loaded from environment
    allowed_origins: str
    
    # AI / LLM Configuration
    # Provider options: "openai", "groq", "together", "fireworks", "deepinfra"
    llm_provider: str = "groq"  # Default to Groq (free & fast)
    openai_api_key: Optional[str] = None  # Used for OpenAI or as API key for other providers
    openai_model: str = "llama-3.3-70b-versatile"  # Default model for Groq (Llama 3.3 - updated from deprecated llama-3.1-70b-versatile)
    
    # Provider-specific base URLs (optional, will use defaults if not set)
    groq_base_url: str = "https://api.groq.com/openai/v1"
    together_base_url: str = "https://api.together.xyz/v1"
    fireworks_base_url: str = "https://api.fireworks.ai/inference/v1"
    deepinfra_base_url: str = "https://api.deepinfra.com/v1/openai"

    # Email/SMTP Configuration (Optional - for email verification)
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None

    # AWS S3 Configuration (Required for file storage)
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"
    s3_bucket_name: str
    s3_base_url: str
    
    # File uploads
    max_upload_size: int
    allowed_image_extensions: str
    
    # Logging Configuration
    log_level: str
    log_format: str
    log_to_file: bool
    log_file_path: str
    log_max_size_mb: int
    log_backup_count: int
    log_to_console: bool
    log_verbosity: str = "minimal"  # "minimal" or "full" - minimal only logs errors and important calls
    
    def get_allowed_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.allowed_origins.split(',') if origin.strip()]
    
    def get_allowed_image_extensions(self) -> Set[str]:
        """Parse image extensions from comma-separated string"""
        return {ext.strip() for ext in self.allowed_image_extensions.split(',') if ext.strip()}

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()