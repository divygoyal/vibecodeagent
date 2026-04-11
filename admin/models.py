"""
Database Models
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine
from datetime import datetime

Base = declarative_base()


class User(Base):
    """User subscription and container info"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    # Identity
    email = Column(String(255), unique=True, index=True)  # Primary identity
    github_id = Column(String(50), unique=True, nullable=True, index=True) # Legacy/Optional
    github_username = Column(String(100), nullable=True)
    
    # Subscription
    plan = Column(String(20), default="free")  # free, starter, growth, pro
    subscription_start = Column(DateTime)
    subscription_end = Column(DateTime)
    
    # Container
    container_id = Column(String(100))  # Docker container ID
    container_name = Column(String(100))
    container_port = Column(Integer)
    telegram_bot_token = Column(String(255))
    
    # API Keys (user's own keys)
    gemini_api_key = Column(String(255))
    # github_token moved to OAuthConnection table, kept here only for migration temporary
    
    # Custom Config
    custom_rules = Column(Text)  # JSON string of custom rules
    enabled_plugins = Column(Text)  # JSON string of plugin list
    
    # Credits (for AI chat usage)
    credits = Column(Integer, default=10)  # Start with 10 free credits

    # Subscription (Dodo Payments)
    subscription_id = Column(String(100), nullable=True)  # Dodo subscription ID
    telegram_bot_enabled = Column(Boolean, default=False)  # Pro plan perk
    subscription_cancelled = Column(Boolean, default=False)  # True when user cancelled but plan still active

    # Bot Settings
    bot_engine = Column(String(50), default="openclaw")  # openclaw or nanobot
    
    # Status
    is_active = Column(Boolean, default=True)
    container_status = Column(String(20), default="stopped")  # running, stopped, error
    last_health_check = Column(DateTime)
    restart_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OAuthConnection(Base):
    """Generic OAuth connections for any provider (GitHub, Google, WordPress, etc)"""
    __tablename__ = "oauth_connections"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    provider = Column(String(50), nullable=False)  # github, google, wordpress
    provider_account_id = Column(String(255), nullable=False)  # ID from provider
    
    # Tokens
    access_token = Column(Text)
    refresh_token = Column(Text)
    expires_at = Column(Integer)  # Unix timestamp
    token_type = Column(String(50))
    scope = Column(Text)
    id_token = Column(Text)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UsageLog(Base):
    """Track daily usage for rate limiting"""
    __tablename__ = "usage_logs"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD
    message_count = Column(Integer, default=0)
    token_count = Column(Integer, default=0)


class ContainerEvent(Base):
    """Log container lifecycle events"""
    __tablename__ = "container_events"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    container_id = Column(String(100))
    event_type = Column(String(50))  # start, stop, restart, crash, health_fail
    details = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    """System alerts"""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)
    severity = Column(String(20))  # info, warning, error, critical
    message = Column(Text)
    user_id = Column(Integer)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime)


class EmbedToken(Base):
    """Tokens that authorize public embed pages to fetch GA4 realtime data"""
    __tablename__ = "embed_tokens"

    id = Column(Integer, primary_key=True)
    token = Column(String(64), unique=True, index=True, nullable=False)  # secrets.token_hex(32)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(String(100), nullable=False)  # GA4 property e.g. "properties/513732772"
    label = Column(String(100))  # user-friendly name e.g. "My Blog Globe"
    is_active = Column(Boolean, default=True)
    allowed_origins = Column(Text)  # optional JSON array e.g. '["myblog.com"]'
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime)


class SocialEmbedToken(Base):
    """Tokens that authorize public social embed pages like X and Reddit widgets"""
    __tablename__ = "social_embed_tokens"

    id = Column(Integer, primary_key=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False, index=True)
    platform = Column(String(32), nullable=False, index=True)  # x, reddit
    domain = Column(String(255), nullable=False, index=True)
    source_site_url = Column(String(500))
    label = Column(String(100))
    is_active = Column(Boolean, default=True)
    allowed_origins = Column(Text)
    config = Column(Text, default='{"visibleCards":3}')
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime)


class SharedDashboard(Base):
    """Shared public dashboard links"""
    __tablename__ = "shared_dashboards"

    id = Column(Integer, primary_key=True)
    token = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(String(100), nullable=False)
    site_url = Column(String(500))
    config = Column(Text, default='{"traffic":true,"sources":true,"pages":true,"geo":true,"seo":false}')
    views = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_viewed_at = Column(DateTime)


class ContactQuery(Base):
    """Contact form submissions from users"""
    __tablename__ = "contact_queries"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(254), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="new")  # new, read, replied
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=datetime.utcnow)


class Annotation(Base):
    """User annotations on analytics charts (product launches, campaigns, algorithm updates, etc.)"""
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    category = Column(String(30), nullable=False, default="custom")  # marketing, technical, product, algorithm_update, custom
    title = Column(String(200), nullable=False)
    description = Column(Text)
    color = Column(String(7))  # hex color override, e.g. #34d399
    url = Column(String(500))  # optional reference link
    source = Column(String(30), default="manual")  # manual, auto (for algorithm update feed)
    property_id = Column(String(100))  # GA4 property scope (null = all properties)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CustomDashboard(Base):
    """User-created customizable dashboards with drag-and-drop layout"""
    __tablename__ = "custom_dashboards"

    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    property_id = Column(String(100), nullable=False)
    site_url = Column(String(500))

    # Layout data (JSON)
    widgets = Column(Text, nullable=False, default='[]')        # JSON: WidgetConfig[]
    grid_layouts = Column(Text, nullable=False, default='{"lg":[],"md":[],"sm":[]}')
    theme = Column(Text, nullable=False, default='{}')           # JSON: DashboardTheme

    # Sharing
    is_public = Column(Boolean, default=False)
    share_token = Column(String(64), unique=True, nullable=True, index=True)
    embed_enabled = Column(Boolean, default=False)

    # Metadata
    is_template = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    views = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LeaderboardEntry(Base):
    """Public leaderboard entries — opt-in verified traffic sharing"""
    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)

    # Profile info (user-provided)
    startup_name = Column(String(100), nullable=False)
    description = Column(Text)
    website_url = Column(String(500))
    logo_url = Column(String(500))
    category = Column(String(50))  # SaaS, E-commerce, Blog, Agency, Tool, Other
    mrr_range = Column(String(30))  # $0-500, $500-1K, $1K-5K, $5K-10K, $10K+
    looking_for = Column(Text)  # JSON array: ["partner","visibility","buyer"]
    twitter_handle = Column(String(100))

    # GA4-verified stats (cron-refreshed daily)
    ga_property_id = Column(String(100))
    monthly_visitors = Column(Integer, default=0)
    monthly_pageviews = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    bounce_rate = Column(Float, default=0.0)
    avg_session_duration = Column(Float, default=0.0)
    visitor_trend = Column(Float, default=0.0)  # % change vs prev month

    # Meta
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_refreshed = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
