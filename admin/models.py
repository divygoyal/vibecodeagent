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
    github_id = Column(String(50), unique=True, nullable=False, index=True)
    github_username = Column(String(100))
    email = Column(String(255))
    
    # Subscription
    plan = Column(String(20), default="free")  # free, starter, pro
    subscription_start = Column(DateTime)
    subscription_end = Column(DateTime)
    
    # Container
    container_id = Column(String(100))  # Docker container ID
    container_name = Column(String(100))
    container_port = Column(Integer)
    telegram_bot_token = Column(String(255))
    
    # API Keys (user's own keys)
    gemini_api_key = Column(String(255))
    github_token = Column(String(255))
    
    # Custom Config
    custom_rules = Column(Text)  # JSON string of custom rules
    enabled_plugins = Column(Text)  # JSON string of plugin list
    
    # Status
    is_active = Column(Boolean, default=True)
    container_status = Column(String(20), default="stopped")  # running, stopped, error
    last_health_check = Column(DateTime)
    restart_count = Column(Integer, default=0)
    
    # Timestamps
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
