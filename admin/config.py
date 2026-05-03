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
    MAX_USERS: int = 50    # Override via MAX_USERS env var for your server capacity
    
    # Paths
    PLUGINS_DIR: str = "/home/ubuntu/vibecodeagent/plugins" # Host path for plugins (skills)
    DATA_DIR: str = "/home/ubuntu/clawbot-data"  # Host path for per-user /data volumes
    
    # Resource Limits (per container)
    # OpenClaw needs significant RAM - Node.js heap + system overhead
    MEMORY_LIMIT_FREE: str = "1536m"     # 1.5GB for free tier (768MB heap + overhead)
    MEMORY_LIMIT_STARTER: str = "2g"     # 2GB for starter
    MEMORY_LIMIT_GROWTH: str = "3g"      # 3GB for growth
    MEMORY_LIMIT_PRO: str = "4g"         # 4GB for pro
    CPU_LIMIT_FREE: float = 0.5
    CPU_LIMIT_STARTER: float = 1.0
    CPU_LIMIT_GROWTH: float = 1.5
    CPU_LIMIT_PRO: float = 2.0
    
    # API Keys (for shared key mode)
    GEMINI_API_KEY: Optional[str] = None
    
    # OAuth Credentials (injected into containers)
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GITHUB_CLIENT_ID: Optional[str] = None
    GITHUB_CLIENT_SECRET: Optional[str] = None

    # GitHub App (Phase 2 — selective per-repo access via installation tokens).
    # App ID + Client ID are NOT secret. Client Secret + Private Key MUST be in
    # Coolify env vars only — never committed. Slug is the kebab-case App name
    # used in the install URL (https://github.com/apps/<slug>/installations/new).
    GITHUB_APP_ID: Optional[str] = None
    GITHUB_APP_CLIENT_ID: Optional[str] = None
    GITHUB_APP_CLIENT_SECRET: Optional[str] = None
    GITHUB_APP_PRIVATE_KEY: Optional[str] = None
    GITHUB_APP_SLUG: Optional[str] = None

    # OAuth token encryption-at-rest (Fernet key, base64). Generate:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If unset, oauth_connections tokens are stored plaintext (dev mode).
    OAUTH_TOKEN_ENC_KEY: Optional[str] = None

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
        "features": ["basic_chat", "github-ghost"],
        "price_usd": 9
    },
    "growth": {
        "memory_limit": settings.MEMORY_LIMIT_GROWTH,
        "cpu_limit": settings.CPU_LIMIT_GROWTH,
        "max_daily_messages": 2000,
        "features": ["basic_chat", "github-ghost", "google-search-console", "google-analytics"],
        "price_usd": 19
    },
    "pro": {
        "memory_limit": settings.MEMORY_LIMIT_PRO,
        "cpu_limit": settings.CPU_LIMIT_PRO,
        "max_daily_messages": 5000,
        "features": ["basic_chat", "github-ghost", "google-search-console", "google-analytics", "custom_rules"],
        "price_usd": 29
    }
}
