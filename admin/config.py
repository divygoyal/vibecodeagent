"""
Admin API Configuration
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/admin.db"
    
    # Docker
    DOCKER_SOCKET: str = "/var/run/docker.sock"
    OPENCLAW_IMAGE: str = "ghcr.io/openclaw/openclaw:latest"
    CONTAINER_PREFIX: str = "clawbot"
    
    # Network
    BASE_PORT: int = 9000  # First user gets 9000, second 9001, etc.
    MAX_USERS: int = 50    # Max containers on 16GB RAM
    
    # Resource Limits (per container)
    MEMORY_LIMIT_FREE: str = "256m"
    MEMORY_LIMIT_STARTER: str = "512m"
    MEMORY_LIMIT_PRO: str = "1g"
    CPU_LIMIT_FREE: float = 0.25
    CPU_LIMIT_STARTER: float = 0.5
    CPU_LIMIT_PRO: float = 1.0
    
    # API Keys (for shared key mode)
    GEMINI_API_KEY: Optional[str] = None
    
    # Alerts
    TELEGRAM_ADMIN_BOT_TOKEN: Optional[str] = None
    TELEGRAM_ADMIN_CHAT_ID: Optional[str] = None
    
    # Admin Auth
    ADMIN_API_KEY: str = "change-this-in-production"
    
    # Watchdog
    HEALTH_CHECK_INTERVAL: int = 60  # seconds
    MAX_RESTART_ATTEMPTS: int = 3
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


# Subscription Plans
PLANS = {
    "free": {
        "memory_limit": settings.MEMORY_LIMIT_FREE,
        "cpu_limit": settings.CPU_LIMIT_FREE,
        "max_daily_messages": 50,
        "features": ["basic_chat"],
        "price_usd": 0
    },
    "starter": {
        "memory_limit": settings.MEMORY_LIMIT_STARTER,
        "cpu_limit": settings.CPU_LIMIT_STARTER,
        "max_daily_messages": 500,
        "features": ["basic_chat", "github_plugin"],
        "price_usd": 30
    },
    "pro": {
        "memory_limit": settings.MEMORY_LIMIT_PRO,
        "cpu_limit": settings.CPU_LIMIT_PRO,
        "max_daily_messages": 5000,
        "features": ["basic_chat", "github_plugin", "gsc_plugin", "analytics_plugin", "custom_rules"],
        "price_usd": 50
    }
}
