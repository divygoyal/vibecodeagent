"""
Database Models
"""
from sqlalchemy import Column, Integer, String, DateTime, Date, Boolean, Text, Float, JSON, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine
from datetime import datetime

from security.token_crypto import EncryptedToken

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
    
    # Tokens (encrypted at rest via EncryptedToken TypeDecorator — see admin/security/token_crypto.py)
    access_token = Column(EncryptedToken)
    refresh_token = Column(EncryptedToken)
    expires_at = Column(Integer)  # Unix timestamp
    token_type = Column(String(50))
    scope = Column(Text)
    id_token = Column(EncryptedToken)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GitHubAppInstallation(Base):
    """A GitHub App installation belonging to a user (the user installed the
    TrafficClaw GitHub App on their account/org and selected one or more repos).
    The installation_id is the stable identifier we use to mint short-lived
    server-to-server tokens via JWT exchange."""
    __tablename__ = "github_app_installations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    installation_id = Column(Integer, unique=True, nullable=False, index=True)
    account_login = Column(String(100), nullable=False)  # GitHub user/org login
    account_type = Column(String(20))  # User | Organization
    repository_selection = Column(String(20))  # selected | all
    repo_count = Column(Integer, default=0)
    suspended_at = Column(DateTime, nullable=True)
    installed_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SiteRepoLink(Base):
    """Maps a user's site (e.g. 'sc-domain:example.com') to a GitHub repo
    so the chatbot knows which repo backs which property. Set either by the
    user via the chat dropdown or by auto-match heuristics. confirmed_at is
    NULL when the link was auto-picked but not yet validated by the user."""
    __tablename__ = "site_repo_links"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    site_url = Column(String(500), nullable=False, index=True)
    repo_full_name = Column(String(255), nullable=False)  # "owner/repo"
    base_path = Column(String(500), nullable=True)  # for monorepos, e.g. "apps/web"
    branch = Column(String(100), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)  # null = auto-matched
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


class AnalyticsGoalDefinition(Base):
    """User-saved goal definitions scoped to a property"""
    __tablename__ = "analytics_goal_definitions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    goal_type = Column(String(50), nullable=False, default="page_visit")
    rule_json = Column(Text, nullable=False, default='{}')
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AnalyticsFunnelDefinition(Base):
    """User-saved funnel definitions scoped to a property"""
    __tablename__ = "analytics_funnel_definitions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    property_id = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    steps_json = Column(Text, nullable=False, default='[]')
    is_active = Column(Boolean, default=True)
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

    # Verification (GA4 property defaultUri vs claimed website_url host)
    verified_host = Column(String(255))
    verification_status = Column(String(20), default='pending')  # verified | host_mismatch | pending | failed
    primary_country = Column(String(2))  # ISO-2 from GA4 top-country during refresh

    # Meta
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_refreshed = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatThread(Base):
    """A persisted AI-chat conversation thread.

    Phase B-1 (memory) — moves chat from client-only localStorage to server-side
    storage so conversations survive cache clears, sync across devices, and
    can be summarized into a rolling-context block. The localStorage cache stays
    as a fast read path; the server is the source of truth.

    summary: Flash-Lite-generated rolling summary of older turns (refreshed
    every 6 turns by the chat route). Allows long conversations to fit in
    context without pruning.
    """
    __tablename__ = "chat_threads"

    id = Column(String(36), primary_key=True)  # client-generated UUID
    user_id = Column(Integer, nullable=False, index=True)
    title = Column(String(255))                 # auto-generated from first user message
    persona = Column(String(40))                # diagnostic | opportunity | content_brief | etc. (B3)
    site_url = Column(String(500))              # site context active at thread creation
    repo = Column(String(255))                  # owner/repo if linked
    summary = Column(Text)                      # Flash-Lite rolling summary of older turns
    summary_updated_at_msg = Column(Integer, default=0)  # last message index summarized
    archived = Column(Boolean, default=False)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessage(Base):
    """A single turn within a ChatThread."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True)
    thread_id = Column(String(36), nullable=False, index=True)
    role = Column(String(20), nullable=False)   # user | assistant
    content = Column(Text)
    tools_json = Column(Text)                   # JSON array of {name,args,result,structuredData}
    model = Column(String(60))
    intent = Column(String(40))                 # intent classified by IntentRouter (B2)
    input_tokens = Column(Integer)
    output_tokens = Column(Integer)
    latency_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ChatFact(Base):
    """Durable user-level facts extracted from conversations.

    Phase B-1 — fact-extraction layer. After each assistant turn the chat
    route fires a Flash-Lite call that pulls out durable facts (KPI prefs,
    business model, brand voice, past commitments) as JSON. Facts persist
    across threads and get injected into every system prompt as
    [USER FACTS] context.

    scope: 'global' | 'site' | 'repo' | 'correction' (last one for things
    the user explicitly corrected the model on).
    confidence: 0.0–1.0; we only inject facts above 0.6 by default.
    """
    __tablename__ = "chat_facts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    scope = Column(String(20), nullable=False, default='global')
    scope_value = Column(String(255))           # e.g. site_url for scope='site', repo for scope='repo'
    key = Column(String(80), nullable=False, index=True)
    value = Column(Text, nullable=False)
    confidence = Column(Float, default=0.7)
    source_message_id = Column(Integer)
    source_thread_id = Column(String(36))
    superseded_at = Column(DateTime, nullable=True)  # set when a newer fact overrides
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatEmbedding(Base):
    """Embedded chat exchanges + facts for semantic recall (B1-full).

    A row stores a vector representation of a piece of text (a Q&A turn
    or a durable fact) so that future turns can retrieve the most
    semantically relevant past content via cosine similarity.

    source_kind:
      'turn'  — one Q&A pair from a thread (concatenated user+assistant)
      'fact'  — a durable user fact (from chat_facts)

    vector_json: JSON-serialized array of floats. We don't have sqlite-vec
    available so retrieval is brute-force cosine in Python. Acceptable up
    to ~5k vectors per user; beyond that we'll need a real vector index.

    dim: dimensionality of the embedding model output (768 for Gemini's
    text-embedding-004). Stored explicitly so we can detect
    model-mismatch on retrieval.
    """
    __tablename__ = "chat_embeddings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    source_kind = Column(String(20), nullable=False)
    source_id = Column(String(64), nullable=False)  # message_id or fact_id (string for flexibility)
    thread_id = Column(String(36), index=True)
    text_excerpt = Column(Text)                     # First 600 chars of the embedded text — for display in [RECALL] block
    vector_json = Column(Text, nullable=False)      # JSON array of floats
    dim = Column(Integer, nullable=False)
    model = Column(String(60), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ChatFeedback(Base):
    """User feedback (👍/👎 + optional reason) on individual assistant messages.

    Phase B-6 minimal — drives a simple thumbs-up rate metric and feeds the
    `correction` scope of ChatFact when users mark "hallucinated" or edit
    a message factually.

    rating: 'up' | 'down'.
    reason: structured tag like 'wrong_number' | 'hallucinated' | 'too_long' |
            'wrong_format' | 'missed_point' | 'other'.
    """
    __tablename__ = "chat_feedback"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    message_id = Column(Integer, nullable=False, index=True)
    thread_id = Column(String(36), index=True)
    rating = Column(String(10), nullable=False)
    reason = Column(String(40))
    comment = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class LeaderboardStatsHistory(Base):
    """Per-day snapshot of a leaderboard entry's stats — powers sparkline + weekly digest."""
    __tablename__ = "leaderboard_stats_history"

    id = Column(Integer, primary_key=True)
    entry_id = Column(Integer, nullable=False, index=True)
    recorded_on = Column(Date, nullable=False, index=True)
    monthly_visitors = Column(Integer, default=0)
    monthly_pageviews = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    bounce_rate = Column(Float, default=0.0)
    avg_session_duration = Column(Float, default=0.0)
    visitor_trend = Column(Float, default=0.0)
    rank_overall = Column(Integer)
    rank_in_category = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint('entry_id', 'recorded_on', name='uq_leaderboard_history_day'),)
