"""
ClawBot Admin API
Manages user containers, subscriptions, and monitoring
"""
import asyncio
from fastapi import FastAPI, HTTPException, Depends, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta, date
import json
import docker
import logging
import secrets
import subprocess
import os
import requests
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, delete, text, func, or_, case
from contextlib import asynccontextmanager

from config import settings, PLANS
from models import Base, User, OAuthConnection, UsageLog, ContainerEvent, Alert, ContactQuery, SupportMessage, EmbedToken, SocialEmbedToken, SharedDashboard, LeaderboardEntry, LeaderboardStatsHistory, Annotation, CustomDashboard, AnalyticsGoalDefinition, AnalyticsFunnelDefinition, SiteRepoLink, GitHubAppInstallation, ChatThread, ChatMessage, ChatFact, ChatFeedback, ChatEmbedding, ChatThreadState, ChatTelemetryEvent, WeeklyDigest
from services.github_app_tokens import (
    get_installation_token as github_app_get_installation_token,
    fetch_installation_metadata as github_app_fetch_installation_metadata,
    list_installation_repositories as github_app_list_installation_repositories,
    invalidate as github_app_invalidate_token,
)
from services import brevo as brevo_service
from security.github_app_jwt import is_configured as github_app_is_configured
from docker_manager import docker_manager


# ============= Database Setup =============
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _ensure_multisite_leaderboard_schema(conn) -> str:
    """Drop any legacy UNIQUE constraint/index on leaderboard_entries.user_id.

    Idempotent and safe to run on every boot — and as a fallback inside the
    join endpoint when an IntegrityError reveals the startup migration hasn't
    been picked up yet.

    Returns one of: "migrated", "already-ok", "no-table".
    """
    import re as _re
    sql_row = (await conn.execute(
        text("SELECT sql FROM sqlite_master WHERE type='table' AND name='leaderboard_entries'")
    )).fetchone()
    if not sql_row:
        return "no-table"
    create_sql = sql_row[0] or ""
    normalized = " ".join(create_sql.split())
    has_unique_user_id = bool(
        _re.search(r"\buser_id\b[^,\)]*\bUNIQUE\b", normalized, _re.IGNORECASE)
        or _re.search(r"\bUNIQUE\s*\(\s*user_id\s*\)", normalized, _re.IGNORECASE)
    )
    if not has_unique_user_id:
        # Older SQLAlchemy builds can materialize `unique=True, index=True` as
        # a standalone unique index instead of an inline table constraint. The
        # second-site join bug only shows up on that schema shape, so inspect
        # SQLite's index metadata too.
        index_rows = (await conn.execute(
            text("PRAGMA index_list(leaderboard_entries)")
        )).fetchall()
        for idx in index_rows:
            idx_name = str(idx[1] or "")
            is_unique = bool(idx[2])
            if not idx_name or not is_unique:
                continue
            safe_idx_name = idx_name.replace("'", "''")
            idx_cols = (await conn.execute(
                text(f"PRAGMA index_info('{safe_idx_name}')")
            )).fetchall()
            col_names = [str(r[2]) for r in idx_cols if r[2] is not None]
            if col_names == ["user_id"]:
                has_unique_user_id = True
                break

    if not has_unique_user_id:
        return "already-ok"

    col_rows = (await conn.execute(
        text("PRAGMA table_info(leaderboard_entries)")
    )).fetchall()
    existing_cols = [str(r[1]) for r in col_rows]

    target_cols = [
        ("id", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("user_id", "INTEGER NOT NULL"),
        ("slug", "VARCHAR(150)"),
        ("startup_name", "VARCHAR(100) NOT NULL"),
        ("description", "TEXT"),
        ("website_url", "VARCHAR(500)"),
        ("logo_url", "VARCHAR(500)"),
        ("category", "VARCHAR(50)"),
        ("mrr_range", "VARCHAR(30)"),
        ("looking_for", "TEXT"),
        ("twitter_handle", "VARCHAR(100)"),
        ("founder_name", "VARCHAR(100)"),
        ("contact_email", "VARCHAR(255)"),
        ("ga_property_id", "VARCHAR(100)"),
        ("monthly_visitors", "INTEGER DEFAULT 0"),
        ("monthly_pageviews", "INTEGER DEFAULT 0"),
        ("engagement_rate", "FLOAT DEFAULT 0.0"),
        ("bounce_rate", "FLOAT DEFAULT 0.0"),
        ("avg_session_duration", "FLOAT DEFAULT 0.0"),
        ("visitor_trend", "FLOAT DEFAULT 0.0"),
        ("verified_host", "VARCHAR(255)"),
        ("verification_status", "VARCHAR(20) DEFAULT 'pending'"),
        ("primary_country", "VARCHAR(2)"),
        ("is_verified", "BOOLEAN DEFAULT 0"),
        ("is_active", "BOOLEAN DEFAULT 1"),
        ("last_refreshed", "DATETIME"),
        ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
        ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
    ]
    target_def = ",\n            ".join(f"{n} {d}" for n, d in target_cols)
    copy_cols = [n for n, _ in target_cols if n in existing_cols]
    copy_cols_csv = ", ".join(copy_cols)

    await conn.execute(text("PRAGMA foreign_keys = OFF"))
    try:
        # A previous failed self-heal can leave this temp table behind; clear
        # it so the migration remains retry-safe.
        await conn.execute(text("DROP TABLE IF EXISTS leaderboard_entries_v2"))
        await conn.execute(text(f"CREATE TABLE leaderboard_entries_v2 (\n            {target_def}\n        )"))
        await conn.execute(text(
            f"INSERT INTO leaderboard_entries_v2 ({copy_cols_csv}) "
            f"SELECT {copy_cols_csv} FROM leaderboard_entries"
        ))
        await conn.execute(text("DROP TABLE leaderboard_entries"))
        await conn.execute(text("ALTER TABLE leaderboard_entries_v2 RENAME TO leaderboard_entries"))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_leaderboard_entries_user_id ON leaderboard_entries(user_id)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_leaderboard_entries_slug "
            "ON leaderboard_entries(slug) WHERE slug IS NOT NULL"
        ))
    finally:
        await conn.execute(text("PRAGMA foreign_keys = ON"))
    return "migrated"


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Auto-migrate new columns for existing SQLite databases
        for col, col_def in [
            ("credits", "INTEGER DEFAULT 5"),
            ("bot_engine", "VARCHAR(50) DEFAULT 'openclaw'"),
            ("subscription_id", "VARCHAR(100)"),
            ("telegram_bot_enabled", "BOOLEAN DEFAULT 0"),
            ("subscription_cancelled", "BOOLEAN DEFAULT 0"),
            # Workspace selection (server-side single source of truth)
            ("selected_property_id", "VARCHAR(100)"),
            ("selected_site_url", "VARCHAR(500)"),
            ("selected_range", "VARCHAR(20) DEFAULT '30d'"),
            ("workspace_label", "VARCHAR(120)"),
            ("workspace_setup_completed", "BOOLEAN DEFAULT 0"),
            ("welcome_seen", "BOOLEAN DEFAULT 0"),
            # Brevo welcome-email idempotency key (015_add_welcome_email_sent_at.sql).
            # NULL on existing rows; stamped to NOW() once Brevo returns 2xx for
            # this user's welcome send. Required so SELECT * FROM users doesn't
            # trip "no such column" after the User model adds this attribute.
            ("welcome_email_sent_at", "DATETIME"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_def}"))
            except Exception:
                pass

        try:
            await conn.execute(
                text(
                    """ALTER TABLE social_embed_tokens ADD COLUMN config TEXT DEFAULT '{"visibleCards":3}'"""
                )
            )
        except Exception:
            pass

        # Leaderboard v2 columns (010_add_leaderboard_v2.sql) + v3 contact/founder
        # (012_add_contact_founder_fields). Base.metadata.create_all already creates
        # leaderboard_stats_history; ALTER is needed only for the new columns on the
        # existing leaderboard_entries table.
        for col, col_def in [
            ("verified_host", "VARCHAR(255)"),
            ("verification_status", "VARCHAR(20) DEFAULT 'pending'"),
            ("primary_country", "VARCHAR(2)"),
            ("founder_name", "VARCHAR(100)"),
            ("contact_email", "VARCHAR(255)"),
            ("slug", "VARCHAR(150)"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE leaderboard_entries ADD COLUMN {col} {col_def}"))
            except Exception:
                pass

        # Unique index on slug — separate from the column ADD because SQLite
        # won't allow inline UNIQUE on an ALTER, and we want the column adds to
        # succeed even if the index step is re-run.
        try:
            await conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_leaderboard_entries_slug "
                "ON leaderboard_entries(slug)"
            ))
        except Exception:
            pass

        # Multi-site leaderboard: drop any legacy UNIQUE constraint on
        # leaderboard_entries.user_id. Delegated to the shared helper so the
        # join endpoint can also self-heal on first IntegrityError without a
        # restart.
        try:
            result = await _ensure_multisite_leaderboard_schema(conn)
            print(f"[startup] leaderboard multi-site migration: {result}")
        except Exception as exc:
            print(f"[startup] multi-site leaderboard migration FAILED: {type(exc).__name__}: {exc}")


async def get_db():
    """Dependency for database session"""
    async with async_session() as session:
        yield session


# ============= Lifespan =============
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    import os
    os.makedirs("data", exist_ok=True)
    await init_db()

    # Auto-encrypt any pre-existing plaintext OAuth tokens.
    # Idempotent — skips rows that are already Fernet ciphertext.
    try:
        from migrations.encrypt_oauth_tokens import run as run_encrypt_migration
        result = await run_encrypt_migration(engine)
        if result.get("status") == "ok" and result.get("encrypted_fields", 0) > 0:
            print(
                f"[startup] Encrypted {result['encrypted_fields']} OAuth token field(s) "
                f"across {result['updated_rows']} row(s)."
            )
    except Exception as exc:
        print(f"[startup] OAuth token encryption migration failed: {exc}")

    # GitHub App configuration diagnostics — prints the shape of the private
    # key env var so operators can verify Coolify stored it correctly.
    try:
        from security.github_app_jwt import log_diagnostics as github_app_log_diagnostics
        github_app_log_diagnostics()
    except Exception as exc:
        print(f"[startup] GitHub App diagnostic failed: {exc}")

    # Auto-sync orphaned containers to DB
    async with async_session() as session:
        await sync_orphaned_users(session)

    yield
    # Shutdown
    pass


async def sync_orphaned_users(db: AsyncSession):
    """
    Recover users from running containers if DB is empty/desynced.
    This fixes the 'empty admin dashboard' issue after redeploys.
    """
    try:
        print("Syncing orphaned containers...")
        # Get all containers from Docker
        containers = docker_manager.get_all_containers()
        print(f"Found {len(containers)} clawbot containers")
        
        synced = 0
        for container_summary in containers:
            # New docker_manager returns user_identifier
            user_identifier = container_summary.get("user_identifier")
            if not user_identifier:
                print(f"  Skipping container without user_identifier: {container_summary.get('name')}")
                continue
                
            # Check if exists in DB (legacy lookup by github_id)
            # Todo: update to generic lookup when we have User.user_identifier
            result = await db.execute(select(User).where(User.github_id == user_identifier))
            existing = result.scalar_one_or_none()
            
            if not existing:
                print(f"  Found orphan container for {user_identifier}, recovering...")
                try:
                    data = docker_manager.inspect_container_for_sync(user_identifier)
                    if data:
                        # Parse created_at safely — Docker timestamps have nanosecond precision
                        created_at = datetime.utcnow()
                        if data.get("created_at"):
                            try:
                                raw = data["created_at"]
                                # Handle Docker format: 2024-01-15T10:30:00.123456789Z
                                raw = raw.replace("Z", "+00:00")
                                if "." in raw:
                                    parts = raw.split(".")
                                    # Get fractional part (before timezone)
                                    rest = parts[1]
                                    # Split at timezone marker
                                    for tz_char_idx, c in enumerate(rest):
                                        if c in "+-" and tz_char_idx > 0:
                                            frac = rest[:tz_char_idx][:6]  # Truncate to microseconds
                                            tz_part = rest[tz_char_idx:]
                                            raw = parts[0] + "." + frac + tz_part
                                            break
                                    else:
                                        # No timezone found, just truncate
                                        raw = parts[0] + "." + rest[:6]
                                created_at = datetime.fromisoformat(raw.replace("+00:00", ""))
                            except Exception as e:
                                print(f"    Could not parse created_at '{data.get('created_at')}': {e}, using now()")
                                created_at = datetime.utcnow()
                        
                        # Create User WITHOUT github_token (it's gone from model)
                        # We use user_identifier as github_id for now
                        user = User(
                            github_id=data["user_identifier"], 
                            github_username=data.get("github_username") or data["user_identifier"],
                            plan=data.get("plan", "free"),
                            telegram_bot_token=data.get("telegram_bot_token", ""),
                            gemini_api_key=data.get("gemini_api_key"),
                            # github_token=data.get("github_token"), # REMOVED from model
                            container_id=data.get("container_id"),
                            container_name=data.get("container_name"),
                            container_port=data.get("container_port"),
                            container_status="running",
                            subscription_start=datetime.utcnow(),
                            created_at=created_at
                        )
                        db.add(user)
                        await db.commit()
                        await db.refresh(user)

                        # If we recovered a token, save it to OAuthConnection
                        token = data.get("github_token")
                        if token:
                            oauth = OAuthConnection(
                                user_id=user.id,
                                provider="github",
                                provider_account_id=user.github_id, # Assuming user_identifier is github_id
                                access_token=token,
                                token_type="bearer",
                                created_at=datetime.utcnow(),
                                updated_at=datetime.utcnow()
                            )
                            db.add(oauth)
                            await db.commit()
                            print(f"    ✓ Recovered token for {user_identifier}")

                        synced += 1
                        print(f"    ✓ Recovered user {user_identifier}")
                    else:
                        print(f"    ✗ inspect_container_for_sync returned None for {user_identifier}")
                except Exception as e:
                    print(f"    ✗ Failed to recover {user_identifier}: {e}")
                    await db.rollback()
            else:
                print(f"  User {user_identifier} already in DB")
        
        print(f"Sync complete: {synced} users recovered from {len(containers)} containers")
    except Exception as e:
        print(f"Sync failed catastrophically: {e}")
        import traceback
        traceback.print_exc()


# ============= FastAPI App =============
app = FastAPI(
    title="ClawBot Admin API",
    description="Manage ClawBot containers and subscriptions",
    version="1.0.0",
    lifespan=lifespan
)

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,https://trafficclaw.com").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)


# ============= Auth =============
async def verify_admin_key(x_api_key: str = Header(...)):
    """Verify admin API key"""
    if x_api_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True


# ============= Pydantic Models =============
class UserCreate(BaseModel):
    github_id: Optional[str] = None
    provider: Optional[str] = None
    provider_id: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None # New
    
    github_username: Optional[str] = None
    email: Optional[str] = None
    plan: str = "free"
    telegram_bot_token: Optional[str] = None  # Optional: not required for pre-bot provider registration
    gemini_api_key: Optional[str] = None
    bot_engine: Optional[str] = None # Support bot_engine during creation
    github_token: Optional[str] = None # Input only, not stored in User model


class UserUpdate(BaseModel):
    plan: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
    github_token: Optional[str] = None # Input only
    custom_rules: Optional[str] = None
    is_active: Optional[bool] = None
    # Generic provider update
    provider: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None # New
    bot_engine: Optional[str] = None


class ContainerAction(BaseModel):
    action: str  # start, stop, restart, destroy


class UserResponse(BaseModel):
    id: int
    github_id: Optional[str]
    github_username: Optional[str]
    email: Optional[str]
    plan: str
    credits: int = 0
    container_status: str
    container_port: Optional[int]
    is_active: bool
    created_at: datetime
    bot_engine: str
    has_google: bool = False
    provider_count: int = 0
    embed_token_count: int = 0
    shared_dashboard_count: int = 0
    custom_dashboard_count: int = 0
    leaderboard_active: bool = False


# ============= Helpers =============
async def get_next_available_port(db: AsyncSession) -> int:
    """Find next available port for new container"""
    result = await db.execute(
        select(User.container_port).where(User.container_port.isnot(None))
    )
    used_ports = {row[0] for row in result.fetchall()}
    
    for port in range(settings.BASE_PORT, settings.BASE_PORT + settings.MAX_USERS):
        if port not in used_ports:
            return port
    
    raise HTTPException(status_code=503, detail="No available ports - max users reached")


async def get_user_by_identifier(db: AsyncSession, identifier: str) -> Optional[User]:
    """
    Find user by github_id OR any connected OAuth provider_account_id OR email.
    This handles cases where the user signed up via GitHub (primary ID) 
    but is now accessing via Google (secondary ID).
    """
    print(f"[DEBUG] get_user_by_identifier: Looking for '{identifier}'")

    # 1. Try direct lookup (legacy/primary ID)
    result = await db.execute(select(User).where(User.github_id == identifier))
    user = result.scalar_one_or_none()
    
    if user:
        print(f"[DEBUG] Found user by github_id: {user.id} ({user.github_id})")
        return user

    # 2. Fallback: Lookup via OAuthConnection
    # Provider account IDs can be large numeric strings (for example Google),
    # so resolve OAuth identities before attempting internal integer ID lookup.
    print(f"[DEBUG] User not found by github_id, trying OAuthConnection for '{identifier}'")
    stmt = select(OAuthConnection).where(OAuthConnection.provider_account_id == identifier)
    oauth_res = await db.execute(stmt)
    oauth = oauth_res.scalars().first()
    
    if oauth:
        print(f"[DEBUG] Found OAuthConnection: user_id={oauth.user_id}, provider={oauth.provider}")
        user_res = await db.execute(select(User).where(User.id == oauth.user_id))
        user = user_res.scalar_one_or_none()
        if user:
            print(f"[DEBUG] Resolved to user via OAuth: {user.id} ({user.github_id})")
        return user

    # 2b. Allow direct lookup by internal user ID for admin tooling fallbacks.
    # SQLite integers are signed 64-bit, so skip oversized numeric identifiers.
    if identifier.isdigit():
        try:
            numeric_identifier = int(identifier)
        except ValueError:
            numeric_identifier = None

        if numeric_identifier is not None and 0 <= numeric_identifier <= 9223372036854775807:
            id_res = await db.execute(select(User).where(User.id == numeric_identifier))
            user = id_res.scalar_one_or_none()
            if user:
                print(f"[DEBUG] Found user by internal id: {user.id}")
                return user

    # 3. Fallback: Lookup by email (handles cross-provider identity)
    if "@" in identifier:
        print(f"[DEBUG] Trying email lookup for '{identifier}'")
        email_res = await db.execute(select(User).where(User.email == identifier))
        user = email_res.scalar_one_or_none()
        if user:
            print(f"[DEBUG] Found user by email: {user.id} ({user.email})")
            return user
        
    print(f"[DEBUG] User not found for identifier: {identifier}")
    return None


async def log_container_event(db: AsyncSession, user_id: int, container_id: str, event_type: str, details: str = None):
    """Log a container lifecycle event"""
    event = ContainerEvent(
        user_id=user_id,
        container_id=container_id,
        event_type=event_type,
        details=details
    )
    db.add(event)
    await db.commit()


def sanitize_identifier(identifier: str) -> str:
    """Sanitize identifier for Docker usage (replace @ and other chars)"""
    import re
    # Replace @ with -at- to make it readable but safe
    safe = identifier.replace("@", "-at-")
    # Replace any other non-allowed chars with -
    safe = re.sub(r'[^a-zA-Z0-9_.-]', '-', safe)
    # Ensure it doesn't start with . or -
    if safe.startswith('.') or safe.startswith('-'):
        safe = "u" + safe
    return safe


def get_user_runtime_identifier(user: User) -> str:
    """Best-effort stable identifier for Docker/plugin calls."""
    return user.github_id or user.email or str(user.id)


def has_non_empty_token(value: Optional[str]) -> bool:
    return bool(value and str(value).strip())


def isoformat_or_none(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def safe_json_loads(value: Optional[str], fallback: Any):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


def mask_secret(value: Optional[str]) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def normalize_property_id(property_id: Optional[str]) -> Optional[str]:
    if not property_id:
        return property_id
    property_id = str(property_id)
    if property_id.startswith("properties/"):
        return property_id
    if property_id.isdigit():
        return f"properties/{property_id}"
    return property_id


def get_property_name(property_id: Optional[str], property_map: Dict[str, str]) -> Optional[str]:
    if not property_id:
        return property_id
    normalized = normalize_property_id(property_id) or property_id
    if normalized in property_map:
        return property_map[normalized]
    if normalized.startswith("properties/"):
        short_id = normalized.split("/", 1)[1]
        if short_id in property_map:
            return property_map[short_id]
    return property_id


def serialize_provider(connection: OAuthConnection) -> Dict[str, Any]:
    scopes = []
    if connection.scope:
        scopes = [scope for scope in str(connection.scope).replace(",", " ").split() if scope]

    return {
        "provider": connection.provider,
        "provider_account_id": connection.provider_account_id,
        "token_type": connection.token_type,
        "scope": scopes,
        "expires_at": connection.expires_at,
        "has_refresh_token": has_non_empty_token(connection.refresh_token),
        "created_at": isoformat_or_none(connection.created_at),
        "updated_at": isoformat_or_none(connection.updated_at),
    }


async def get_connected_oauth_connections(db: AsyncSession, user_id: int) -> List[OAuthConnection]:
    oauth_result = await db.execute(
        select(OAuthConnection).where(OAuthConnection.user_id == user_id)
    )
    return [
        connection
        for connection in oauth_result.scalars().all()
        if has_non_empty_token(connection.access_token)
    ]


async def build_oauth_connection_payload(db: AsyncSession, user_id: int) -> Dict[str, Dict[str, Optional[str]]]:
    connections = await get_connected_oauth_connections(db, user_id)
    payload: Dict[str, Dict[str, Optional[str]]] = {}

    for connection in connections:
        payload[connection.provider] = {
            "provider_account_id": connection.provider_account_id,
            "accessToken": connection.access_token,
            "refreshToken": connection.refresh_token,
            "token_type": connection.token_type,
        }

    return payload


async def sync_user_container_in_background(user_id: int, trigger: str):
    """Recreate a bot container after the response has been returned."""
    async with async_session() as db:
        user = await db.get(User, user_id)
        if not user or not user.telegram_bot_token:
            return

        try:
            if not user.container_port:
                user.container_port = await get_next_available_port(db)
                await db.commit()
                await db.refresh(user)

            plan_config = PLANS.get(user.plan, PLANS["free"])
            connections = await build_oauth_connection_payload(db, user.id)

            result = await asyncio.to_thread(
                docker_manager.sync_container,
                user_identifier=user.github_id,
                plan=user.plan,
                port=user.container_port,
                telegram_token=user.telegram_bot_token,
                gemini_key=user.gemini_api_key,
                connections=connections,
                custom_rules=user.custom_rules,
                enabled_plugins=plan_config.get("features", []),
                bot_engine=user.bot_engine,
            )

            if result["success"]:
                user.container_id = result.get("container_id", user.container_id)
                user.container_status = "running"
                await db.commit()
                await log_container_event(
                    db,
                    user.id,
                    user.container_id or "pending",
                    "sync",
                    f"Background sync completed ({trigger})",
                )
            else:
                user.container_status = user.container_status or "error"
                await db.commit()
                await log_container_event(
                    db,
                    user.id,
                    user.container_id or "pending",
                    "sync_error",
                    result.get("error") or f"Background sync failed ({trigger})",
                )
        except Exception as e:
            print(f"[ERROR] background sync failed for user_id={user_id}: {e}")
            user = await db.get(User, user_id)
            if user:
                await log_container_event(
                    db,
                    user.id,
                    user.container_id or "pending",
                    "sync_error",
                    f"Background sync exception ({trigger}): {str(e)}",
                )


def get_container_health_summary(user: User) -> Dict[str, Any]:
    """Combine Docker health with DB metadata for admin views."""
    runtime_identifier = get_user_runtime_identifier(user)
    try:
        container_status = docker_manager.get_container_status(runtime_identifier)
    except Exception as e:
        print(f"[ERROR] Failed to get container status for {runtime_identifier}: {e}")
        container_status = {"status": "error", "error": str(e)}

    docker_status = container_status.get("status")

    if docker_status in ["not_found", "not_provisioned"]:
        if user.container_status in ["running", "pending", "starting"]:
            container_status["status"] = "initializing"
        else:
            container_status["status"] = "not_provisioned"
    elif user.container_id == "pending":
        container_status["status"] = "initializing"

    if not user.telegram_bot_token:
        container_status["status"] = "not_provisioned"

    container_status.setdefault("status", user.container_status or "unknown")
    container_status["port"] = user.container_port
    container_status["engine"] = user.bot_engine or "openclaw"
    container_status["db_status"] = user.container_status
    container_status["container_id"] = user.container_id
    container_status["container_name"] = user.container_name
    container_status["last_health_check"] = isoformat_or_none(user.last_health_check)
    container_status["restart_count"] = container_status.get("restart_count", user.restart_count or 0)
    container_status["telegram_enabled"] = bool(user.telegram_bot_enabled)
    container_status["telegram_bot_configured"] = bool(user.telegram_bot_token)

    return container_status


# ============= User Endpoints =============

# Brevo welcome-email background task. Fires once per user, the first time
# create_user inserts a row with an email. Best-effort: a Brevo outage must
# never break signup, so this swallows every error and logs.
async def send_welcome_email_task(user_id: int) -> None:
    """Send the Brevo welcome email and stamp users.welcome_email_sent_at on
    success. Idempotent — re-checks the column inside the task in case
    multiple fires race (shouldn't happen, but cheap insurance)."""
    if not brevo_service.is_configured():
        print(f"[welcome] skipped user_id={user_id} — Brevo not configured")
        return

    try:
        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or not user.email:
                return
            if user.welcome_email_sent_at:
                return  # Already sent — nothing to do.

            raw_first = (
                (user.github_username or "").strip()
                or (user.email.split("@")[0] if user.email else "there")
            )
            # Title-case the email-derived prefix so "chatgptairtel" → "Chatgptairtel"
            # and "alice-smith" → "Alice-Smith". GitHub usernames already round-trip
            # nicely through .title() because they're single tokens.
            first_name = raw_first.title() if raw_first else raw_first
            # Default to template id 5 — the polished welcome template I created in
            # Brevo. Override via env var only if you swap to a different template.
            # An explicit empty string (or any non-digit value) opts back into the
            # inline-HTML fallback below — useful for local dev without templates.
            template_id_raw = os.getenv("BREVO_WELCOME_TEMPLATE_ID", "5").strip()
            template_id = int(template_id_raw) if template_id_raw.isdigit() else None
            dashboard_url = os.getenv("PUBLIC_DASHBOARD_URL", "https://trafficclaw.com/dashboard")
            params = {"first_name": first_name, "dashboard_url": dashboard_url}

            ok = brevo_service.send_transactional(
                to_email=user.email,
                to_name=user.github_username or first_name,
                template_id=template_id,
                params=params if template_id is not None else None,
                # Inline-HTML fallback for environments where the template id
                # is not configured (e.g. local dev, CI). Keeps the path
                # functional without a Brevo template.
                subject=None if template_id is not None else f"Welcome to TrafficClaw, {first_name}",
                html_content=None if template_id is not None else (
                    f"<p>Hi {first_name},</p>"
                    f"<p>Welcome to TrafficClaw. Your dashboard is ready at "
                    f"<a href='{dashboard_url}'>{dashboard_url}</a>.</p>"
                    f"<p>&mdash; The TrafficClaw team</p>"
                ),
            )

            if ok:
                user.welcome_email_sent_at = datetime.utcnow()
                await db.commit()
            else:
                print(f"[welcome] Brevo returned non-2xx for user_id={user_id}; will not retry")
    except Exception as exc:
        print(f"[welcome] error sending to user_id={user_id}: {exc!r}")


@app.post("/api/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Create a new user or update existing one (Idempotent upsert)"""
    
    # 1. Determine the canonical user_identifier
    # Prioritize: provider_id (stable ID) > github_id > email
    raw_identifier = user_data.provider_id or user_data.github_id or user_data.email
    if not raw_identifier:
        raise HTTPException(status_code=400, detail="Missing user identifier (provider_id, github_id, or email)")

    user_identifier = sanitize_identifier(raw_identifier)
    print(f"[DEBUG] create_user: raw='{raw_identifier}', sanitized='{user_identifier}', email='{user_data.email}'")

    # Tracked so we know whether to enqueue the Brevo welcome email after commit.
    # Compared to existing_user *after* the upsert lookup below.
    was_new_user = False

    # 2. Check if user already exists (by email or github_id)
    existing_user = None
    
    if user_data.email:
        result = await db.execute(select(User).where(User.email == user_data.email))
        existing_user = result.scalar_one_or_none()
        if existing_user:
            print(f"[DEBUG] Found existing user by email: {existing_user.id} ({existing_user.github_id})")
        
    if not existing_user and user_data.github_id:
        result = await db.execute(select(User).where(User.github_id == user_data.github_id))
        existing_user = result.scalar_one_or_none()
        if existing_user:
            print(f"[DEBUG] Found existing user by github_id: {existing_user.id}")
        
    provider_sync_needed = False
    settings_sync_needed = False
    background_sync_reason = "user_upsert"

    # 3. Upsert Logic
    if existing_user:
        user = existing_user
        print(f"[USER] Found existing user={user.id}, updating fields")
        previous_telegram_token = user.telegram_bot_token
        previous_gemini_key = user.gemini_api_key
        previous_bot_engine = user.bot_engine

        # Update fields if provided
        if user_data.telegram_bot_token and user_data.telegram_bot_token != user.telegram_bot_token:
            print(f"[USER] Updating telegram bot token for user={user.id}")
            user.telegram_bot_token = user_data.telegram_bot_token
            settings_sync_needed = True
            background_sync_reason = "telegram_token_updated"
        if user_data.gemini_api_key and user_data.gemini_api_key != user.gemini_api_key:
            user.gemini_api_key = user_data.gemini_api_key
            settings_sync_needed = True
            background_sync_reason = "gemini_key_updated"
        if user_data.bot_engine and user_data.bot_engine != user.bot_engine:
            user.bot_engine = user_data.bot_engine
            settings_sync_needed = True
            background_sync_reason = "bot_engine_updated"
            
        # Update OAuth credentials if provided (Critical for re-auth/refresh tokens)
        if user_data.provider and user_data.provider_id:
            stmt = select(OAuthConnection).where(
                OAuthConnection.user_id == user.id,
                OAuthConnection.provider == user_data.provider
            )
            result = await db.execute(stmt)
            oauth = result.scalars().first()  # Use first() to handle multiple connections gracefully
            
            if oauth:
                oauth_changed = False
                if user_data.provider_id and user_data.provider_id != oauth.provider_account_id:
                    oauth.provider_account_id = user_data.provider_id
                    oauth_changed = True
                if has_non_empty_token(user_data.access_token) and user_data.access_token != oauth.access_token:
                    oauth.access_token = user_data.access_token
                    oauth_changed = True
                if has_non_empty_token(user_data.refresh_token) and user_data.refresh_token != oauth.refresh_token:
                    oauth.refresh_token = user_data.refresh_token
                    oauth_changed = True
                if oauth_changed:
                    oauth.updated_at = datetime.utcnow()
                    provider_sync_needed = True
                    background_sync_reason = f"provider_updated:{user_data.provider}"
            else:
                # Create new connection (Link new provider)
                oauth = OAuthConnection(
                    user_id=user.id,
                    provider=user_data.provider,
                    provider_account_id=user_data.provider_id,
                    access_token=user_data.access_token or "", # Allow empty token for linking
                    refresh_token=user_data.refresh_token,
                    token_type="bearer",
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(oauth)
                if has_non_empty_token(user_data.access_token) or has_non_empty_token(user_data.refresh_token):
                    provider_sync_needed = True
                    background_sync_reason = f"provider_linked:{user_data.provider}"
    else:
        # Create new user
        was_new_user = True

        # Validate plan
        if user_data.plan not in PLANS:
            raise HTTPException(status_code=400, detail=f"Invalid plan. Options: {list(PLANS.keys())}")
        
        # Get available port
        port = await get_next_available_port(db)
        
        # Determine container name upfront
        container_name = docker_manager._get_container_name(user_identifier)
        
        user = User(
            github_id=user_identifier,
            github_username=user_data.github_username,
            email=user_data.email,
            plan=user_data.plan,
            telegram_bot_token=user_data.telegram_bot_token,
            gemini_api_key=user_data.gemini_api_key,
            bot_engine=user_data.bot_engine or "openclaw",
            container_id="pending", 
            container_name=container_name,
            container_port=port,
            container_status="not_provisioned", # Start as not_provisioned so UI shows setup flow
            subscription_start=datetime.utcnow(),
            enabled_plugins=json.dumps([]) 
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
            
            # Create OAuth connection for new user
            if user_data.provider and user_data.provider_id:
                oauth = OAuthConnection(
                    user_id=user.id,
                    provider=user_data.provider,
                    provider_account_id=user_data.provider_id,
                    access_token=user_data.access_token or "",
                    refresh_token=user_data.refresh_token,
                    token_type="bearer",
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.add(oauth)
                if has_non_empty_token(user_data.access_token) or has_non_empty_token(user_data.refresh_token):
                    provider_sync_needed = True
                    background_sync_reason = f"provider_linked:{user_data.provider}"

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    needs_container_bootstrap = bool(user.telegram_bot_token) and (
        not existing_user
        or settings_sync_needed
        or user.container_status in [None, "not_provisioned", "error"]
        or not user.container_id
        or user.container_id == "pending"
    )
    should_queue_sync = bool(user.telegram_bot_token) and (provider_sync_needed or needs_container_bootstrap)

    if should_queue_sync and needs_container_bootstrap:
        user.container_status = "pending"

    await db.commit()
    await db.refresh(user)

    if should_queue_sync:
        background_tasks.add_task(sync_user_container_in_background, user.id, background_sync_reason)

    # Welcome email — only on FIRST create_user call for this user, only when
    # we have an email to deliver to, and only when we haven't already sent
    # one (the column is the belt-and-suspenders idempotency guard).
    if was_new_user and user.email and not user.welcome_email_sent_at:
        background_tasks.add_task(send_welcome_email_task, user.id)

    # 4. Fast-return if no telegram token is configured
    if not user.telegram_bot_token:
        print(f"[DEBUG] create_user: No telegram token, skipping container creation. user_id={user.id}, github_id={user.github_id}")
        return UserResponse(
            id=user.id,
            github_id=user.github_id or "",
            github_username=user.github_username,
            email=user.email,
            plan=user.plan,
            container_status=user.container_status or "not_provisioned",
            container_port=user.container_port,
            is_active=user.is_active,
            created_at=user.created_at,
            bot_engine=user.bot_engine or "openclaw"
        )

    print(
        f"[USER] create_user: Success. user_id={user.id}, github_id={user.github_id}, "
        f"container={user.container_status}, background_sync={should_queue_sync}"
    )
    return UserResponse(
        id=user.id,
        github_id=user.github_id or "",
        github_username=user.github_username,
        email=user.email,
        plan=user.plan,
        container_status=user.container_status,
        container_port=user.container_port,
        is_active=user.is_active,
        created_at=user.created_at,
        bot_engine=user.bot_engine or "openclaw"
    )


@app.get("/api/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """List all users"""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    user_ids = [user.id for user in users]

    provider_counts: Dict[int, int] = {}
    google_connected_user_ids = set()
    embed_counts: Dict[int, int] = {}
    shared_counts: Dict[int, int] = {}
    custom_counts: Dict[int, int] = {}
    leaderboard_user_ids = set()

    if user_ids:
        oauth_rows = await db.execute(
            select(
                OAuthConnection.user_id,
                OAuthConnection.provider,
                OAuthConnection.access_token,
            ).where(OAuthConnection.user_id.in_(user_ids))
        )
        for user_id, provider, access_token in oauth_rows.all():
            if not has_non_empty_token(access_token):
                continue
            provider_counts[user_id] = provider_counts.get(user_id, 0) + 1
            if provider == "google":
                google_connected_user_ids.add(user_id)

        embed_rows = await db.execute(
            select(EmbedToken.user_id).where(
                EmbedToken.user_id.in_(user_ids),
                EmbedToken.is_active == True,
            )
        )
        for (user_id,) in embed_rows.all():
            embed_counts[user_id] = embed_counts.get(user_id, 0) + 1

        shared_rows = await db.execute(
            select(SharedDashboard.user_id).where(
                SharedDashboard.user_id.in_(user_ids),
                SharedDashboard.is_active == True,
            )
        )
        for (user_id,) in shared_rows.all():
            shared_counts[user_id] = shared_counts.get(user_id, 0) + 1

        custom_rows = await db.execute(
            select(CustomDashboard.user_id).where(
                CustomDashboard.user_id.in_(user_ids),
                CustomDashboard.is_active == True,
            )
        )
        for (user_id,) in custom_rows.all():
            custom_counts[user_id] = custom_counts.get(user_id, 0) + 1

        leaderboard_rows = await db.execute(
            select(LeaderboardEntry.user_id).where(
                LeaderboardEntry.user_id.in_(user_ids),
                LeaderboardEntry.is_active == True,
            )
        )
        leaderboard_user_ids = {user_id for (user_id,) in leaderboard_rows.all()}

    return [
        UserResponse(
            id=u.id,
            github_id=u.github_id,
            github_username=u.github_username,
            email=u.email,
            plan=u.plan,
            credits=u.credits or 0,
            container_status=u.container_status,
            container_port=u.container_port,
            is_active=u.is_active,
            created_at=u.created_at,
            bot_engine=u.bot_engine or "openclaw",
            has_google=u.id in google_connected_user_ids,
            provider_count=provider_counts.get(u.id, 0),
            embed_token_count=embed_counts.get(u.id, 0),
            shared_dashboard_count=shared_counts.get(u.id, 0),
            custom_dashboard_count=custom_counts.get(u.id, 0),
            leaderboard_active=u.id in leaderboard_user_ids,
        )
        for u in users
    ]


@app.get("/api/users/{github_id}")
async def get_user(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get user status including container health"""
    user = await get_user_by_identifier(db, github_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    container_status = get_container_health_summary(user)
    connected_providers = [
        {"provider": connection.provider, "connected": True}
        for connection in await get_connected_oauth_connections(db, user.id)
    ]

    return {
        "id": user.id,
        "github_id": user.github_id,
        "github_username": user.github_username,
        "email": user.email,
        "plan": user.plan,
        "credits": user.credits or 0,
        "is_active": user.is_active,
        "container": container_status,
        "subscription_id": user.subscription_id,
        "subscription_start": user.subscription_start,
        "subscription_end": user.subscription_end,
        "subscription_cancelled": user.subscription_cancelled or False,
        "telegram_bot_enabled": user.telegram_bot_enabled or False,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "bot_engine": user.bot_engine or "openclaw",
        "telegram_bot_username": container_status.get("bot_username"), # Use container status
        "telegram_bot_token": mask_secret(user.telegram_bot_token),
        "telegram_bot_configured": bool(user.telegram_bot_token),
        "connected_providers": connected_providers,
    }


@app.get("/api/users/{github_id}/profile")
async def get_user_profile(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Aggregate a user profile for the superadmin dashboard."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    container_status = get_container_health_summary(user)
    connected_provider_rows = await get_connected_oauth_connections(db, user.id)
    providers = [serialize_provider(connection) for connection in connected_provider_rows]
    google_inventory = await get_google_inventory_for_user(user, db)

    property_name_map: Dict[str, str] = {}
    for property_item in google_inventory["ga_properties"]:
        property_id = property_item.get("property_id")
        display_name = property_item.get("display_name") or property_id
        if not property_id or not display_name:
            continue
        property_name_map[property_id] = display_name
        normalized = normalize_property_id(property_id)
        if normalized:
            property_name_map[normalized] = display_name
            if normalized.startswith("properties/"):
                property_name_map[normalized.split("/", 1)[1]] = display_name

    embed_result = await db.execute(
        select(EmbedToken)
        .where(EmbedToken.user_id == user.id, EmbedToken.is_active == True)
        .order_by(EmbedToken.created_at.desc())
    )
    embed_tokens = embed_result.scalars().all()
    embed_token_items = [
        {
            "id": token.id,
            "label": token.label,
            "property_id": token.property_id,
            "property_name": get_property_name(token.property_id, property_name_map),
            "allowed_origins": safe_json_loads(token.allowed_origins, []),
            "created_at": isoformat_or_none(token.created_at),
            "last_used_at": isoformat_or_none(token.last_used_at),
            "is_active": bool(token.is_active),
        }
        for token in embed_tokens
    ]

    shared_result = await db.execute(
        select(SharedDashboard)
        .where(SharedDashboard.user_id == user.id, SharedDashboard.is_active == True)
        .order_by(SharedDashboard.created_at.desc())
    )
    shared_dashboards = shared_result.scalars().all()
    shared_dashboard_items = [
        {
            "id": share.id,
            "property_id": share.property_id,
            "property_name": get_property_name(share.property_id, property_name_map),
            "site_url": share.site_url,
            "config": safe_json_loads(share.config, {}),
            "views": share.views or 0,
            "is_active": bool(share.is_active),
            "created_at": isoformat_or_none(share.created_at),
            "last_viewed_at": isoformat_or_none(share.last_viewed_at),
        }
        for share in shared_dashboards
    ]

    dashboard_result = await db.execute(
        select(CustomDashboard)
        .where(CustomDashboard.user_id == user.id, CustomDashboard.is_active == True)
        .order_by(CustomDashboard.updated_at.desc())
    )
    custom_dashboards = dashboard_result.scalars().all()
    custom_dashboard_items = [
        {
            "id": dashboard.id,
            "name": dashboard.name,
            "description": dashboard.description,
            "property_id": dashboard.property_id,
            "property_name": get_property_name(dashboard.property_id, property_name_map),
            "site_url": dashboard.site_url,
            "widget_count": len(safe_json_loads(dashboard.widgets, [])),
            "is_public": bool(dashboard.is_public),
            "has_share_link": bool(dashboard.share_token),
            "embed_enabled": bool(dashboard.embed_enabled),
            "is_active": bool(dashboard.is_active),
            "views": dashboard.views or 0,
            "created_at": isoformat_or_none(dashboard.created_at),
            "updated_at": isoformat_or_none(dashboard.updated_at),
        }
        for dashboard in custom_dashboards
    ]

    leaderboard_result = await db.execute(
        select(LeaderboardEntry).where(
            LeaderboardEntry.user_id == user.id,
            LeaderboardEntry.is_active == True,
        )
    )
    leaderboard_entry = leaderboard_result.scalar_one_or_none()
    leaderboard = None
    if leaderboard_entry:
        leaderboard = {
            "id": leaderboard_entry.id,
            "startup_name": leaderboard_entry.startup_name,
            "description": leaderboard_entry.description,
            "website_url": leaderboard_entry.website_url,
            "logo_url": leaderboard_entry.logo_url,
            "category": leaderboard_entry.category,
            "mrr_range": leaderboard_entry.mrr_range,
            "looking_for": safe_json_loads(leaderboard_entry.looking_for, []),
            "twitter_handle": leaderboard_entry.twitter_handle,
            "ga_property_id": leaderboard_entry.ga_property_id,
            "ga_property_name": get_property_name(leaderboard_entry.ga_property_id, property_name_map),
            "monthly_visitors": leaderboard_entry.monthly_visitors or 0,
            "monthly_pageviews": leaderboard_entry.monthly_pageviews or 0,
            "engagement_rate": leaderboard_entry.engagement_rate or 0,
            "bounce_rate": leaderboard_entry.bounce_rate or 0,
            "avg_session_duration": leaderboard_entry.avg_session_duration or 0,
            "visitor_trend": leaderboard_entry.visitor_trend or 0,
            "is_verified": bool(leaderboard_entry.is_verified),
            "last_refreshed": isoformat_or_none(leaderboard_entry.last_refreshed),
            "created_at": isoformat_or_none(leaderboard_entry.created_at),
            "updated_at": isoformat_or_none(leaderboard_entry.updated_at),
        }

    event_result = await db.execute(
        select(ContainerEvent)
        .where(ContainerEvent.user_id == user.id)
        .order_by(ContainerEvent.created_at.desc())
        .limit(10)
    )
    recent_events = [
        {
            "id": event.id,
            "event_type": event.event_type,
            "details": event.details,
            "container_id": event.container_id,
            "created_at": isoformat_or_none(event.created_at),
        }
        for event in event_result.scalars().all()
    ]

    logs = docker_manager.get_container_logs(get_user_runtime_identifier(user), tail=50)

    public_custom_dashboards = [dashboard for dashboard in custom_dashboard_items if dashboard["is_public"]]

    return {
        "account": {
            "id": user.id,
            "identifier": get_user_runtime_identifier(user),
            "github_id": user.github_id,
            "username": user.github_username,
            "email": user.email,
            "is_active": bool(user.is_active),
            "created_at": isoformat_or_none(user.created_at),
            "updated_at": isoformat_or_none(user.updated_at),
        },
        "subscription": {
            "plan": user.plan,
            "credits": user.credits or 0,
            "subscription_id": user.subscription_id,
            "subscription_start": isoformat_or_none(user.subscription_start),
            "subscription_end": isoformat_or_none(user.subscription_end),
            "subscription_cancelled": bool(user.subscription_cancelled),
            "telegram_bot_enabled": bool(user.telegram_bot_enabled),
        },
        "container": container_status,
        "providers": providers,
        "google_inventory": google_inventory,
        "globe_assets": {
            "embed_tokens": embed_token_items,
            "summary": {
                "active_embed_tokens": len(embed_token_items),
                "used_embed_tokens": len([token for token in embed_token_items if token["last_used_at"]]),
                "shared_dashboards": len(shared_dashboard_items),
                "shared_dashboard_views": sum(item["views"] for item in shared_dashboard_items),
                "public_custom_dashboards": len(public_custom_dashboards),
                "public_custom_dashboard_views": sum(item["views"] for item in public_custom_dashboards),
            },
        },
        "shared_dashboards": shared_dashboard_items,
        "custom_dashboards": custom_dashboard_items,
        "leaderboard": leaderboard,
        "recent_events": recent_events,
        "logs": logs,
    }


class SyncRequest(BaseModel):
    provider: str
    provider_id: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    email: Optional[str] = None  # For cross-provider user lookup


@app.post("/api/users/{github_id}/sync")
async def sync_user_container(
    github_id: str,
    sync_data: SyncRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Sync a new provider's credentials into the user's bot container.
    Upserts OAuthConnection, then recreates the container with all connections."""
    user = await get_user_by_identifier(db, github_id)
    # Fallback: try email lookup (handles Google users whose session ID != github_id)
    if not user and sync_data.email:
        user = await get_user_by_identifier(db, sync_data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 1. Upsert OAuthConnection for this provider
    stmt = select(OAuthConnection).where(
        OAuthConnection.user_id == user.id,
        OAuthConnection.provider == sync_data.provider
    )
    result = await db.execute(stmt)
    oauth = result.scalars().first()
    
    if oauth:
        if sync_data.access_token:
            oauth.access_token = sync_data.access_token
        if sync_data.refresh_token:
            oauth.refresh_token = sync_data.refresh_token
        oauth.updated_at = datetime.utcnow()
    else:
        oauth = OAuthConnection(
            user_id=user.id,
            provider=sync_data.provider,
            provider_account_id=sync_data.provider_id,
            access_token=sync_data.access_token or "",
            refresh_token=sync_data.refresh_token,
            token_type="bearer",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(oauth)
    await db.commit()
    
    # 2. If no container/telegram token, just store the connection (pre-bot registration)
    if not user.telegram_bot_token:
        return {"success": True, "message": "Provider registered (no bot yet)", "synced": False}
    
    # 3. Load ALL connections from DB (only valid tokens)
    res = await db.execute(select(OAuthConnection).where(OAuthConnection.user_id == user.id))
    connections = {}
    for c in res.scalars().all():
        if c.access_token and c.access_token.strip():
            connections[c.provider] = {
                "provider_account_id": c.provider_account_id,
                "accessToken": c.access_token,
                "refreshToken": c.refresh_token,
                "token_type": c.token_type
            }
    
    # 4. Sync (recreate) the container with all connections
    plan_config = PLANS.get(user.plan, PLANS["free"])
    result = docker_manager.sync_container(
        user_identifier=user.github_id,
        plan=user.plan,
        port=user.container_port,
        telegram_token=user.telegram_bot_token,
        gemini_key=user.gemini_api_key,
        connections=connections,
        custom_rules=user.custom_rules,
        enabled_plugins=plan_config.get("features", []),
        bot_engine=user.bot_engine
    )
    
    if result["success"]:
        user.container_id = result.get("container_id", user.container_id)
        user.container_status = "running"
        await db.commit()
        await log_container_event(db, user.id, user.container_id, "sync", 
                                  f"Synced provider: {sync_data.provider}")
    
    return {
        "success": result["success"],
        "synced": result["success"],
        "message": f"Container synced with {sync_data.provider}" if result["success"] else result.get("error"),
        "connected_providers": list(connections.keys())
    }


@app.patch("/api/users/{github_id}")
async def update_user(
    github_id: str,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Update user settings (plan upgrade, API keys, etc.)"""
    user = await get_user_by_identifier(db, github_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    
    # Generic wrapper for updating OAuth - supports google, github, etc.
    if user_update.provider:
        # We need to find the connection for this provider
        stmt = select(OAuthConnection).where(
            OAuthConnection.user_id == user.id,
            OAuthConnection.provider == user_update.provider
        )
        result = await db.execute(stmt)
        conn = result.scalars().first()
        
        if conn:
            if user_update.access_token:
                conn.access_token = user_update.access_token
            if user_update.refresh_token:
                conn.refresh_token = user_update.refresh_token
            conn.updated_at = datetime.utcnow()
        else:
            # Create new if not exists (upsert)
            if user_update.access_token:
               # Use appropriate identifier per provider
               provider_id = user.github_id if user_update.provider == "github" else (user.email or user.github_id or "")
               conn = OAuthConnection(
                   user_id=user.id,
                   provider=user_update.provider,
                   provider_account_id=provider_id,
                   access_token=user_update.access_token,
                   refresh_token=user_update.refresh_token,
                   token_type="bearer",
                   created_at=datetime.utcnow(),
                   updated_at=datetime.utcnow()
               )
               db.add(conn)
        await db.commit()

    # Handle github_token separately - update OAuthConnection (LEGACY)
    if "github_token" in update_data:
        token = update_data.pop("github_token")
        if token:
             # Upsert OAuthConnection for github
             result = await db.execute(
                 select(OAuthConnection).where(
                     OAuthConnection.user_id == user.id,
                     OAuthConnection.provider == "github"
                 )
             )
             conn = result.scalars().first()
             if conn:
                 conn.access_token = token
                 conn.updated_at = datetime.utcnow()
             else:
                 conn = OAuthConnection(
                     user_id=user.id,
                     provider="github",
                     provider_account_id=github_id,
                     access_token=token,
                     token_type="bearer",
                     created_at=datetime.utcnow(),
                     updated_at=datetime.utcnow()
                 )
                 db.add(conn)
             await db.commit()

    for key, value in update_data.items():
        setattr(user, key, value)
    
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    # If telegram_bot_token changed, sync container with new token + all connections
    if user_update.telegram_bot_token:
        print(f"[DEBUG] Telegram token updated for user {user.github_id}, syncing container...")
        
        # Fetch connections with valid tokens for container recreation
        result_conns = await db.execute(
            select(OAuthConnection).where(OAuthConnection.user_id == user.id)
        )
        connections = {}
        for c in result_conns.scalars().all():
            if c.access_token and c.access_token.strip():
                connections[c.provider] = {
                    "provider_account_id": c.provider_account_id,
                    "accessToken": c.access_token,
                    "refreshToken": c.refresh_token,
                    "token_type": c.token_type
                }
        
        plan_config = PLANS.get(user.plan, PLANS["free"])
        result = docker_manager.sync_container(
            user_identifier=user.github_id,
            plan=user.plan,
            port=user.container_port or await get_next_available_port(db),
            telegram_token=user.telegram_bot_token,
            gemini_key=user.gemini_api_key,
            connections=connections,
            custom_rules=user.custom_rules,
            enabled_plugins=plan_config.get("features", []),
            bot_engine=user.bot_engine
        )
        
        if result["success"]:
            user.container_id = result["container_id"]
            user.container_name = result.get("container_name", user.container_name)
            user.container_port = result.get("port", user.container_port)
            user.container_status = "running"
            await db.commit()
            await log_container_event(db, user.id, result["container_id"], "update", 
                                      "Container synced with new bot token")
            return {
                "success": True, 
                "message": "Bot token updated and container restarted",
                "container_status": "running"
            }
        else:
            user.container_status = "error"
            await db.commit()
            raise HTTPException(status_code=500, detail=f"Failed to restart container: {result.get('error')}")
    
    # If plan changed, sync container with new limits
    if user_update.plan and user_update.plan != user.plan:
        result_conns = await db.execute(
            select(OAuthConnection).where(OAuthConnection.user_id == user.id)
        )
        connections = {}
        for c in result_conns.scalars().all():
            if c.access_token and c.access_token.strip():
                connections[c.provider] = {
                    "provider_account_id": c.provider_account_id,
                    "accessToken": c.access_token,
                    "refreshToken": c.refresh_token,
                    "token_type": c.token_type
                }

        plan_config = PLANS[user_update.plan]
        result = docker_manager.sync_container(
            user_identifier=user.github_id,
            plan=user_update.plan,
            port=user.container_port,
            telegram_token=user.telegram_bot_token,
            gemini_key=user.gemini_api_key,
            connections=connections,
            custom_rules=user.custom_rules,
            enabled_plugins=plan_config.get("features", []),
            bot_engine=user.bot_engine
        )
        
        if result["success"]:
            user.container_id = result["container_id"]
            user.container_status = "running"
            await db.commit()
            await log_container_event(db, user.id, result["container_id"], "upgrade", f"Plan changed to: {user_update.plan}")
    
    return {"success": True, "message": "User updated"}


# ============= Credit System Endpoints =============
class CreditDeductRequest(BaseModel):
    amount: int = 10  # Default cost per AI chat message

class CreditAddRequest(BaseModel):
    amount: int
    reason: Optional[str] = "purchase"
    payment_id: Optional[str] = None

@app.get("/api/users/{github_id}/credits")
async def get_user_credits(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get user's credit balance"""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"credits": user.credits or 0, "user_id": user.id}


@app.post("/api/users/{github_id}/credits/deduct")
async def deduct_user_credits(
    github_id: str,
    request: CreditDeductRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Deduct credits for AI chat usage"""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    current = user.credits or 0
    if current < request.amount:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    # Use atomic update to prevent race conditions with concurrent requests
    from sqlalchemy import update as sql_update
    from models import User
    result = await db.execute(
        sql_update(User)
        .where(User.id == user.id, User.credits >= request.amount)
        .values(credits=User.credits - request.amount, updated_at=datetime.utcnow())
    )
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=402, detail="Insufficient credits (concurrent deduction)")

    await db.refresh(user)
    return {"credits": user.credits, "deducted": request.amount}


@app.post("/api/users/{github_id}/credits/add")
async def add_user_credits(
    github_id: str,
    request: CreditAddRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Add credits to user (after purchase or admin grant)"""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current = user.credits or 0
    user.credits = current + request.amount
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    print(f"[CREDITS] Added {request.amount} credits to user {user.github_id}. New balance: {user.credits}. Reason: {request.reason}")
    return {"credits": user.credits, "added": request.amount, "reason": request.reason}


# ============= Subscription Endpoint =============
class SubscriptionUpdate(BaseModel):
    plan: str  # free, starter, growth, pro
    credits: int
    subscription_id: Optional[str] = None
    telegram_bot_enabled: bool = False
    reset_credits: bool = False  # True = set credits to amount, False = add credits
    subscription_cancelled: Optional[bool] = None  # Set to True when cancelled, False on new/renewed

@app.post("/api/users/{identifier}/subscription")
async def update_user_subscription(
    identifier: str,
    request: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Update user subscription (called by webhook handler)"""
    VALID_PLANS = {"free", "starter", "growth", "pro"}
    if request.plan not in VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {request.plan}")
    if request.credits < 0:
        raise HTTPException(status_code=400, detail="Credits cannot be negative")

    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.plan = request.plan
    if request.subscription_id is not None:
        user.subscription_id = request.subscription_id
    user.telegram_bot_enabled = request.telegram_bot_enabled
    if request.subscription_cancelled is not None:
        user.subscription_cancelled = request.subscription_cancelled

    if request.reset_credits:
        user.credits = request.credits
    else:
        user.credits = (user.credits or 0) + request.credits

    now = datetime.utcnow()
    user.subscription_start = now
    user.subscription_end = now + timedelta(days=30)
    user.updated_at = now
    await db.commit()

    print(f"[SUBSCRIPTION] Updated user {identifier}: plan={request.plan}, credits={user.credits}, telegram={request.telegram_bot_enabled}")
    return {
        "plan": user.plan,
        "credits": user.credits,
        "subscription_id": user.subscription_id,
        "telegram_bot_enabled": user.telegram_bot_enabled,
    }


class CancelFlagUpdate(BaseModel):
    subscription_cancelled: bool

@app.post("/api/users/{identifier}/cancel-flag")
async def update_cancel_flag(
    identifier: str,
    request: CancelFlagUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Set or clear the subscription_cancelled flag without changing plan/credits"""
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.subscription_cancelled = request.subscription_cancelled
    user.updated_at = datetime.utcnow()
    await db.commit()

    print(f"[SUBSCRIPTION] Cancel flag for {identifier}: {request.subscription_cancelled}")
    return {"subscription_cancelled": user.subscription_cancelled}


# ============= Container Endpoints =============
@app.post("/api/users/{github_id}/container")
async def container_action(
    github_id: str,
    action: ContainerAction,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Perform action on user's container (start/stop/restart/create)"""
    user = await get_user_by_identifier(db, github_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use canonical ID for Docker operations
    target_id = user.github_id

    if action.action == "start":
        # First try to start existing container
        result = docker_manager.start_container(target_id)
        
        # If container doesn't exist, create it
        if not result["success"] and "not found" in result.get("error", "").lower():
            # Need to create the container first
            if not user.telegram_bot_token:
                return {"success": False, "error": "No Telegram bot token configured. Please set up your bot first."}
            
            # Fetch connections
            result_conns = await db.execute(
                select(OAuthConnection).where(OAuthConnection.user_id == user.id)
            )
            conns_list = result_conns.scalars().all()
            connections = {}
            for c in conns_list:
                connections[c.provider] = {
                    "provider_account_id": c.provider_account_id,
                    "accessToken": c.access_token,
                    "refreshToken": c.refresh_token,
                    "token_type": c.token_type,
                    "scope": c.scope
                }

            plan_config = PLANS.get(user.plan, PLANS["free"])
            result = docker_manager.create_container(
                user_identifier=target_id,
                plan=user.plan,
                port=user.container_port or await get_next_available_port(db),
                telegram_token=user.telegram_bot_token,
                gemini_key=user.gemini_api_key,
                connections=connections,
                custom_rules=user.custom_rules,
                enabled_plugins=plan_config.get("features", []),
                bot_engine=user.bot_engine
            )
            
            if result["success"]:
                user.container_id = result["container_id"]
                user.container_name = result["container_name"]
                user.container_port = result["port"]
                await log_container_event(db, user.id, result["container_id"], "create", f"Container recreated")
        
        status = "running" if result["success"] else user.container_status
        
    elif action.action == "stop":
        result = docker_manager.stop_container(target_id)
        status = "stopped"
    elif action.action == "restart":
        result = docker_manager.restart_container(target_id)
        status = "running"
    elif action.action == "destroy":
        # Remove the docker container only — keep User row, OAuth, credits, data dir intact.
        # Treat "container not found" as success: the goal is "no container running".
        result = docker_manager.delete_container(target_id, remove_data=False)
        if not result["success"] and "not found" in (result.get("error") or "").lower():
            result = {"success": True, "status": "already_removed"}
        status = "not_provisioned"
        if result["success"]:
            user.container_id = None
            # Keep container_port + container_name so re-provisioning lands in the same slot.
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    if result["success"]:
        user.container_status = status
        await db.commit()
        if action.action != "start" or "container_id" not in result:
            await log_container_event(db, user.id, user.container_id, action.action)

    return result


@app.get("/api/users/{github_id}/logs")
async def get_user_logs(
    github_id: str,
    tail: int = 100,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get container logs for debugging"""
    # Just forward to docker manager directly if we assume ID is correct?
    # No, better to verify user exists first and use canonical ID.
    user = await get_user_by_identifier(db, github_id)
    if not user:
         raise HTTPException(status_code=404, detail="User not found")
         
    return docker_manager.get_container_logs(user.github_id, tail=tail)


# ============= Plugin Exec Endpoint =============

class PluginExecRequest(BaseModel):
    plugin: str           # "google-analytics" or "google-search-console"
    command: str           # e.g. "query", "list-properties", "list-sites"
    args: list[str] = []   # positional args
    options: dict = {}     # --key value options

ALLOWED_PLUGINS = {"google-analytics", "google-search-console", "github-ghost"}


async def execute_plugin_command_for_user(
    user: User,
    db: AsyncSession,
    plugin: str,
    command: str,
    args: Optional[List[str]] = None,
    options: Optional[Dict[str, Any]] = None,
):
    args = args or []
    options = options or {}

    if plugin not in ALLOWED_PLUGINS:
        raise HTTPException(status_code=400, detail=f"Plugin '{plugin}' not allowed")

    import re
    if not re.match(r"^[a-zA-Z0-9_-]+$", command):
        raise HTTPException(status_code=400, detail="Invalid command name")

    for arg in args:
        arg_str = str(arg)
        if ".." in arg_str or arg_str.startswith("/"):
            raise HTTPException(status_code=400, detail="Invalid argument")

    container_required_plugins = {"github-ghost"}
    runtime_identifier = get_user_runtime_identifier(user)

    if plugin in container_required_plugins:
        container_name = docker_manager._get_container_name(runtime_identifier)
        try:
            container = docker_manager.client.containers.get(container_name)
            if container.status != "running":
                raise HTTPException(status_code=503, detail="Container not running")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=503, detail="Container not provisioned. Set up your bot first.")

    cmd = ["node", f"/app/plugins/{plugin}/index.js", command] + [str(arg) for arg in args]
    for key, value in options.items():
        cmd.append(f"--{key}")
        if value is not None and value != "":
            cmd.append(str(value))

    if plugin in ["google-analytics", "google-search-console"]:
        stmt = select(OAuthConnection).where(
            OAuthConnection.user_id == user.id,
            OAuthConnection.provider == "google"
        )
        result = await db.execute(stmt)
        oauth = result.scalars().first()

        if oauth:
            if oauth.access_token:
                cmd.extend(["--accessToken", oauth.access_token])
            if oauth.refresh_token:
                cmd.extend(["--refreshToken", oauth.refresh_token])

    env = os.environ.copy()

    print(f"Executing plugin: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=60)
    stdout = result.stdout
    stderr = result.stderr

    print(f"Plugin stdout: {stdout[:500]}...")
    if stderr:
        print(f"Plugin stderr: {stderr}")

    try:
        parsed = json.loads(stdout)
        return {"status": "ok", "data": parsed, "stderr": stderr}
    except json.JSONDecodeError:
        try:
            cleaned = stdout.strip()
            start_index = -1
            for i, char in enumerate(cleaned):
                if char in ["{", "["]:
                    start_index = i
                    break

            if start_index != -1:
                json_candidate = cleaned[start_index:]
                parsed = json.loads(json_candidate)
                return {"status": "ok", "data": parsed, "stderr": stderr}
        except Exception:
            pass

        return {"status": "ok", "data": stdout.strip(), "stderr": stderr}


async def get_google_inventory_for_user(user: User, db: AsyncSession) -> Dict[str, Any]:
    """Fetch GA properties and GSC sites using the same plugin exec path as the product UI."""
    inventory = {
        "connected": False,
        "ga_properties": [],
        "gsc_sites": [],
        "warnings": [],
    }

    google_oauth_result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == user.id,
            OAuthConnection.provider == "google",
        )
    )
    google_connection = google_oauth_result.scalars().first()
    if not google_connection or not has_non_empty_token(google_connection.access_token):
        return inventory

    inventory["connected"] = True

    try:
        ga_result = await execute_plugin_command_for_user(user, db, "google-analytics", "list-properties-json")
        ga_payload = ga_result.get("data")
        if isinstance(ga_payload, dict) and ga_payload.get("error"):
            inventory["warnings"].append(f"Google Analytics: {ga_payload['error']}")
        elif isinstance(ga_payload, list):
            inventory["ga_properties"] = [
                {
                    "property_id": normalize_property_id(item.get("property")),
                    "display_name": item.get("displayName") or item.get("property"),
                    "parent": item.get("parent"),
                }
                for item in ga_payload
            ]
        else:
            inventory["warnings"].append("Google Analytics inventory returned an unexpected response.")
    except HTTPException as exc:
        inventory["warnings"].append(f"Google Analytics: {exc.detail}")
    except Exception as exc:
        inventory["warnings"].append(f"Google Analytics: {str(exc)}")

    try:
        gsc_result = await execute_plugin_command_for_user(user, db, "google-search-console", "list-sites-json")
        gsc_payload = gsc_result.get("data")
        if isinstance(gsc_payload, dict) and gsc_payload.get("error"):
            inventory["warnings"].append(f"Google Search Console: {gsc_payload['error']}")
        elif isinstance(gsc_payload, list):
            inventory["gsc_sites"] = [
                {
                    "site_url": item.get("siteUrl"),
                    "permission_level": item.get("permissionLevel"),
                    "site_type": item.get("siteType"),
                }
                for item in gsc_payload
            ]
        else:
            inventory["warnings"].append("Google Search Console inventory returned an unexpected response.")
    except HTTPException as exc:
        inventory["warnings"].append(f"Google Search Console: {exc.detail}")
    except Exception as exc:
        inventory["warnings"].append(f"Google Search Console: {str(exc)}")

    return inventory

@app.post("/api/users/{github_id}/exec")
async def exec_plugin(
    github_id: str,
    req: PluginExecRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Execute a plugin command. Google plugins run as local subprocesses (no container needed).
    Bot-specific plugins require a running container."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        return await execute_plugin_command_for_user(user, db, req.plugin, req.command, req.args, req.options)
    except subprocess.TimeoutExpired:
        print(f"Plugin exec timeout for {github_id}: {req.plugin} {req.command}")
        raise HTTPException(status_code=504, detail="Plugin execution timed out")
    except Exception as e:
        print(f"Plugin exec error for {github_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Plugin execution failed: {str(e)}")


# ============= GitHub App Installations =============
class GitHubAppInstallRecord(BaseModel):
    installation_id: int


@app.post("/api/users/{github_id}/github-app/install")
async def record_github_app_install(
    github_id: str,
    payload: GitHubAppInstallRecord,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Record a fresh GitHub App installation. Called by /api/auth/callback/github-app
    after the user finishes the install flow on GitHub.com."""
    if not github_app_is_configured():
        raise HTTPException(status_code=503, detail="GitHub App is not configured on the server")

    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Pull live metadata from GitHub so we know the account login + repo selection.
    meta = await github_app_fetch_installation_metadata(payload.installation_id)
    if not meta:
        raise HTTPException(status_code=502, detail="Failed to fetch installation metadata from GitHub")

    account = meta.get("account") or {}
    account_login = account.get("login") or "unknown"
    account_type = account.get("type") or "User"
    repository_selection = meta.get("repository_selection") or "selected"

    repos = await github_app_list_installation_repositories(payload.installation_id)
    repo_count = len(repos)

    # Upsert by installation_id (one installation per (App, account) pair on GitHub's side).
    result = await db.execute(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.installation_id == payload.installation_id
        )
    )
    row = result.scalars().first()
    now = datetime.utcnow()

    if row:
        row.user_id = user.id
        row.account_login = account_login
        row.account_type = account_type
        row.repository_selection = repository_selection
        row.repo_count = repo_count
        row.suspended_at = None
        row.updated_at = now
    else:
        row = GitHubAppInstallation(
            user_id=user.id,
            installation_id=payload.installation_id,
            account_login=account_login,
            account_type=account_type,
            repository_selection=repository_selection,
            repo_count=repo_count,
            installed_at=now,
            updated_at=now,
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)
    github_app_invalidate_token(payload.installation_id)  # force fresh token next call

    return {
        "installation_id": row.installation_id,
        "account_login": row.account_login,
        "account_type": row.account_type,
        "repository_selection": row.repository_selection,
        "repo_count": row.repo_count,
    }


@app.get("/api/users/{github_id}/github-app/installations")
async def list_user_github_app_installations(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.user_id == user.id,
            GitHubAppInstallation.suspended_at.is_(None),
        )
    )
    rows = result.scalars().all()
    return {
        "installations": [
            {
                "installation_id": r.installation_id,
                "account_login": r.account_login,
                "account_type": r.account_type,
                "repository_selection": r.repository_selection,
                "repo_count": r.repo_count,
                "installed_at": isoformat_or_none(r.installed_at),
            }
            for r in rows
        ]
    }


@app.get("/api/users/{github_id}/github-app/repositories")
async def list_user_github_app_repositories(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Live-fetch repositories accessible to the user's installation(s).
    Pulls fresh from GitHub each call (cached upstream by the token cache, not here)."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.user_id == user.id,
            GitHubAppInstallation.suspended_at.is_(None),
        )
    )
    installations = result.scalars().all()
    if not installations:
        return {"installed": False, "repos": []}

    repos: list[dict] = []
    for inst in installations:
        items = await github_app_list_installation_repositories(inst.installation_id)
        for r in items:
            repos.append({
                "full_name": r.get("full_name"),
                "private": r.get("private", False),
                "description": r.get("description"),
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
                "open_issues": r.get("open_issues_count", 0),
                "default_branch": r.get("default_branch", "main"),
                "updated_at": r.get("updated_at"),
                "pushed_at": r.get("pushed_at"),
            })
    return {"installed": True, "repos": repos}


@app.delete("/api/users/{github_id}/github-app/installations/{installation_id}")
async def delete_user_github_app_installation(
    github_id: str,
    installation_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Disconnect a GitHub App installation from the user. Removes our DB row +
    invalidates the cached token. Does NOT uninstall the App on GitHub itself —
    user must do that at https://github.com/settings/installations to revoke
    actual repo access."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.user_id == user.id,
            GitHubAppInstallation.installation_id == installation_id,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Installation not found for this user")
    await db.delete(row)
    await db.commit()
    github_app_invalidate_token(installation_id)
    return {"status": "disconnected", "installation_id": installation_id}


@app.delete("/api/users/{github_id}/github-app/installations")
async def delete_all_user_github_app_installations(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Full GitHub disconnect — removes BOTH the user's GitHub App installation rows
    AND any legacy OAuthConnection(provider='github') rows. Without removing the
    OAuth row, the UI's connected-state check (which still reads connected_providers
    from /api/users/{id}) would keep showing GitHub as connected after a Disconnect
    click.

    Does NOT uninstall the App on GitHub itself — user must do that at
    https://github.com/settings/installations to revoke actual repo access."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 1. Remove App installation rows + invalidate cached tokens
    result = await db.execute(
        select(GitHubAppInstallation).where(GitHubAppInstallation.user_id == user.id)
    )
    installations = result.scalars().all()
    installations_removed = 0
    for row in installations:
        github_app_invalidate_token(row.installation_id)
        await db.delete(row)
        installations_removed += 1

    # 2. Remove legacy OAuth GitHub connection row(s)
    oauth_result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == user.id,
            OAuthConnection.provider == "github",
        )
    )
    oauth_rows = oauth_result.scalars().all()
    oauth_removed = 0
    for row in oauth_rows:
        await db.delete(row)
        oauth_removed += 1

    await db.commit()
    return {
        "status": "disconnected",
        "installations_removed": installations_removed,
        "oauth_removed": oauth_removed,
    }


@app.get("/api/users/{github_id}/github-app/token")
async def get_user_github_app_token(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Mint (or reuse cached) installation token for the user's primary installation.
    Returns the short-lived token + expires_at for web callers to use as Bearer."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(GitHubAppInstallation).where(
            GitHubAppInstallation.user_id == user.id,
            GitHubAppInstallation.suspended_at.is_(None),
        ).order_by(GitHubAppInstallation.installed_at.desc())
    )
    inst = result.scalars().first()
    if not inst:
        raise HTTPException(status_code=404, detail="No active GitHub App installation")
    token = await github_app_get_installation_token(inst.installation_id)
    if not token:
        raise HTTPException(status_code=502, detail="Failed to mint installation token")
    return {
        "token": token,
        "installation_id": inst.installation_id,
        "account_login": inst.account_login,
    }


# ============= Site ↔ Repo Links =============
class SiteRepoLinkUpsert(BaseModel):
    site_url: str
    repo_full_name: str
    base_path: Optional[str] = None
    branch: Optional[str] = None
    confirmed: bool = False  # true when the user explicitly picked, false when auto-matched


@app.get("/api/users/{github_id}/site-repo-links")
async def list_site_repo_links(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List all (site → repo) links the user has saved."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(SiteRepoLink).where(SiteRepoLink.user_id == user.id)
    )
    links = result.scalars().all()
    return {
        "links": [
            {
                "site_url": link.site_url,
                "repo_full_name": link.repo_full_name,
                "base_path": link.base_path,
                "branch": link.branch,
                "confirmed": link.confirmed_at is not None,
                "updated_at": isoformat_or_none(link.updated_at),
            }
            for link in links
        ]
    }


@app.post("/api/users/{github_id}/site-repo-links")
async def upsert_site_repo_link(
    github_id: str,
    payload: SiteRepoLinkUpsert,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Upsert a (site → repo) link. confirmed=true marks it as user-validated."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not payload.site_url or not payload.repo_full_name:
        raise HTTPException(status_code=400, detail="site_url and repo_full_name are required")

    result = await db.execute(
        select(SiteRepoLink).where(
            SiteRepoLink.user_id == user.id,
            SiteRepoLink.site_url == payload.site_url,
        )
    )
    link = result.scalars().first()
    now = datetime.utcnow()

    if link:
        link.repo_full_name = payload.repo_full_name
        link.base_path = payload.base_path
        link.branch = payload.branch
        if payload.confirmed:
            link.confirmed_at = now
        link.updated_at = now
    else:
        link = SiteRepoLink(
            user_id=user.id,
            site_url=payload.site_url,
            repo_full_name=payload.repo_full_name,
            base_path=payload.base_path,
            branch=payload.branch,
            confirmed_at=now if payload.confirmed else None,
        )
        db.add(link)

    await db.commit()
    await db.refresh(link)

    return {
        "site_url": link.site_url,
        "repo_full_name": link.repo_full_name,
        "base_path": link.base_path,
        "branch": link.branch,
        "confirmed": link.confirmed_at is not None,
    }


# ============= OAuth Token Retrieval =============
@app.get("/api/users/{github_id}/oauth/{provider}")
async def get_user_oauth_token(
    github_id: str,
    provider: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Return stored OAuth tokens for a user's provider (used by Next.js API routes as fallback)."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == user.id,
            OAuthConnection.provider == provider
        )
    )
    oauth = result.scalars().first()
    if not oauth or not (oauth.access_token and oauth.access_token.strip()):
        raise HTTPException(status_code=404, detail=f"No {provider} connection found")

    return {
        "provider": oauth.provider,
        "access_token": oauth.access_token,
        "refresh_token": oauth.refresh_token,
    }


# ============= User Deletion =============
@app.delete("/api/users/{github_id}")
async def delete_user(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Delete a user, their container, and all workspace data (clean slate)."""
    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 1. Stop and remove container + workspace data
    try:
        docker_manager.delete_container(user.github_id, remove_data=True)
        print(f"[INFO] Deleted container and data for {user.github_id}")
    except Exception as e:
        print(f"[WARN] Container cleanup failed for {user.github_id}: {e}")

    # 2. Delete OAuth connections
    from models import OAuthConnection
    await db.execute(
        OAuthConnection.__table__.delete().where(OAuthConnection.user_id == user.id)
    )

    # 3. Delete user record
    await db.delete(user)
    await db.commit()

    return {"status": "deleted", "github_id": github_id}


# ============= Admin Endpoints =============
@app.get("/api/admin/status")
async def admin_status(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get overall system status"""
    # Count users by plan
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    plan_counts = {}
    running_count = 0
    for user in users:
        plan_counts[user.plan] = plan_counts.get(user.plan, 0) + 1
        if user.container_status == "running":
            running_count += 1
    
    # Get all containers
    containers = docker_manager.get_all_containers()
    
    return {
        "total_users": len(users),
        "running_containers": running_count,
        "plan_breakdown": plan_counts,
        "containers": containers,
        "max_users": settings.MAX_USERS,
        "available_slots": settings.MAX_USERS - len(users)
    }


@app.get("/api/admin/containers")
async def list_all_containers(
    _: bool = Depends(verify_admin_key)
):
    """List all ClawBot containers"""
    return docker_manager.get_all_containers()


@app.get("/api/admin/events")
async def get_events(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get recent container events"""
    result = await db.execute(
        select(ContainerEvent)
        .order_by(ContainerEvent.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    
    return [
        {
            "id": e.id,
            "user_id": e.user_id,
            "container_id": e.container_id,
            "event_type": e.event_type,
            "details": e.details,
            "created_at": e.created_at
        }
        for e in events
    ]


# ============= Contact Queries =============
class ContactSubmission(BaseModel):
    name: str
    email: str
    message: str
    ip_address: Optional[str] = None


@app.post("/contact")
async def submit_contact(data: ContactSubmission, db: AsyncSession = Depends(get_db), _=Depends(verify_admin_key)):
    """Save a contact form submission"""
    query = ContactQuery(
        name=data.name[:100],
        email=data.email[:254],
        message=data.message[:2000],
        ip_address=data.ip_address,
    )
    db.add(query)
    await db.commit()
    return {"success": True, "id": query.id}


@app.get("/contact")
async def list_contact_queries(status: Optional[str] = None, db: AsyncSession = Depends(get_db), _=Depends(verify_admin_key)):
    """List contact form submissions"""
    stmt = select(ContactQuery).order_by(ContactQuery.created_at.desc())
    if status:
        stmt = stmt.where(ContactQuery.status == status)
    result = await db.execute(stmt)
    queries = result.scalars().all()
    return [
        {
            "id": q.id,
            "name": q.name,
            "email": q.email,
            "message": q.message,
            "status": q.status,
            "ip_address": q.ip_address,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        }
        for q in queries
    ]


@app.patch("/contact/{query_id}")
async def update_contact_status(query_id: int, status: str, db: AsyncSession = Depends(get_db), _=Depends(verify_admin_key)):
    """Update status of a contact query (new, read, replied)"""
    result = await db.execute(select(ContactQuery).where(ContactQuery.id == query_id))
    query = result.scalar_one_or_none()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    query.status = status
    await db.commit()
    return {"success": True}


@app.delete("/contact/{query_id}")
async def delete_contact_query(query_id: int, db: AsyncSession = Depends(get_db), _=Depends(verify_admin_key)):
    """Delete a contact query"""
    result = await db.execute(select(ContactQuery).where(ContactQuery.id == query_id))
    query = result.scalar_one_or_none()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    await db.delete(query)
    await db.commit()
    return {"success": True}


# ============= Embed Tokens =============
class EmbedTokenCreate(BaseModel):
    user_identifier: str  # GitHub ID, provider account ID, or email
    property_id: str
    label: Optional[str] = None
    allowed_origins: Optional[List[str]] = None


@app.post("/api/embed-tokens")
async def create_embed_token(
    body: EmbedTokenCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Create an embed token scoped to a GA4 property."""
    user = await get_user_by_identifier(db, body.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = secrets.token_hex(32)
    embed_token = EmbedToken(
        token=token,
        user_id=user.id,
        property_id=body.property_id,
        label=body.label,
        allowed_origins=json.dumps(body.allowed_origins) if body.allowed_origins else None,
    )
    db.add(embed_token)
    await db.commit()
    await db.refresh(embed_token)
    return {
        "token": embed_token.token,
        "property_id": embed_token.property_id,
        "label": embed_token.label,
        "created_at": embed_token.created_at.isoformat() if embed_token.created_at else None,
    }


@app.get("/api/embed-tokens")
async def list_embed_tokens(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """List all embed tokens for a user."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(EmbedToken).where(EmbedToken.user_id == user.id)
    )
    tokens = result.scalars().all()
    return [
        {
            "token": t.token,
            "property_id": t.property_id,
            "label": t.label,
            "is_active": t.is_active,
            "allowed_origins": json.loads(t.allowed_origins) if t.allowed_origins else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
        }
        for t in tokens
    ]


@app.delete("/api/embed-tokens/{token}")
async def revoke_embed_token(
    token: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Revoke an embed token (soft delete)."""
    result = await db.execute(
        select(EmbedToken).where(EmbedToken.token == token)
    )
    embed_token = result.scalar_one_or_none()
    if not embed_token:
        raise HTTPException(status_code=404, detail="Token not found")
    embed_token.is_active = False
    await db.commit()
    return {"success": True}


@app.get("/api/embed-tokens/{token}/google-tokens")
async def get_embed_token_google_creds(
    token: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Validate embed token and return the owner's Google OAuth credentials."""
    result = await db.execute(
        select(EmbedToken).where(EmbedToken.token == token, EmbedToken.is_active == True)
    )
    embed_token = result.scalar_one_or_none()
    if not embed_token:
        raise HTTPException(status_code=404, detail="Invalid or revoked token")

    # Update last_used_at
    embed_token.last_used_at = datetime.utcnow()

    # Get the owner's Google OAuth connection
    oauth_result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == embed_token.user_id,
            OAuthConnection.provider == "google"
        )
    )
    oauth = oauth_result.scalars().first()
    if not oauth or not oauth.access_token:
        await db.commit()
        raise HTTPException(status_code=404, detail="Owner has no Google connection")

    # Get the owner's plan for gating
    user_result = await db.execute(
        select(User).where(User.id == embed_token.user_id)
    )
    user = user_result.scalar_one_or_none()

    await db.commit()
    return {
        "property_id": embed_token.property_id,
        "access_token": oauth.access_token,
        "refresh_token": oauth.refresh_token,
        "user_id": embed_token.user_id,
        "allowed_origins": json.loads(embed_token.allowed_origins) if embed_token.allowed_origins else None,
        "plan": user.plan if user else "free",
    }


# ============= Social Embed Tokens =============

def normalize_social_embed_domain(value: str) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Domain is required")

    if "://" not in normalized:
        normalized = f"https://{normalized}"

    parsed = urlparse(normalized)
    hostname = (parsed.hostname or "").strip().lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]

    if not hostname or "." not in hostname:
        raise HTTPException(status_code=400, detail="Invalid domain")

    return hostname


def normalize_social_embed_config(config: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    candidate = config or {}
    visible_cards = candidate.get("visibleCards")
    try:
        visible_cards = int(visible_cards)
    except (TypeError, ValueError):
        visible_cards = None

    if visible_cards not in {1, 2, 3, 4}:
        legacy_count = candidate.get("tweetCount")
        try:
            legacy_count = int(legacy_count)
        except (TypeError, ValueError):
            legacy_count = None

        visible_cards = legacy_count if legacy_count in {1, 2, 3, 4} else 3

    return {
        "visibleCards": visible_cards,
    }


def serialize_social_embed_token(token: SocialEmbedToken):
    try:
        parsed_config = json.loads(token.config) if token.config else None
    except Exception:
        parsed_config = None

    return {
        "token": token.token,
        "platform": token.platform,
        "domain": token.domain,
        "source_site_url": token.source_site_url,
        "label": token.label,
        "is_active": token.is_active,
        "allowed_origins": json.loads(token.allowed_origins) if token.allowed_origins else None,
        "created_at": token.created_at.isoformat() if token.created_at else None,
        "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
        "config": normalize_social_embed_config(parsed_config),
    }


class SocialEmbedTokenCreate(BaseModel):
    user_identifier: str
    platform: str
    domain: str
    source_site_url: Optional[str] = None
    label: Optional[str] = None
    allowed_origins: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None


class SocialEmbedTokenUpdate(BaseModel):
    user_identifier: str
    domain: str
    source_site_url: Optional[str] = None
    label: Optional[str] = None
    allowed_origins: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None


@app.post("/api/social-embed-tokens")
async def create_social_embed_token(
    body: SocialEmbedTokenCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    user = await get_user_by_identifier(db, body.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    platform = (body.platform or "").strip().lower()
    if platform not in {"x", "reddit"}:
        raise HTTPException(status_code=400, detail="Unsupported social platform")

    social_embed_token = SocialEmbedToken(
        token=secrets.token_hex(32),
        user_id=user.id,
        platform=platform,
        domain=normalize_social_embed_domain(body.domain),
        source_site_url=body.source_site_url,
        label=body.label,
        allowed_origins=json.dumps(body.allowed_origins) if body.allowed_origins else None,
        config=json.dumps(normalize_social_embed_config(body.config)),
    )
    db.add(social_embed_token)
    await db.commit()
    await db.refresh(social_embed_token)
    return serialize_social_embed_token(social_embed_token)


@app.get("/api/social-embed-tokens")
async def list_social_embed_tokens(
    user_identifier: str,
    platform: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = select(SocialEmbedToken).where(SocialEmbedToken.user_id == user.id)
    normalized_platform = (platform or "").strip().lower()
    if normalized_platform:
        query = query.where(SocialEmbedToken.platform == normalized_platform)

    result = await db.execute(query.order_by(SocialEmbedToken.created_at.desc()))
    tokens = result.scalars().all()
    return [serialize_social_embed_token(token) for token in tokens]


@app.patch("/api/social-embed-tokens/{token}")
async def update_social_embed_token(
    token: str,
    body: SocialEmbedTokenUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    user = await get_user_by_identifier(db, body.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(SocialEmbedToken).where(
            SocialEmbedToken.token == token,
            SocialEmbedToken.user_id == user.id,
            SocialEmbedToken.is_active == True
        )
    )
    social_embed_token = result.scalar_one_or_none()
    if not social_embed_token:
        raise HTTPException(status_code=404, detail="Token not found")

    social_embed_token.domain = normalize_social_embed_domain(body.domain)
    social_embed_token.source_site_url = body.source_site_url
    social_embed_token.label = body.label
    social_embed_token.allowed_origins = json.dumps(body.allowed_origins) if body.allowed_origins else None
    social_embed_token.config = json.dumps(normalize_social_embed_config(body.config))

    await db.commit()
    await db.refresh(social_embed_token)
    return serialize_social_embed_token(social_embed_token)


@app.delete("/api/social-embed-tokens/{token}")
async def revoke_social_embed_token(
    token: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    result = await db.execute(
        select(SocialEmbedToken).where(SocialEmbedToken.token == token)
    )
    social_embed_token = result.scalar_one_or_none()
    if not social_embed_token:
        raise HTTPException(status_code=404, detail="Token not found")

    social_embed_token.is_active = False
    await db.commit()
    return {"success": True}


@app.get("/api/social-embed-tokens/{token}")
async def validate_social_embed_token(
    token: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    result = await db.execute(
        select(SocialEmbedToken).where(
            SocialEmbedToken.token == token,
            SocialEmbedToken.is_active == True
        )
    )
    social_embed_token = result.scalar_one_or_none()
    if not social_embed_token:
        raise HTTPException(status_code=404, detail="Invalid or revoked token")

    social_embed_token.last_used_at = datetime.utcnow()
    await db.commit()
    await db.refresh(social_embed_token)
    return serialize_social_embed_token(social_embed_token)


# ============= Shared Dashboards =============

def serialize_shared_dashboard(shared: SharedDashboard, user_identifier: Optional[str]):
    return {
        "token": shared.token,
        "userId": user_identifier,
        "propertyId": shared.property_id,
        "siteUrl": shared.site_url,
        "config": json.loads(shared.config) if shared.config else {},
        "views": shared.views,
        "createdAt": shared.created_at.isoformat() if shared.created_at else None,
    }


class SharedDashboardCreate(BaseModel):
    user_identifier: str
    property_id: str
    site_url: Optional[str] = None
    config: Optional[dict] = None


class SharedDashboardUpdate(BaseModel):
    user_identifier: str
    site_url: Optional[str] = None
    config: Optional[dict] = None


async def resolve_shared_dashboard_owner_identifier(
    db: AsyncSession,
    shared: SharedDashboard,
) -> Optional[str]:
    user_result = await db.execute(select(User).where(User.id == shared.user_id))
    owner = user_result.scalar_one_or_none()
    if not owner:
        return None
    return owner.github_id or owner.email


@app.post("/api/shared-dashboards")
async def create_shared_dashboard(
    data: SharedDashboardCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Create a new shared dashboard link."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = secrets.token_hex(16)
    config_json = json.dumps(data.config) if data.config else '{"traffic":true,"sources":true,"pages":true,"geo":true,"seo":false,"layoutMode":"openpanel_overview","shareProvider":"openpanel_overview"}'

    shared = SharedDashboard(
        token=token,
        user_id=user.id,
        property_id=data.property_id,
        site_url=data.site_url or "",
        config=config_json,
    )
    db.add(shared)
    await db.commit()
    await db.refresh(shared)

    return serialize_shared_dashboard(shared, data.user_identifier)


@app.patch("/api/shared-dashboards/{token}")
async def update_shared_dashboard(
    token: str,
    data: SharedDashboardUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Update shared dashboard metadata after provider provisioning."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(SharedDashboard).where(
            SharedDashboard.token == token,
            SharedDashboard.user_id == user.id,
            SharedDashboard.is_active == True
        )
    )
    shared = result.scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=404, detail="Shared dashboard not found")

    if data.site_url is not None:
        shared.site_url = data.site_url
    if data.config is not None:
        shared.config = json.dumps(data.config)

    await db.commit()
    await db.refresh(shared)

    return serialize_shared_dashboard(shared, data.user_identifier)


@app.get("/api/shared-dashboards")
async def list_shared_dashboards(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """List shared dashboards for a user."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return []

    result = await db.execute(
        select(SharedDashboard)
        .where(SharedDashboard.user_id == user.id, SharedDashboard.is_active == True)
        .order_by(SharedDashboard.created_at.desc())
    )
    shares = result.scalars().all()

    return {
        "shares": [
            serialize_shared_dashboard(s, user_identifier)
            for s in shares
        ]
    }


@app.delete("/api/shared-dashboards/{token}")
async def revoke_shared_dashboard(
    token: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Revoke a shared dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(SharedDashboard).where(
            SharedDashboard.token == token,
            SharedDashboard.user_id == user.id
        )
    )
    shared = result.scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=404, detail="Shared dashboard not found")

    shared.is_active = False
    await db.commit()
    return {"revoked": True}


@app.get("/api/shared-dashboards/{token}/view")
async def view_shared_dashboard(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: get shared dashboard data and increment views. NO auth required."""
    result = await db.execute(
        select(SharedDashboard).where(
            SharedDashboard.token == token,
            SharedDashboard.is_active == True
        )
    )
    shared = result.scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    shared.views += 1
    shared.last_viewed_at = datetime.utcnow()
    await db.commit()

    user_identifier = await resolve_shared_dashboard_owner_identifier(db, shared)

    return serialize_shared_dashboard(shared, user_identifier)


@app.get("/api/shared-dashboards/{token}")
async def get_shared_dashboard(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public read endpoint: get shared dashboard metadata without incrementing views."""
    result = await db.execute(
        select(SharedDashboard).where(
            SharedDashboard.token == token,
            SharedDashboard.is_active == True
        )
    )
    shared = result.scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    user_identifier = await resolve_shared_dashboard_owner_identifier(db, shared)

    return serialize_shared_dashboard(shared, user_identifier)


@app.delete("/api/shared-dashboards/user/{user_identifier}")
async def revoke_all_shared_dashboards(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Revoke all shared dashboards for a user."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(SharedDashboard).where(
            SharedDashboard.user_id == user.id,
            SharedDashboard.is_active == True
        )
    )
    shares = result.scalars().all()
    count = 0
    for s in shares:
        s.is_active = False
        count += 1
    await db.commit()
    return {"revoked": count}


# ============= Leaderboard =============


import re as _slug_re

def _slugify(name: str) -> str:
    """Lowercase, ASCII-only, hyphens-only slug. Strips emoji/accents/symbols.

    Capped at 80 chars so the slug + 6-char suffix fit in the column.
    """
    if not name:
        return "startup"
    # Lowercase, drop non-ASCII (emoji/accents become nothing).
    ascii_only = name.lower().encode("ascii", "ignore").decode("ascii")
    # Replace runs of non-alphanumeric with single hyphen.
    cleaned = _slug_re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    if not cleaned:
        return "startup"
    return cleaned[:80].rstrip("-") or "startup"


async def _generate_unique_slug(db: AsyncSession, startup_name: str) -> str:
    """`slugify(startup_name)-<6char>`. Loops with fresh suffix on collision.

    Collision is astronomically unlikely (36^6 = 2.2B combos per name slug),
    but the loop guarantees correctness.
    """
    base = _slugify(startup_name)
    for _ in range(5):
        suffix = "".join(secrets.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(6))
        candidate = f"{base}-{suffix}"
        existing = await db.execute(
            select(LeaderboardEntry.id).where(LeaderboardEntry.slug == candidate)
        )
        if existing.scalar_one_or_none() is None:
            return candidate
    # 5 collisions in a row is essentially impossible — fall back to a
    # longer suffix rather than raising.
    long_suffix = secrets.token_urlsafe(8).lower().replace("_", "").replace("-", "")[:10]
    return f"{base}-{long_suffix}"

class LeaderboardJoinRequest(BaseModel):
    startup_name: str
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    category: Optional[str] = None
    mrr_range: Optional[str] = None
    looking_for: Optional[List[str]] = None
    twitter_handle: Optional[str] = None
    founder_name: Optional[str] = None
    contact_email: Optional[str] = None
    ga_property_id: Optional[str] = None
    verification_status: Optional[str] = None  # verified | host_mismatch | pending | failed
    verified_host: Optional[str] = None


class LeaderboardUpdateRequest(BaseModel):
    startup_name: Optional[str] = None
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    category: Optional[str] = None
    mrr_range: Optional[str] = None
    looking_for: Optional[List[str]] = None
    twitter_handle: Optional[str] = None
    founder_name: Optional[str] = None
    contact_email: Optional[str] = None
    ga_property_id: Optional[str] = None
    is_active: Optional[bool] = None


@app.get("/api/leaderboard/{id_or_slug}/detail")
async def get_leaderboard_entry_detail(
    id_or_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — get a single leaderboard entry's full details.

    Accepts either a numeric id (legacy `/leaderboard/4`) or the new slug
    (`/leaderboard/antigravity-codes-a3f9b2`). Numeric IDs win on the rare
    name-collision where someone has a slug like "5", since the `.isdigit()`
    branch checks first.

    Returns 404 for unverified entries so we don't expose pending /
    host_mismatch listings via direct URL access. The owner can still preview
    their entry from /dashboard/settings before it's verified.
    """
    base_filter = (
        (LeaderboardEntry.is_active == True)
        & or_(
            LeaderboardEntry.verification_status == "verified",
            LeaderboardEntry.is_verified == True,
        )
    )
    if id_or_slug.isdigit():
        stmt = select(LeaderboardEntry).where(
            LeaderboardEntry.id == int(id_or_slug),
            base_filter,
        )
    else:
        stmt = select(LeaderboardEntry).where(
            LeaderboardEntry.slug == id_or_slug,
            base_filter,
        )
    result = await db.execute(stmt)
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    # Fetch up to 30 days of history for the sparkline.
    history_result = await db.execute(
        select(LeaderboardStatsHistory)
        .where(LeaderboardStatsHistory.entry_id == entry.id)
        .order_by(LeaderboardStatsHistory.recorded_on.desc())
        .limit(30)
    )
    history_rows = list(reversed(history_result.scalars().all()))

    return {
        "id": entry.id,
        "slug": entry.slug,
        "startup_name": entry.startup_name,
        "description": entry.description,
        "website_url": entry.website_url,
        "logo_url": entry.logo_url,
        "category": entry.category,
        "mrr_range": entry.mrr_range,
        "looking_for": json.loads(entry.looking_for) if entry.looking_for else [],
        "twitter_handle": entry.twitter_handle,
        "founder_name": entry.founder_name,
        "contact_email": entry.contact_email,
        "ga_property_id": entry.ga_property_id,
        "monthly_visitors": entry.monthly_visitors,
        "monthly_pageviews": entry.monthly_pageviews,
        "engagement_rate": entry.engagement_rate,
        "bounce_rate": entry.bounce_rate,
        "avg_session_duration": entry.avg_session_duration,
        "visitor_trend": entry.visitor_trend,
        "is_verified": entry.is_verified,
        "verification_status": entry.verification_status or ("verified" if entry.is_verified else "pending"),
        "verified_host": entry.verified_host,
        "primary_country": entry.primary_country,
        "last_refreshed": entry.last_refreshed.isoformat() if entry.last_refreshed else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "history": [
            {
                "recorded_on": h.recorded_on.isoformat() if h.recorded_on else None,
                "monthly_visitors": h.monthly_visitors,
                "rank_overall": h.rank_overall,
                "rank_in_category": h.rank_in_category,
            }
            for h in history_rows
        ],
    }


@app.get("/api/leaderboard")
async def list_leaderboard(
    sort: str = "traffic",
    category: Optional[str] = None,
    mrr: Optional[str] = None,
    country: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — list active leaderboard entries with filters, search and pagination.

    Returns `{ entries, total, page, pageSize }`. Sort modes:
        traffic     — by monthly_visitors desc (default)
        engagement  — by engagement_rate desc
        movers      — by visitor_trend desc (positive growth first)
        newest      — by created_at desc
    """
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)

    # Public board only shows VERIFIED entries (GA4 property defaultUri matched
    # the claimed website host, or legacy is_verified=True). Pending /
    # host_mismatch / failed entries stay invisible to the world; the owner can
    # still see them in their settings panel and re-verify.
    base = (
        select(LeaderboardEntry)
        .where(LeaderboardEntry.is_active == True)
        .where(or_(
            LeaderboardEntry.verification_status == "verified",
            LeaderboardEntry.is_verified == True,
        ))
        # Drop entries that have never received GA4 stats (visitors == 0). Most
        # of these are stale / abandoned signups; without this guard a verified
        # entry whose cron never ran would still rank "first" with all zeros.
        .where(LeaderboardEntry.monthly_visitors > 0)
    )

    if category and category != "all":
        base = base.where(LeaderboardEntry.category == category)
    if mrr and mrr != "all":
        base = base.where(LeaderboardEntry.mrr_range == mrr)
    if country and country != "all":
        base = base.where(LeaderboardEntry.primary_country == country.upper())
    if q:
        like = f"%{q.strip().lower()}%"
        base = base.where(
            (func.lower(LeaderboardEntry.startup_name).like(like))
            | (func.lower(LeaderboardEntry.description).like(like))
        )

    if sort == "engagement":
        ordered = base.order_by(LeaderboardEntry.engagement_rate.desc())
    elif sort == "movers":
        ordered = base.order_by(LeaderboardEntry.visitor_trend.desc())
    elif sort == "newest":
        ordered = base.order_by(LeaderboardEntry.created_at.desc())
    else:
        ordered = base.order_by(LeaderboardEntry.monthly_visitors.desc())

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one() or 0

    paginated = ordered.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(paginated)
    entries = result.scalars().all()

    return {
        "entries": [
            {
                "id": e.id,
                "slug": e.slug,
                "startup_name": e.startup_name,
                "description": e.description,
                "website_url": e.website_url,
                "logo_url": e.logo_url,
                "category": e.category,
                "mrr_range": e.mrr_range,
                "looking_for": json.loads(e.looking_for) if e.looking_for else [],
                "twitter_handle": e.twitter_handle,
                "monthly_visitors": e.monthly_visitors,
                "monthly_pageviews": e.monthly_pageviews,
                "engagement_rate": e.engagement_rate,
                "bounce_rate": e.bounce_rate,
                "visitor_trend": e.visitor_trend,
                "is_verified": e.is_verified,
                "verification_status": e.verification_status or ("verified" if e.is_verified else "pending"),
                "primary_country": e.primary_country,
                "last_refreshed": e.last_refreshed.isoformat() if e.last_refreshed else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


def _serialize_entry(entry: LeaderboardEntry) -> dict:
    """Shape used by the user-facing status endpoints (settings page, join page)."""
    return {
        "id": entry.id,
        "slug": entry.slug,
        "is_active": bool(entry.is_active),
        "startup_name": entry.startup_name,
        "description": entry.description,
        "website_url": entry.website_url,
        "logo_url": entry.logo_url,
        "category": entry.category,
        "mrr_range": entry.mrr_range,
        "looking_for": json.loads(entry.looking_for) if entry.looking_for else [],
        "twitter_handle": entry.twitter_handle,
        "founder_name": entry.founder_name,
        "contact_email": entry.contact_email,
        "ga_property_id": entry.ga_property_id,
        "monthly_visitors": entry.monthly_visitors or 0,
        "monthly_pageviews": entry.monthly_pageviews or 0,
        "engagement_rate": entry.engagement_rate or 0,
        "bounce_rate": entry.bounce_rate or 0,
        "visitor_trend": entry.visitor_trend or 0,
        "is_verified": bool(entry.is_verified),
        "verification_status": entry.verification_status or ("verified" if entry.is_verified else "pending"),
        "verified_host": entry.verified_host,
        "primary_country": entry.primary_country,
        "last_refreshed": entry.last_refreshed.isoformat() if entry.last_refreshed else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


@app.post("/api/leaderboard/{identifier}/join")
async def join_leaderboard_for_user(
    identifier: str,
    data: LeaderboardJoinRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Create or upsert a leaderboard entry for the given user.

    Multi-site: a user can register multiple verified sites. We upsert on the
    composite (user_id, ga_property_id) key — joining the same property twice
    updates the existing row instead of duplicating it. A user with no entries
    yet gets a brand-new row; a user already listing site A who joins again
    with site B gets a second row.
    """
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Upsert key is (user_id, ga_property_id). When ga_property_id is None we
    # fall back to a fresh row to avoid collapsing distinct unverified drafts.
    entry = None
    if data.ga_property_id:
        existing = await db.execute(
            select(LeaderboardEntry).where(
                LeaderboardEntry.user_id == user.id,
                LeaderboardEntry.ga_property_id == data.ga_property_id,
            )
        )
        entry = existing.scalar_one_or_none()
    is_new = entry is None

    if entry:
        entry.startup_name = data.startup_name
        if data.description is not None: entry.description = data.description
        if data.website_url is not None: entry.website_url = data.website_url
        if data.logo_url is not None: entry.logo_url = data.logo_url
        if data.category is not None: entry.category = data.category
        if data.mrr_range is not None: entry.mrr_range = data.mrr_range
        if data.looking_for is not None: entry.looking_for = json.dumps(data.looking_for)
        if data.twitter_handle is not None: entry.twitter_handle = data.twitter_handle
        if data.founder_name is not None: entry.founder_name = data.founder_name
        if data.contact_email is not None: entry.contact_email = data.contact_email
        if data.ga_property_id is not None: entry.ga_property_id = data.ga_property_id
        if data.verification_status is not None:
            entry.verification_status = data.verification_status
            entry.is_verified = data.verification_status == "verified"
        if data.verified_host is not None: entry.verified_host = data.verified_host
        entry.is_active = True
        entry.updated_at = datetime.utcnow()
    else:
        slug = await _generate_unique_slug(db, data.startup_name)
        entry = LeaderboardEntry(
            user_id=user.id,
            slug=slug,
            startup_name=data.startup_name,
            description=data.description,
            website_url=data.website_url,
            logo_url=data.logo_url,
            category=data.category or "Other",
            mrr_range=data.mrr_range or "$0-500",
            looking_for=json.dumps(data.looking_for or []),
            twitter_handle=data.twitter_handle,
            founder_name=data.founder_name,
            contact_email=data.contact_email,
            ga_property_id=data.ga_property_id,
            verification_status=data.verification_status or "pending",
            verified_host=data.verified_host,
            is_verified=(data.verification_status == "verified"),
        )
        db.add(entry)

    # Guard the commit — a schema-drifted prod can otherwise raise either an
    # OperationalError (missing column) or IntegrityError (legacy UNIQUE on
    # user_id from before multi-site shipped). The latter is fully self-healing
    # now: we run the migration inline, then retry the insert in a fresh
    # session so the user gets a successful response on this same request
    # instead of having to wait for a deploy.
    try:
        await db.commit()
        await db.refresh(entry)
    except Exception as exc:
        await db.rollback()
        msg = str(exc)
        is_legacy_unique = (
            "UNIQUE constraint failed: leaderboard_entries.user_id" in msg
            or "leaderboard_entries.user_id" in msg and "UNIQUE" in msg
        )
        if is_legacy_unique:
            # Snapshot every value we need into plain primitives BEFORE we
            # touch the original session further — once db.close() has run,
            # any ORM attribute access on `user` or its row could trigger
            # lazy I/O outside an active greenlet (the cause of the previous
            # MissingGreenlet error).
            user_id_int = int(user.id)
            payload = {
                "user_id": user_id_int,
                "startup_name": data.startup_name,
                "description": data.description,
                "website_url": data.website_url,
                "logo_url": data.logo_url,
                "category": data.category or "Other",
                "mrr_range": data.mrr_range or "$0-500",
                "looking_for": json.dumps(data.looking_for or []),
                "twitter_handle": data.twitter_handle,
                "founder_name": data.founder_name,
                "contact_email": data.contact_email,
                "ga_property_id": data.ga_property_id,
                "verification_status": data.verification_status or "pending",
                "verified_host": data.verified_host,
                "is_verified": 1 if data.verification_status == "verified" else 0,
            }

            # Release the original session's connection so SQLite isn't
            # holding a write lock when the migration tries to rebuild the
            # table. Without this, the migration can hang past the proxy
            # timeout and surface as a Cloudflare 502 HTML page.
            try:
                await db.close()
            except Exception:
                pass

            print(f"[join] legacy UNIQUE(user_id) detected — running self-heal migration + insert")
            try:
                # Single transaction: migrate, then insert. Atomic, no
                # cross-connection lock contention, no chance for the table
                # to disappear between operations.
                async with engine.begin() as conn:
                    mig_result = await _ensure_multisite_leaderboard_schema(conn)
                    print(f"[join] self-heal migration: {mig_result}")

                    existing_id = None
                    if payload["ga_property_id"]:
                        row = (await conn.execute(
                            text(
                                "SELECT id FROM leaderboard_entries "
                                "WHERE user_id = :user_id AND ga_property_id = :ga_property_id "
                                "LIMIT 1"
                            ),
                            {"user_id": payload["user_id"], "ga_property_id": payload["ga_property_id"]},
                        )).fetchone()
                        if row:
                            existing_id = int(row[0])

                    if existing_id is not None:
                        await conn.execute(
                            text(
                                "UPDATE leaderboard_entries SET "
                                "startup_name = :startup_name, description = :description, "
                                "website_url = :website_url, logo_url = :logo_url, "
                                "category = :category, mrr_range = :mrr_range, "
                                "looking_for = :looking_for, twitter_handle = :twitter_handle, "
                                "founder_name = :founder_name, contact_email = :contact_email, "
                                "ga_property_id = :ga_property_id, "
                                "verification_status = :verification_status, "
                                "verified_host = :verified_host, is_verified = :is_verified, "
                                "is_active = 1, updated_at = CURRENT_TIMESTAMP "
                                "WHERE id = :id"
                            ),
                            {**payload, "id": existing_id},
                        )
                        final_id = existing_id
                        msg = "Updated leaderboard entry (auto-migrated)"
                    else:
                        # Generate a unique slug via raw SQL — _generate_unique_slug
                        # uses an ORM session which we don't have here.
                        base = _slugify(payload["startup_name"]) or f"site-{user_id_int}"
                        slug = f"{base}-{secrets.token_urlsafe(6).lower().replace('_', '').replace('-', '')[:6]}"
                        for _ in range(4):
                            check = (await conn.execute(
                                text("SELECT 1 FROM leaderboard_entries WHERE slug = :s LIMIT 1"),
                                {"s": slug},
                            )).fetchone()
                            if not check:
                                break
                            slug = f"{base}-{secrets.token_urlsafe(6).lower().replace('_', '').replace('-', '')[:6]}"

                        await conn.execute(
                            text(
                                "INSERT INTO leaderboard_entries ("
                                "user_id, slug, startup_name, description, website_url, logo_url, "
                                "category, mrr_range, looking_for, twitter_handle, founder_name, "
                                "contact_email, ga_property_id, verification_status, verified_host, "
                                "is_verified, is_active, created_at, updated_at"
                                ") VALUES ("
                                ":user_id, :slug, :startup_name, :description, :website_url, :logo_url, "
                                ":category, :mrr_range, :looking_for, :twitter_handle, :founder_name, "
                                ":contact_email, :ga_property_id, :verification_status, :verified_host, "
                                ":is_verified, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP"
                                ")"
                            ),
                            {**payload, "slug": slug},
                        )
                        # Look up by slug — slug is unique so this is reliable
                        # across drivers (lastrowid behaves differently per backend).
                        row = (await conn.execute(
                            text("SELECT id FROM leaderboard_entries WHERE slug = :s"),
                            {"s": slug},
                        )).fetchone()
                        final_id = int(row[0]) if row else 0
                        msg = "Joined leaderboard (auto-migrated)"

                return {"success": True, "id": final_id, "message": msg}
            except Exception as retry_exc:
                import traceback
                print(f"[join] self-heal FAILED: {type(retry_exc).__name__}: {retry_exc}")
                traceback.print_exc()
                raise HTTPException(
                    status_code=500,
                    detail=f"Self-heal failed: {type(retry_exc).__name__}: {str(retry_exc)[:300]}",
                )

        raise HTTPException(
            status_code=500,
            detail=f"Database write failed (likely missing migration): {type(exc).__name__}: {str(exc)[:200]}",
        )

    return {
        "success": True,
        "id": entry.id,
        "message": "Joined leaderboard" if is_new else "Updated leaderboard entry",
    }


async def _resolve_user_entry(
    db: AsyncSession, identifier: str, entry_id: int
) -> LeaderboardEntry:
    """Fetch a leaderboard entry and verify it belongs to the resolved user.

    Used by the entry-scoped PUT/DELETE endpoints — the web layer passes the
    session's GitHub-id-equivalent identifier so admin can prove ownership
    before mutating.
    """
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Leaderboard entry not found")
    return entry


@app.put("/api/leaderboard/entry/{entry_id}")
async def update_leaderboard_entry(
    entry_id: int,
    data: LeaderboardUpdateRequest,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update a single leaderboard entry. Caller must own the entry."""
    entry = await _resolve_user_entry(db, user_identifier, entry_id)

    update_data = data.model_dump(exclude_unset=True)
    if "looking_for" in update_data and update_data["looking_for"] is not None:
        update_data["looking_for"] = json.dumps(update_data["looking_for"])

    for key, value in update_data.items():
        setattr(entry, key, value)
    entry.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)
    return {"success": True, "entry": _serialize_entry(entry)}


@app.delete("/api/leaderboard/entry/{entry_id}")
async def leave_leaderboard_entry(
    entry_id: int,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Opt-out a single leaderboard entry (soft delete — sets is_active=False)."""
    entry = await _resolve_user_entry(db, user_identifier, entry_id)
    entry.is_active = False
    entry.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Entry removed", "id": entry_id}


@app.get("/api/superadmin/leaderboard")
async def superadmin_list_leaderboard(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin: every entry, including pending / inactive / mismatched.

    The public list endpoint hides anything not verified, so superadmin needs
    a parallel route that shows the full backlog with the user attached.
    """
    result = await db.execute(
        select(LeaderboardEntry).order_by(LeaderboardEntry.created_at.desc())
    )
    entries = list(result.scalars().all())
    user_ids = {e.user_id for e in entries}
    user_rows = {}
    if user_ids:
        users_result = await db.execute(
            select(User).where(User.id.in_(user_ids))
        )
        for u in users_result.scalars().all():
            user_rows[u.id] = u
    return {
        "entries": [
            {
                **_serialize_entry(e),
                "user": {
                    "id": user_rows[e.user_id].id,
                    "github_id": user_rows[e.user_id].github_id,
                    "email": user_rows[e.user_id].email,
                    "github_username": user_rows[e.user_id].github_username,
                } if e.user_id in user_rows else None,
            }
            for e in entries
        ],
        "total": len(entries),
    }


class SuperadminLeaderboardAction(BaseModel):
    action: str  # verify | unverify | activate | deactivate | delete


@app.post("/api/superadmin/leaderboard/{entry_id}")
async def superadmin_leaderboard_action(
    entry_id: int,
    body: SuperadminLeaderboardAction,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin moderation: force a verification state, hide, or hard-delete.

    Actions:
        verify      → verification_status='verified', is_verified=True, is_active=True
        unverify    → verification_status='pending', is_verified=False
        activate    → is_active=True (visible if also verified)
        deactivate  → is_active=False (hidden from public board)
        delete      → hard delete the row + its history snapshots
    """
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    action = body.action
    if action == "verify":
        entry.verification_status = "verified"
        entry.is_verified = True
        entry.is_active = True
    elif action == "unverify":
        entry.verification_status = "pending"
        entry.is_verified = False
    elif action == "activate":
        entry.is_active = True
    elif action == "deactivate":
        entry.is_active = False
    elif action == "delete":
        await db.execute(
            delete(LeaderboardStatsHistory).where(
                LeaderboardStatsHistory.entry_id == entry.id
            )
        )
        await db.delete(entry)
        await db.commit()
        return {"success": True, "deleted": entry_id}
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    entry.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(entry)
    return {"success": True, "entry": _serialize_entry(entry)}


@app.get("/api/leaderboard/{identifier}/status")
async def get_leaderboard_status(
    identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Return all of a user's leaderboard entries (active + inactive).

    Settings UI uses this to render one card per registered site and to drive
    the "Add another site" affordance. Empty list ⇒ user has never joined.
    """
    user = await get_user_by_identifier(db, identifier)
    if not user:
        return {"joined": False, "entries": []}

    result = await db.execute(
        select(LeaderboardEntry)
        .where(LeaderboardEntry.user_id == user.id)
        .order_by(LeaderboardEntry.created_at.asc())
    )
    entries = list(result.scalars().all())
    if not entries:
        return {"joined": False, "entries": []}
    return {
        "joined": True,
        "entries": [_serialize_entry(e) for e in entries],
    }


@app.post("/api/leaderboard/refresh")
async def refresh_leaderboard_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Trigger a refresh of all leaderboard entries' GA4 stats.
    Called by the cron job. Returns list of user_ids + their Google OAuth tokens."""
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.is_active == True)
    )
    entries = result.scalars().all()

    refresh_list = []
    for entry in entries:
        # Get the user's Google OAuth credentials
        oauth_result = await db.execute(
            select(OAuthConnection).where(
                OAuthConnection.user_id == entry.user_id,
                OAuthConnection.provider == "google"
            )
        )
        oauth = oauth_result.scalars().first()
        if oauth and oauth.access_token:
            refresh_list.append({
                "user_id": entry.user_id,
                "entry_id": entry.id,
                "ga_property_id": entry.ga_property_id,
                "website_url": entry.website_url,
                "access_token": oauth.access_token,
                "refresh_token": oauth.refresh_token,
            })

    return {"entries": refresh_list, "total": len(refresh_list)}


@app.patch("/api/leaderboard/{entry_id}/stats")
async def update_leaderboard_stats(
    entry_id: int,
    stats: dict,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update GA4 stats for a leaderboard entry (called by cron after fetching GA4 data).

    Also writes a daily snapshot to leaderboard_stats_history (idempotent on (entry_id, recorded_on))
    so the per-entry sparkline and weekly-mover rail have data to draw on.
    """
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if "monthly_visitors" in stats:
        entry.monthly_visitors = stats["monthly_visitors"]
    if "monthly_pageviews" in stats:
        entry.monthly_pageviews = stats["monthly_pageviews"]
    if "engagement_rate" in stats:
        entry.engagement_rate = stats["engagement_rate"]
    if "bounce_rate" in stats:
        entry.bounce_rate = stats["bounce_rate"]
    if "avg_session_duration" in stats:
        entry.avg_session_duration = stats["avg_session_duration"]
    if "visitor_trend" in stats:
        entry.visitor_trend = stats["visitor_trend"]
    if "primary_country" in stats:
        entry.primary_country = stats["primary_country"]
    if "verification_status" in stats:
        entry.verification_status = stats["verification_status"]
        entry.is_verified = stats["verification_status"] == "verified"
    if "verified_host" in stats:
        entry.verified_host = stats["verified_host"]

    # Default verification flag stays in sync with status; if no status sent, mark as verified
    # only when we have actual GA4 numbers to back the listing.
    if "verification_status" not in stats and entry.monthly_visitors and entry.monthly_visitors > 0:
        entry.is_verified = entry.verification_status == "verified" or entry.is_verified
    entry.last_refreshed = datetime.utcnow()

    # Upsert today's history snapshot. (entry_id, recorded_on) is unique so re-runs of the cron
    # on the same UTC day overwrite rather than duplicating.
    today = date.today()
    history_lookup = await db.execute(
        select(LeaderboardStatsHistory).where(
            LeaderboardStatsHistory.entry_id == entry.id,
            LeaderboardStatsHistory.recorded_on == today,
        )
    )
    history = history_lookup.scalar_one_or_none()
    if history is None:
        history = LeaderboardStatsHistory(entry_id=entry.id, recorded_on=today)
        db.add(history)
    history.monthly_visitors = entry.monthly_visitors or 0
    history.monthly_pageviews = entry.monthly_pageviews or 0
    history.engagement_rate = entry.engagement_rate or 0.0
    history.bounce_rate = entry.bounce_rate or 0.0
    history.avg_session_duration = entry.avg_session_duration or 0.0
    history.visitor_trend = entry.visitor_trend or 0.0
    if "rank_overall" in stats:
        history.rank_overall = stats["rank_overall"]
    if "rank_in_category" in stats:
        history.rank_in_category = stats["rank_in_category"]

    await db.commit()
    return {"success": True}


class HistoryBackfillRequest(BaseModel):
    days: List[Dict[str, Any]]  # [{date, monthly_visitors, monthly_pageviews?, engagement_rate?, bounce_rate?, avg_session_duration?}]


@app.post("/api/leaderboard/{entry_id}/history/backfill")
async def backfill_leaderboard_history(
    entry_id: int,
    body: HistoryBackfillRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Bulk-upsert per-day history rows for the visitor sparkline.

    Called by the web join route right after a new entry's first GA4 fetch so
    the chart shows real 30-day history immediately instead of being a flat
    line until the daily cron has run for a month. Idempotent on
    (entry_id, recorded_on) — re-running with the same dates overwrites.
    """
    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    upserted = 0
    for row in body.days:
        raw_date = row.get("date")
        if not raw_date:
            continue
        try:
            # Accept either "YYYYMMDD" (GA4 native) or "YYYY-MM-DD".
            cleaned = str(raw_date).replace("-", "")
            recorded_on = date(int(cleaned[:4]), int(cleaned[4:6]), int(cleaned[6:8]))
        except (ValueError, IndexError):
            continue

        existing = await db.execute(
            select(LeaderboardStatsHistory).where(
                LeaderboardStatsHistory.entry_id == entry.id,
                LeaderboardStatsHistory.recorded_on == recorded_on,
            )
        )
        history = existing.scalar_one_or_none()
        if history is None:
            history = LeaderboardStatsHistory(entry_id=entry.id, recorded_on=recorded_on)
            db.add(history)
        history.monthly_visitors = int(row.get("monthly_visitors", 0) or 0)
        history.monthly_pageviews = int(row.get("monthly_pageviews", 0) or 0)
        history.engagement_rate = float(row.get("engagement_rate", 0) or 0)
        history.bounce_rate = float(row.get("bounce_rate", 0) or 0)
        history.avg_session_duration = float(row.get("avg_session_duration", 0) or 0)
        upserted += 1

    await db.commit()
    return {"success": True, "upserted": upserted}


# ============= Annotations =============

VALID_ANNOTATION_CATEGORIES = {"marketing", "technical", "product", "algorithm_update", "custom"}

class AnnotationCreate(BaseModel):
    user_identifier: str
    date: str  # YYYY-MM-DD
    category: str = "custom"
    title: str
    description: Optional[str] = None
    color: Optional[str] = None
    url: Optional[str] = None
    source: str = "manual"
    property_id: Optional[str] = None

class AnnotationUpdate(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    url: Optional[str] = None
    property_id: Optional[str] = None


@app.post("/api/annotations")
async def create_annotation(
    data: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Create a chart annotation."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.category not in VALID_ANNOTATION_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Options: {list(VALID_ANNOTATION_CATEGORIES)}")

    annotation = Annotation(
        user_id=user.id,
        date=data.date[:10],
        category=data.category,
        title=data.title[:200],
        description=data.description[:2000] if data.description else None,
        color=data.color,
        url=data.url[:500] if data.url else None,
        source=data.source,
        property_id=data.property_id,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)

    return {
        "id": annotation.id,
        "date": annotation.date,
        "category": annotation.category,
        "title": annotation.title,
        "description": annotation.description,
        "color": annotation.color,
        "url": annotation.url,
        "source": annotation.source,
        "property_id": annotation.property_id,
        "created_at": annotation.created_at.isoformat() if annotation.created_at else None,
    }


@app.get("/api/annotations")
async def list_annotations(
    user_identifier: str,
    property_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List annotations for a user, optionally filtered by property and date range."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return []

    query = select(Annotation).where(Annotation.user_id == user.id)

    if property_id:
        # Return annotations scoped to this property OR global (null property_id)
        query = query.where(
            (Annotation.property_id == property_id) | (Annotation.property_id.is_(None))
        )

    if start_date:
        query = query.where(Annotation.date >= start_date)
    if end_date:
        query = query.where(Annotation.date <= end_date)

    query = query.order_by(Annotation.date.desc())

    result = await db.execute(query)
    annotations = result.scalars().all()

    return [
        {
            "id": a.id,
            "date": a.date,
            "category": a.category,
            "title": a.title,
            "description": a.description,
            "color": a.color,
            "url": a.url,
            "source": a.source,
            "property_id": a.property_id,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in annotations
    ]


@app.put("/api/annotations/{annotation_id}")
async def update_annotation(
    annotation_id: int,
    data: AnnotationUpdate,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update a chart annotation (only the owner can update)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(Annotation).where(Annotation.id == annotation_id, Annotation.user_id == user.id)
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    update_data = data.model_dump(exclude_unset=True)
    if "category" in update_data and update_data["category"] not in VALID_ANNOTATION_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Options: {list(VALID_ANNOTATION_CATEGORIES)}")

    for key, value in update_data.items():
        setattr(annotation, key, value)
    annotation.updated_at = datetime.utcnow()

    await db.commit()
    return {
        "id": annotation.id,
        "date": annotation.date,
        "category": annotation.category,
        "title": annotation.title,
        "description": annotation.description,
        "color": annotation.color,
        "url": annotation.url,
        "source": annotation.source,
        "property_id": annotation.property_id,
        "updated_at": annotation.updated_at.isoformat() if annotation.updated_at else None,
    }


@app.delete("/api/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: int,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Delete a chart annotation (only the owner can delete)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(Annotation).where(Annotation.id == annotation_id, Annotation.user_id == user.id)
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    await db.delete(annotation)
    await db.commit()
    return {"success": True, "deleted_id": annotation_id}


# ============= Analytics Goals & Funnels =============

class AnalyticsGoalDefinitionCreate(BaseModel):
    user_identifier: str
    property_id: str
    name: str
    description: Optional[str] = None
    goal_type: str = "page_visit"
    rule_json: str = "{}"
    is_active: Optional[bool] = True


class AnalyticsGoalDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    goal_type: Optional[str] = None
    rule_json: Optional[str] = None
    is_active: Optional[bool] = None


class AnalyticsFunnelDefinitionCreate(BaseModel):
    user_identifier: str
    property_id: str
    name: str
    description: Optional[str] = None
    steps_json: str = "[]"
    is_active: Optional[bool] = True


class AnalyticsFunnelDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    steps_json: Optional[str] = None
    is_active: Optional[bool] = None


def _goal_definition_to_dict(definition: AnalyticsGoalDefinition):
    parsed_rule = {}
    try:
        parsed_rule = json.loads(definition.rule_json or "{}")
    except Exception:
        parsed_rule = {}

    return {
        "id": definition.id,
        "propertyId": definition.property_id,
        "name": definition.name,
        "description": definition.description,
        "type": definition.goal_type,
        "target": parsed_rule.get("target", ""),
        "rule": parsed_rule,
        "isActive": bool(definition.is_active),
        "createdAt": definition.created_at.isoformat() if definition.created_at else None,
        "updatedAt": definition.updated_at.isoformat() if definition.updated_at else None,
    }


def _funnel_definition_to_dict(definition: AnalyticsFunnelDefinition):
    parsed_steps = []
    try:
        parsed_steps = json.loads(definition.steps_json or "[]")
    except Exception:
        parsed_steps = []

    return {
        "id": definition.id,
        "propertyId": definition.property_id,
        "name": definition.name,
        "description": definition.description,
        "steps": parsed_steps if isinstance(parsed_steps, list) else [],
        "isActive": bool(definition.is_active),
        "createdAt": definition.created_at.isoformat() if definition.created_at else None,
        "updatedAt": definition.updated_at.isoformat() if definition.updated_at else None,
    }


@app.get("/api/analytics/goals/definitions")
async def list_goal_definitions(
    user_identifier: str,
    property_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"definitions": []}

    stmt = select(AnalyticsGoalDefinition).where(
        AnalyticsGoalDefinition.user_id == user.id,
        AnalyticsGoalDefinition.is_active == True,
    )
    if property_id:
        stmt = stmt.where(AnalyticsGoalDefinition.property_id == property_id)
    stmt = stmt.order_by(AnalyticsGoalDefinition.updated_at.desc())

    result = await db.execute(stmt)
    definitions = result.scalars().all()
    return {"definitions": [_goal_definition_to_dict(definition) for definition in definitions]}


@app.post("/api/analytics/goals/definitions")
async def create_goal_definition(
    data: AnalyticsGoalDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    import uuid

    definition = AnalyticsGoalDefinition(
        id=str(uuid.uuid4()),
        user_id=user.id,
        property_id=data.property_id,
        name=data.name,
        description=data.description,
        goal_type=data.goal_type,
        rule_json=data.rule_json or "{}",
        is_active=data.is_active if data.is_active is not None else True,
    )
    db.add(definition)
    await db.commit()
    await db.refresh(definition)
    return _goal_definition_to_dict(definition)


@app.put("/api/analytics/goals/definitions/{definition_id}")
async def update_goal_definition(
    definition_id: str,
    data: AnalyticsGoalDefinitionUpdate,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(AnalyticsGoalDefinition).where(
            AnalyticsGoalDefinition.id == definition_id,
            AnalyticsGoalDefinition.user_id == user.id,
            AnalyticsGoalDefinition.is_active == True,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Goal definition not found")

    if data.name is not None:
        definition.name = data.name
    if data.description is not None:
        definition.description = data.description
    if data.goal_type is not None:
        definition.goal_type = data.goal_type
    if data.rule_json is not None:
        definition.rule_json = data.rule_json
    if data.is_active is not None:
        definition.is_active = data.is_active
    definition.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(definition)
    return _goal_definition_to_dict(definition)


@app.delete("/api/analytics/goals/definitions/{definition_id}")
async def delete_goal_definition(
    definition_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(AnalyticsGoalDefinition).where(
            AnalyticsGoalDefinition.id == definition_id,
            AnalyticsGoalDefinition.user_id == user.id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Goal definition not found")

    definition.is_active = False
    definition.updated_at = datetime.utcnow()
    await db.commit()
    return {"deleted": True, "id": definition_id}


@app.get("/api/analytics/funnels/definitions")
async def list_funnel_definitions(
    user_identifier: str,
    property_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"definitions": []}

    stmt = select(AnalyticsFunnelDefinition).where(
        AnalyticsFunnelDefinition.user_id == user.id,
        AnalyticsFunnelDefinition.is_active == True,
    )
    if property_id:
        stmt = stmt.where(AnalyticsFunnelDefinition.property_id == property_id)
    stmt = stmt.order_by(AnalyticsFunnelDefinition.updated_at.desc())

    result = await db.execute(stmt)
    definitions = result.scalars().all()
    return {"definitions": [_funnel_definition_to_dict(definition) for definition in definitions]}


@app.post("/api/analytics/funnels/definitions")
async def create_funnel_definition(
    data: AnalyticsFunnelDefinitionCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    import uuid

    definition = AnalyticsFunnelDefinition(
        id=str(uuid.uuid4()),
        user_id=user.id,
        property_id=data.property_id,
        name=data.name,
        description=data.description,
        steps_json=data.steps_json or "[]",
        is_active=data.is_active if data.is_active is not None else True,
    )
    db.add(definition)
    await db.commit()
    await db.refresh(definition)
    return _funnel_definition_to_dict(definition)


@app.put("/api/analytics/funnels/definitions/{definition_id}")
async def update_funnel_definition(
    definition_id: str,
    data: AnalyticsFunnelDefinitionUpdate,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(AnalyticsFunnelDefinition).where(
            AnalyticsFunnelDefinition.id == definition_id,
            AnalyticsFunnelDefinition.user_id == user.id,
            AnalyticsFunnelDefinition.is_active == True,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Funnel definition not found")

    if data.name is not None:
        definition.name = data.name
    if data.description is not None:
        definition.description = data.description
    if data.steps_json is not None:
        definition.steps_json = data.steps_json
    if data.is_active is not None:
        definition.is_active = data.is_active
    definition.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(definition)
    return _funnel_definition_to_dict(definition)


@app.delete("/api/analytics/funnels/definitions/{definition_id}")
async def delete_funnel_definition(
    definition_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(AnalyticsFunnelDefinition).where(
            AnalyticsFunnelDefinition.id == definition_id,
            AnalyticsFunnelDefinition.user_id == user.id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Funnel definition not found")

    definition.is_active = False
    definition.updated_at = datetime.utcnow()
    await db.commit()
    return {"deleted": True, "id": definition_id}


# ============= Custom Dashboards (Dashboard Builder) =============

class CustomDashboardCreate(BaseModel):
    user_identifier: str
    name: str
    description: Optional[str] = None
    property_id: str
    site_url: Optional[str] = None
    widgets: Optional[str] = "[]"         # JSON string
    grid_layouts: Optional[str] = '{"lg":[],"md":[],"sm":[]}'
    theme: Optional[str] = "{}"

class CustomDashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    widgets: Optional[str] = None
    grid_layouts: Optional[str] = None
    theme: Optional[str] = None
    is_public: Optional[bool] = None
    embed_enabled: Optional[bool] = None


def _dashboard_to_dict(d, user_identifier: str = None):
    """Convert a CustomDashboard ORM object to camelCase dict."""
    return {
        "id": d.id,
        "userId": user_identifier or str(d.user_id),
        "name": d.name,
        "description": d.description,
        "propertyId": d.property_id,
        "siteUrl": d.site_url,
        "widgets": json.loads(d.widgets) if d.widgets else [],
        "gridLayouts": json.loads(d.grid_layouts) if d.grid_layouts else {"lg": [], "md": [], "sm": []},
        "theme": json.loads(d.theme) if d.theme else {},
        "isPublic": bool(d.is_public),
        "shareToken": d.share_token,
        "embedEnabled": bool(d.embed_enabled),
        "isTemplate": bool(d.is_template),
        "views": d.views or 0,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
    }


@app.post("/api/custom-dashboards")
async def create_custom_dashboard(
    data: CustomDashboardCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Create a new custom dashboard."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    import uuid
    dashboard_id = str(uuid.uuid4())

    dashboard = CustomDashboard(
        id=dashboard_id,
        user_id=user.id,
        name=data.name,
        description=data.description,
        property_id=data.property_id,
        site_url=data.site_url or "",
        widgets=data.widgets or "[]",
        grid_layouts=data.grid_layouts or '{"lg":[],"md":[],"sm":[]}',
        theme=data.theme or "{}",
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)

    return _dashboard_to_dict(dashboard, data.user_identifier)


@app.get("/api/custom-dashboards")
async def list_custom_dashboards(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List all active custom dashboards for a user."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"dashboards": []}

    result = await db.execute(
        select(CustomDashboard)
        .where(CustomDashboard.user_id == user.id, CustomDashboard.is_active == True)
        .order_by(CustomDashboard.updated_at.desc())
    )
    dashboards = result.scalars().all()

    return {
        "dashboards": [
            {
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "propertyId": d.property_id,
                "widgetCount": len(json.loads(d.widgets)) if d.widgets else 0,
                "isPublic": bool(d.is_public),
                "shareToken": d.share_token,
                "views": d.views or 0,
                "createdAt": d.created_at.isoformat() if d.created_at else None,
                "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in dashboards
        ]
    }


@app.get("/api/custom-dashboards/{dashboard_id}")
async def get_custom_dashboard(
    dashboard_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Get a custom dashboard by ID."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
            CustomDashboard.is_active == True,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return _dashboard_to_dict(dashboard, user_identifier)


@app.put("/api/custom-dashboards/{dashboard_id}")
async def update_custom_dashboard(
    dashboard_id: str,
    data: CustomDashboardUpdate,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update a custom dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
            CustomDashboard.is_active == True,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if data.name is not None:
        dashboard.name = data.name
    if data.description is not None:
        dashboard.description = data.description
    if data.widgets is not None:
        dashboard.widgets = data.widgets
    if data.grid_layouts is not None:
        dashboard.grid_layouts = data.grid_layouts
    if data.theme is not None:
        dashboard.theme = data.theme
    if data.is_public is not None:
        dashboard.is_public = data.is_public
    if data.embed_enabled is not None:
        dashboard.embed_enabled = data.embed_enabled
    dashboard.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(dashboard)

    return _dashboard_to_dict(dashboard, user_identifier)


@app.delete("/api/custom-dashboards/{dashboard_id}")
async def delete_custom_dashboard(
    dashboard_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Soft-delete a custom dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    dashboard.is_active = False
    await db.commit()
    return {"deleted": True, "id": dashboard_id}


@app.post("/api/custom-dashboards/{dashboard_id}/share")
async def share_custom_dashboard(
    dashboard_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Generate a share token for a custom dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
            CustomDashboard.is_active == True,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if not dashboard.share_token:
        dashboard.share_token = secrets.token_hex(16)
    dashboard.is_public = True
    await db.commit()
    await db.refresh(dashboard)

    return {"shareToken": dashboard.share_token, "id": dashboard.id}


@app.delete("/api/custom-dashboards/{dashboard_id}/share")
async def unshare_custom_dashboard(
    dashboard_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Revoke sharing for a custom dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    dashboard.share_token = None
    dashboard.is_public = False
    await db.commit()
    return {"unshared": True, "id": dashboard_id}


@app.post("/api/custom-dashboards/{dashboard_id}/duplicate")
async def duplicate_custom_dashboard(
    dashboard_id: str,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Clone a custom dashboard."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.id == dashboard_id,
            CustomDashboard.user_id == user.id,
            CustomDashboard.is_active == True,
        )
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    import uuid
    new_id = str(uuid.uuid4())

    clone = CustomDashboard(
        id=new_id,
        user_id=user.id,
        name=f"{original.name} (copy)",
        description=original.description,
        property_id=original.property_id,
        site_url=original.site_url,
        widgets=original.widgets,
        grid_layouts=original.grid_layouts,
        theme=original.theme,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)

    return _dashboard_to_dict(clone, user_identifier)


@app.get("/api/custom-dashboards/public/{token}")
async def get_public_custom_dashboard(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: get a shared custom dashboard by share token. NO auth required."""
    result = await db.execute(
        select(CustomDashboard).where(
            CustomDashboard.share_token == token,
            CustomDashboard.is_public == True,
            CustomDashboard.is_active == True,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Increment views
    dashboard.views = (dashboard.views or 0) + 1
    await db.commit()

    # Resolve owner identifier for Google token lookup
    user_result = await db.execute(select(User).where(User.id == dashboard.user_id))
    owner = user_result.scalar_one_or_none()
    user_identifier = None
    if owner:
        user_identifier = owner.github_id or owner.email

    return {
        **_dashboard_to_dict(dashboard, user_identifier),
        "ownerIdentifier": user_identifier,
    }


# ============= Chat Threads & Messages (Phase B-1: server-side memory) =============
class ChatThreadCreate(BaseModel):
    user_identifier: str
    id: str  # client-generated UUID
    title: Optional[str] = None
    persona: Optional[str] = None
    site_url: Optional[str] = None
    repo: Optional[str] = None


class ChatThreadUpdate(BaseModel):
    title: Optional[str] = None
    persona: Optional[str] = None
    summary: Optional[str] = None
    summary_updated_at_msg: Optional[int] = None
    archived: Optional[bool] = None


class ChatMessageCreate(BaseModel):
    user_identifier: str
    role: str  # user | assistant
    content: Optional[str] = None
    tools_json: Optional[str] = None
    model: Optional[str] = None
    intent: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    latency_ms: Optional[int] = None


def _serialize_thread(t: ChatThread) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "persona": t.persona,
        "site_url": t.site_url,
        "repo": t.repo,
        "summary": t.summary,
        "summary_updated_at_msg": t.summary_updated_at_msg,
        "archived": t.archived,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _serialize_message(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "thread_id": m.thread_id,
        "role": m.role,
        "content": m.content,
        "tools_json": m.tools_json,
        "model": m.model,
        "intent": m.intent,
        "input_tokens": m.input_tokens,
        "output_tokens": m.output_tokens,
        "latency_ms": m.latency_ms,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@app.get("/api/chat/threads")
async def list_chat_threads(
    user_identifier: str,
    include_archived: bool = False,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List threads for a user, newest first."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"threads": []}
    q = select(ChatThread).where(ChatThread.user_id == user.id)
    if not include_archived:
        q = q.where(ChatThread.archived == False)  # noqa: E712
    q = q.order_by(ChatThread.last_message_at.desc()).limit(min(max(1, limit), 200))
    result = await db.execute(q)
    threads = result.scalars().all()
    return {"threads": [_serialize_thread(t) for t in threads]}


@app.post("/api/chat/threads")
async def create_chat_thread(
    data: ChatThreadCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Create (or upsert) a thread."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Upsert — if a thread with this id already exists, update its mutable fields.
    existing = await db.execute(select(ChatThread).where(ChatThread.id == data.id))
    t = existing.scalar_one_or_none()
    if t:
        if t.user_id != user.id:
            raise HTTPException(status_code=403, detail="Thread belongs to a different user")
        if data.title is not None: t.title = data.title[:255]
        if data.persona is not None: t.persona = data.persona[:40]
        if data.site_url is not None: t.site_url = data.site_url[:500]
        if data.repo is not None: t.repo = data.repo[:255]
    else:
        t = ChatThread(
            id=data.id,
            user_id=user.id,
            title=(data.title or "New conversation")[:255],
            persona=data.persona,
            site_url=data.site_url,
            repo=data.repo,
        )
        db.add(t)
    await db.commit()
    await db.refresh(t)
    return _serialize_thread(t)


@app.patch("/api/chat/threads/{thread_id}")
async def update_chat_thread(
    thread_id: str,
    data: ChatThreadUpdate,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Patch thread fields (title, summary, archived…)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    t = result.scalar_one_or_none()
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    if data.title is not None: t.title = data.title[:255]
    if data.persona is not None: t.persona = data.persona[:40]
    if data.summary is not None: t.summary = data.summary[:8000]
    if data.summary_updated_at_msg is not None: t.summary_updated_at_msg = data.summary_updated_at_msg
    if data.archived is not None: t.archived = data.archived
    await db.commit()
    await db.refresh(t)
    return _serialize_thread(t)


@app.delete("/api/chat/threads/{thread_id}")
async def delete_chat_thread(
    thread_id: str,
    user_identifier: str,
    hard: bool = False,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Archive (default) or hard-delete a thread + its messages."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    t = result.scalar_one_or_none()
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    if hard:
        await db.execute(delete(ChatMessage).where(ChatMessage.thread_id == thread_id))
        await db.delete(t)
    else:
        t.archived = True
    await db.commit()
    return {"ok": True, "hard": hard}


@app.get("/api/chat/threads/{thread_id}/messages")
async def list_chat_messages(
    thread_id: str,
    user_identifier: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List messages for a thread (oldest first)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"messages": []}
    # Verify thread belongs to user
    tres = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    t = tres.scalar_one_or_none()
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    q = select(ChatMessage).where(ChatMessage.thread_id == thread_id) \
        .order_by(ChatMessage.created_at.asc()) \
        .limit(min(max(1, limit), 500))
    result = await db.execute(q)
    msgs = result.scalars().all()
    return {"messages": [_serialize_message(m) for m in msgs], "summary": t.summary}


@app.post("/api/chat/threads/{thread_id}/messages")
async def append_chat_message(
    thread_id: str,
    data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Append a message to a thread + bump last_message_at on the thread."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tres = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    t = tres.scalar_one_or_none()
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    if data.role not in ("user", "assistant"):
        raise HTTPException(status_code=400, detail="role must be user or assistant")
    m = ChatMessage(
        thread_id=thread_id,
        role=data.role,
        content=data.content,
        tools_json=data.tools_json,
        model=data.model,
        intent=data.intent,
        input_tokens=data.input_tokens,
        output_tokens=data.output_tokens,
        latency_ms=data.latency_ms,
    )
    db.add(m)
    t.last_message_at = datetime.utcnow()
    await db.commit()
    await db.refresh(m)
    return _serialize_message(m)


# ============= Chat Facts (Phase B-1: durable user facts) =============
class ChatFactUpsert(BaseModel):
    user_identifier: str
    scope: str = 'global'                # global | site | repo | correction
    scope_value: Optional[str] = None
    key: str
    value: str
    confidence: float = 0.7
    source_message_id: Optional[int] = None
    source_thread_id: Optional[str] = None


def _serialize_fact(f: ChatFact) -> dict:
    return {
        "id": f.id,
        "scope": f.scope,
        "scope_value": f.scope_value,
        "key": f.key,
        "value": f.value,
        "confidence": f.confidence,
        "source_message_id": f.source_message_id,
        "source_thread_id": f.source_thread_id,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


@app.get("/api/chat/facts")
async def list_chat_facts(
    user_identifier: str,
    scope: Optional[str] = None,
    min_confidence: float = 0.0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """List a user's facts, newest-first."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"facts": []}
    q = select(ChatFact).where(ChatFact.user_id == user.id, ChatFact.superseded_at.is_(None))
    if scope:
        q = q.where(ChatFact.scope == scope)
    if min_confidence > 0:
        q = q.where(ChatFact.confidence >= min_confidence)
    q = q.order_by(ChatFact.updated_at.desc()).limit(min(max(1, limit), 200))
    result = await db.execute(q)
    return {"facts": [_serialize_fact(f) for f in result.scalars().all()]}


@app.post("/api/chat/facts")
async def upsert_chat_fact(
    data: ChatFactUpsert,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Upsert a fact. Conflicting facts (same scope+scope_value+key) are
    superseded — newest wins unless its confidence is materially lower."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.scope not in ('global', 'site', 'repo', 'correction'):
        raise HTTPException(status_code=400, detail="invalid scope")
    if not data.key or not data.value:
        raise HTTPException(status_code=400, detail="key and value are required")

    # Find an existing matching fact and supersede if confidence improves OR scope=correction
    existing_q = select(ChatFact).where(
        ChatFact.user_id == user.id,
        ChatFact.scope == data.scope,
        ChatFact.key == data.key[:80],
        ChatFact.superseded_at.is_(None),
    )
    if data.scope_value:
        existing_q = existing_q.where(ChatFact.scope_value == data.scope_value[:255])
    existing = (await db.execute(existing_q)).scalars().all()
    for prev in existing:
        # Don't replace a higher-confidence fact with a lower one (unless this is a correction)
        if data.scope != 'correction' and prev.confidence > data.confidence + 0.15:
            continue
        prev.superseded_at = datetime.utcnow()

    fact = ChatFact(
        user_id=user.id,
        scope=data.scope,
        scope_value=data.scope_value[:255] if data.scope_value else None,
        key=data.key[:80],
        value=data.value[:2000],
        confidence=max(0.0, min(1.0, data.confidence)),
        source_message_id=data.source_message_id,
        source_thread_id=data.source_thread_id,
    )
    db.add(fact)
    await db.commit()
    await db.refresh(fact)
    return _serialize_fact(fact)


@app.delete("/api/chat/facts/{fact_id}")
async def delete_chat_fact(
    fact_id: int,
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Soft-delete a fact (mark superseded). Lets users curate their memory."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    res = await db.execute(select(ChatFact).where(ChatFact.id == fact_id, ChatFact.user_id == user.id))
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Fact not found")
    f.superseded_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ============= Chat Feedback (Phase B-7-min: thumbs + reasons) =============
class ChatFeedbackCreate(BaseModel):
    user_identifier: str
    message_id: int
    thread_id: Optional[str] = None
    rating: str  # up | down
    reason: Optional[str] = None
    comment: Optional[str] = None


@app.post("/api/chat/feedback")
async def submit_chat_feedback(
    data: ChatFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Record a thumbs-up/down on an assistant message."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.rating not in ('up', 'down'):
        raise HTTPException(status_code=400, detail="rating must be up or down")
    fb = ChatFeedback(
        user_id=user.id,
        message_id=data.message_id,
        thread_id=data.thread_id,
        rating=data.rating,
        reason=(data.reason or None) and data.reason[:40],
        comment=(data.comment or None) and data.comment[:1000],
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {"id": fb.id, "ok": True}


# ============= Chat Stats (Phase B-7-min: observability) =============
@app.get("/api/chat/stats")
async def chat_stats(
    user_identifier: str,
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Per-user chat rollup: latency p50/p95, intent distribution, error rate,
    thumbs-up rate. Lightweight — used by the per-user observability strip,
    not a full admin dashboard (that's the next session's B7-full)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"messages": 0, "threads": 0, "intents": {}, "thumbs": {"up": 0, "down": 0}}
    cutoff = datetime.utcnow() - timedelta(days=max(1, min(90, days)))

    # Threads
    threads_count = (await db.execute(
        select(func.count(ChatThread.id)).where(ChatThread.user_id == user.id, ChatThread.created_at >= cutoff)
    )).scalar() or 0

    # Messages — count + intent distribution + latency samples
    msgs_q = select(ChatMessage).join(ChatThread, ChatThread.id == ChatMessage.thread_id) \
        .where(ChatThread.user_id == user.id, ChatMessage.created_at >= cutoff)
    msgs = (await db.execute(msgs_q)).scalars().all()

    intents: dict = {}
    latencies: list = []
    assistant_count = 0
    for m in msgs:
        if m.role == 'assistant':
            assistant_count += 1
            if m.intent:
                intents[m.intent] = intents.get(m.intent, 0) + 1
            if isinstance(m.latency_ms, int) and m.latency_ms > 0:
                latencies.append(m.latency_ms)

    latencies.sort()
    def pctl(p: float) -> int:
        if not latencies: return 0
        idx = max(0, min(len(latencies) - 1, int(round(p * (len(latencies) - 1)))))
        return int(latencies[idx])

    # Feedback
    fb_q = select(ChatFeedback).where(ChatFeedback.user_id == user.id, ChatFeedback.created_at >= cutoff)
    fbs = (await db.execute(fb_q)).scalars().all()
    up = sum(1 for f in fbs if f.rating == 'up')
    down = sum(1 for f in fbs if f.rating == 'down')

    return {
        "windowDays": days,
        "threads": threads_count,
        "messages": len(msgs),
        "assistantMessages": assistant_count,
        "intents": intents,
        "latencyMs": {
            "p50": pctl(0.50),
            "p95": pctl(0.95),
            "p99": pctl(0.99),
            "samples": len(latencies),
        },
        "thumbs": {
            "up": up,
            "down": down,
            "rate": (up / (up + down)) if (up + down) > 0 else None,
        },
    }


# ============= Chat Feedback (superadmin dashboard surfaces) =============
@app.get("/api/admin/chat-feedback-summary")
async def chat_feedback_summary(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Aggregate up/down counts per user — single SQL GROUP BY, no N+1.
    Used by the superadmin user list to render the FEEDBACK column without
    fan-out queries (123 users × 1 query each was the alternative)."""
    q = select(
        ChatFeedback.user_id,
        func.sum(case((ChatFeedback.rating == 'up', 1), else_=0)).label('up'),
        func.sum(case((ChatFeedback.rating == 'down', 1), else_=0)).label('down'),
    ).group_by(ChatFeedback.user_id)
    rows = (await db.execute(q)).all()
    # Returns a map keyed by user_id (int) → counts. Web layer joins this
    # against the user list it already has, no further lookup needed.
    return {
        "by_user_id": {
            int(r.user_id): {"up": int(r.up or 0), "down": int(r.down or 0)}
            for r in rows
        },
    }


@app.get("/api/admin/users/{user_identifier}/chat-feedback")
async def user_chat_feedback(
    user_identifier: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Recent feedback rows for one user, newest first. Used by the
    superadmin inline-expand below the user row. Joins ChatMessage to
    include a short excerpt of the message being rated so admins can see
    context without a second click. Capped at 200 to keep the payload
    bounded if a user gets very prolific."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    capped = max(1, min(200, limit))
    q = (
        select(ChatFeedback, ChatMessage.content)
        .outerjoin(ChatMessage, ChatMessage.id == ChatFeedback.message_id)
        .where(ChatFeedback.user_id == user.id)
        .order_by(ChatFeedback.created_at.desc())
        .limit(capped)
    )
    rows = (await db.execute(q)).all()
    return {
        "user_id": user.id,
        "items": [
            {
                "id": fb.id,
                "rating": fb.rating,
                "reason": fb.reason,
                "comment": fb.comment,
                "thread_id": fb.thread_id,
                "message_id": fb.message_id,
                "message_excerpt": (msg_content[:300] if msg_content else None),
                "created_at": fb.created_at.isoformat() if fb.created_at else None,
            }
            for fb, msg_content in rows
        ],
    }


# ============= Chat Embeddings (B1-full: semantic recall) =============
class ChatEmbeddingCreate(BaseModel):
    user_identifier: str
    source_kind: str  # turn | fact
    source_id: str
    thread_id: Optional[str] = None
    text_excerpt: Optional[str] = None
    vector: list[float]
    model: str = 'text-embedding-004'


class ChatEmbeddingQuery(BaseModel):
    user_identifier: str
    vector: list[float]
    top_k: int = 5
    source_kinds: Optional[list[str]] = None  # filter to ['turn','fact'] etc.


# ═══════════════════════════════════════════════════════════════════════════
# Chat thread state (anti-repetition runtime state)
# ═══════════════════════════════════════════════════════════════════════════

class ChatThreadStateUpsert(BaseModel):
    user_identifier: str
    thread_id: str
    surfaced_insight_ids: Optional[list[str]] = None
    surfaced_suggestion_questions: Optional[list[str]] = None
    surfaced_surprises: Optional[list[str]] = None
    last_question_fingerprints: Optional[list[dict]] = None


def _serialize_thread_state(s: ChatThreadState) -> dict:
    import json as _json
    def _parse(v):
        if not v: return []
        try: return _json.loads(v)
        except Exception: return []
    return {
        "thread_id": s.thread_id,
        "surfaced_insight_ids": _parse(s.surfaced_insight_ids),
        "surfaced_suggestion_questions": _parse(s.surfaced_suggestion_questions),
        "surfaced_surprises": _parse(s.surfaced_surprises),
        "last_question_fingerprints": _parse(s.last_question_fingerprints),
        "last_updated": s.last_updated.isoformat() if s.last_updated else None,
    }


@app.get("/api/chat/thread-state")
async def get_chat_thread_state(
    user_identifier: str,
    thread_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Load runtime state for a thread (surfaced insights, suggestions, fingerprints).
    Returns empty defaults when no state exists yet (first turn of a thread)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"thread_id": thread_id, "surfaced_insight_ids": [], "surfaced_suggestion_questions": [], "surfaced_surprises": [], "last_question_fingerprints": [], "last_updated": None}
    res = await db.execute(
        select(ChatThreadState).where(
            ChatThreadState.thread_id == thread_id,
            ChatThreadState.user_id == user.id,
        )
    )
    s = res.scalar_one_or_none()
    if not s:
        return {"thread_id": thread_id, "surfaced_insight_ids": [], "surfaced_suggestion_questions": [], "surfaced_surprises": [], "last_question_fingerprints": [], "last_updated": None}
    return _serialize_thread_state(s)


@app.post("/api/chat/thread-state")
async def upsert_chat_thread_state(
    data: ChatThreadStateUpsert,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Upsert runtime state. Lists are caller-managed (route.ts trims to N items
    before sending). Multi-tenant safe via (user_id, thread_id) scoping."""
    import json as _json
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    res = await db.execute(
        select(ChatThreadState).where(
            ChatThreadState.thread_id == data.thread_id,
            ChatThreadState.user_id == user.id,
        )
    )
    s = res.scalar_one_or_none()
    if not s:
        s = ChatThreadState(thread_id=data.thread_id, user_id=user.id)
        db.add(s)
    if data.surfaced_insight_ids is not None:
        s.surfaced_insight_ids = _json.dumps(data.surfaced_insight_ids[:25])
    if data.surfaced_suggestion_questions is not None:
        s.surfaced_suggestion_questions = _json.dumps(data.surfaced_suggestion_questions[:30])
    if data.surfaced_surprises is not None:
        s.surfaced_surprises = _json.dumps(data.surfaced_surprises[:25])
    if data.last_question_fingerprints is not None:
        s.last_question_fingerprints = _json.dumps(data.last_question_fingerprints[:10])
    s.last_updated = datetime.utcnow()
    await db.commit()
    await db.refresh(s)
    return _serialize_thread_state(s)


# ═══════════════════════════════════════════════════════════════════════════
# Chat telemetry events (observability — was that feature actually useful?)
# ═══════════════════════════════════════════════════════════════════════════

class ChatTelemetryCreate(BaseModel):
    user_identifier: Optional[str] = None
    thread_id: Optional[str] = None
    event_name: str
    payload: Optional[dict] = None


@app.post("/api/chat/telemetry/event")
async def log_chat_telemetry_event(
    data: ChatTelemetryCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Best-effort write of a single telemetry event. Failures are silent at
    the caller; this just acks. Cap event_name + payload sizes defensively."""
    import json as _json
    if not data.event_name or len(data.event_name) > 60:
        raise HTTPException(status_code=400, detail="event_name required, ≤60 chars")
    user_id = None
    if data.user_identifier:
        user = await get_user_by_identifier(db, data.user_identifier)
        if user:
            user_id = user.id
    payload_str = None
    if data.payload is not None:
        try:
            payload_str = _json.dumps(data.payload)[:4000]
        except Exception:
            payload_str = None
    evt = ChatTelemetryEvent(
        user_id=user_id,
        thread_id=(data.thread_id or '')[:36] or None,
        event_name=data.event_name[:60],
        payload_json=payload_str,
    )
    db.add(evt)
    await db.commit()
    return {"ok": True, "id": evt.id}


@app.get("/api/chat/telemetry/summary")
async def get_chat_telemetry_summary(
    days: int = 7,
    user_identifier: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Quick aggregate: event counts in the last N days, optionally per-user.
    Lets you check 'did adding repetition detection actually fire?' """
    cutoff = datetime.utcnow() - timedelta(days=max(1, min(days, 90)))
    q = select(ChatTelemetryEvent.event_name, func.count(ChatTelemetryEvent.id)).where(
        ChatTelemetryEvent.created_at >= cutoff,
    )
    if user_identifier:
        user = await get_user_by_identifier(db, user_identifier)
        if user:
            q = q.where(ChatTelemetryEvent.user_id == user.id)
    q = q.group_by(ChatTelemetryEvent.event_name)
    result = await db.execute(q)
    rows = result.all()
    return {"days": days, "events": [{"event": r[0], "count": r[1]} for r in rows]}


@app.post("/api/chat/embeddings")
async def insert_chat_embedding(
    data: ChatEmbeddingCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Insert one embedding row. Caller is responsible for not duplicating
    (we dedupe on (user_id, source_kind, source_id) — older rows win)."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.source_kind not in ('turn', 'fact'):
        raise HTTPException(status_code=400, detail="source_kind must be 'turn' or 'fact'")
    if not isinstance(data.vector, list) or len(data.vector) == 0:
        raise HTTPException(status_code=400, detail="vector must be a non-empty list")

    # Dedupe: skip if a row with the same (user, kind, source_id) exists.
    existing = await db.execute(
        select(ChatEmbedding).where(
            ChatEmbedding.user_id == user.id,
            ChatEmbedding.source_kind == data.source_kind,
            ChatEmbedding.source_id == data.source_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"id": None, "deduped": True}

    emb = ChatEmbedding(
        user_id=user.id,
        source_kind=data.source_kind,
        source_id=data.source_id,
        thread_id=data.thread_id,
        text_excerpt=(data.text_excerpt or '')[:2000],
        vector_json=json.dumps(data.vector),
        dim=len(data.vector),
        model=data.model[:60],
    )
    db.add(emb)
    await db.commit()
    await db.refresh(emb)
    return {"id": emb.id, "deduped": False}


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    import math
    return dot / (math.sqrt(na) * math.sqrt(nb))


@app.post("/api/chat/embeddings/search")
async def search_chat_embeddings(
    data: ChatEmbeddingQuery,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Brute-force cosine top-k retrieval over a user's embeddings.
    Loads all matching rows into memory (acceptable up to ~5k/user)."""
    user = await get_user_by_identifier(db, data.user_identifier)
    if not user:
        return {"hits": []}
    if not isinstance(data.vector, list) or len(data.vector) == 0:
        return {"hits": []}

    q = select(ChatEmbedding).where(ChatEmbedding.user_id == user.id)
    if data.source_kinds:
        q = q.where(ChatEmbedding.source_kind.in_(data.source_kinds))
    q = q.order_by(ChatEmbedding.created_at.desc()).limit(5000)
    result = await db.execute(q)
    rows = result.scalars().all()

    scored = []
    for r in rows:
        if r.dim != len(data.vector):
            continue  # different model — skip
        try:
            v = json.loads(r.vector_json)
        except Exception:
            continue
        s = _cosine(data.vector, v)
        if s > 0.4:  # noise floor
            scored.append((s, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[: max(1, min(20, data.top_k))]
    return {
        "hits": [
            {
                "id": r.id,
                "score": round(score, 4),
                "source_kind": r.source_kind,
                "source_id": r.source_id,
                "thread_id": r.thread_id,
                "text_excerpt": r.text_excerpt,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for score, r in top
        ]
    }


# ============= Workspace Selection (server-side single source of truth) =============
class WorkspaceUpdate(BaseModel):
    selected_property_id: Optional[str] = None
    selected_site_url: Optional[str] = None
    selected_range: Optional[str] = None
    workspace_label: Optional[str] = None
    # When True, explicitly clears the field even if value is None.
    # Lets the UI distinguish "leave alone" from "set to null".
    clear_property: bool = False
    clear_site: bool = False
    clear_label: bool = False
    # Setup-flow milestones — set by /dashboard/setup Continue and the
    # CreditWelcome dismiss handler. Server-side so they survive localStorage
    # clears across sign-out / new device.
    mark_setup_completed: bool = False
    mark_welcome_seen: bool = False


@app.get("/api/users/{user_identifier}/workspace")
async def get_user_workspace(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Fetch the user's active GA4 property + GSC site + range."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {
            "selected_property_id": None,
            "selected_site_url": None,
            "selected_range": "30d",
            "workspace_label": None,
            "workspace_setup_completed": False,
            "welcome_seen": False,
            "exists": False,
        }
    return {
        "selected_property_id": user.selected_property_id,
        "selected_site_url": user.selected_site_url,
        "selected_range": user.selected_range or "30d",
        "workspace_label": user.workspace_label,
        "workspace_setup_completed": bool(user.workspace_setup_completed),
        "welcome_seen": bool(user.welcome_seen),
        "exists": True,
    }


@app.patch("/api/users/{user_identifier}/workspace")
async def update_user_workspace(
    user_identifier: str,
    data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update the user's active workspace. Fields that are None are left alone
    UNLESS the matching `clear_*` flag is True (then explicitly set to NULL)."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.clear_property:
        user.selected_property_id = None
    elif data.selected_property_id is not None:
        user.selected_property_id = data.selected_property_id[:100]

    if data.clear_site:
        user.selected_site_url = None
    elif data.selected_site_url is not None:
        user.selected_site_url = data.selected_site_url[:500]

    if data.clear_label:
        user.workspace_label = None
    elif data.workspace_label is not None:
        # Trim + cap. Empty strings clear the label.
        cleaned = data.workspace_label.strip()[:120]
        user.workspace_label = cleaned if cleaned else None

    if data.selected_range is not None:
        user.selected_range = data.selected_range[:20]

    if data.mark_setup_completed:
        user.workspace_setup_completed = True
    if data.mark_welcome_seen:
        user.welcome_seen = True

    await db.commit()
    await db.refresh(user)
    return {
        "selected_property_id": user.selected_property_id,
        "selected_site_url": user.selected_site_url,
        "selected_range": user.selected_range or "30d",
        "workspace_label": user.workspace_label,
        "workspace_setup_completed": bool(user.workspace_setup_completed),
        "welcome_seen": bool(user.welcome_seen),
    }


# ============= Support Messages =============

# Hard cap mirrors web/src/lib/chatLimits.ts MAX_INPUT_CHARS — keeps body
# size + Gemini-style downstream costs predictable. Anything past this is a
# 400 with a parseable code so the web layer can render a real error.
SUPPORT_MESSAGE_MAX_CHARS = 24_000


class SupportMessageCreate(BaseModel):
    content: str


class SupportReply(BaseModel):
    content: str
    admin_id: Optional[str] = None  # label of the admin replying (free-form)


def _serialize_support_message(msg: SupportMessage) -> Dict[str, Any]:
    return {
        "id": msg.id,
        "author_type": msg.author_type,
        "author_admin_id": msg.author_admin_id,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
    }


@app.get("/api/users/{user_identifier}/support/messages")
async def list_support_messages(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Full thread for one user, oldest first."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"messages": [], "exists": False}
    result = await db.execute(
        select(SupportMessage)
        .where(SupportMessage.user_id == user.id)
        .order_by(SupportMessage.created_at.asc())
    )
    messages = list(result.scalars().all())
    return {
        "messages": [_serialize_support_message(m) for m in messages],
        "exists": True,
    }


@app.post("/api/users/{user_identifier}/support/messages")
async def create_support_message(
    user_identifier: str,
    data: SupportMessageCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """User posts a new support message."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    content = (data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message is empty")
    if len(content) > SUPPORT_MESSAGE_MAX_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Message is {len(content)} characters; the limit is {SUPPORT_MESSAGE_MAX_CHARS}.",
        )

    msg = SupportMessage(
        user_id=user.id,
        author_type="user",
        content=content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return _serialize_support_message(msg)


@app.patch("/api/users/{user_identifier}/support/messages/read")
async def mark_user_admin_replies_read(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """User opened the support page → mark every admin reply read."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"updated": 0, "exists": False}
    result = await db.execute(
        update(SupportMessage)
        .where(
            SupportMessage.user_id == user.id,
            SupportMessage.author_type == "admin",
            SupportMessage.read_at.is_(None),
        )
        .values(read_at=datetime.utcnow())
    )
    await db.commit()
    return {"updated": result.rowcount or 0, "exists": True}


@app.get("/api/users/{user_identifier}/support/unread-count")
async def get_user_unread_count(
    user_identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Count of admin replies the user hasn't seen yet — drives the sidebar badge."""
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        return {"unread": 0}
    result = await db.execute(
        select(func.count(SupportMessage.id)).where(
            SupportMessage.user_id == user.id,
            SupportMessage.author_type == "admin",
            SupportMessage.read_at.is_(None),
        )
    )
    return {"unread": int(result.scalar() or 0)}


@app.get("/api/admin/support/threads")
async def list_support_threads(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin inbox: every user with at least one message, sorted by
    oldest unread user message first so nobody sits waiting longest."""
    # Pull every message — at expected support volume this is fine. If volume
    # grows, swap for a per-user aggregate query.
    result = await db.execute(
        select(SupportMessage).order_by(SupportMessage.created_at.asc())
    )
    messages = list(result.scalars().all())
    if not messages:
        return {"threads": [], "total": 0}

    user_ids = sorted({m.user_id for m in messages})
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    by_user: Dict[int, list] = {}
    for m in messages:
        by_user.setdefault(m.user_id, []).append(m)

    threads = []
    for uid, msgs in by_user.items():
        u = users_by_id.get(uid)
        if not u:
            continue
        unread_user_msgs = [m for m in msgs if m.author_type == "user" and m.read_at is None]
        oldest_unread = unread_user_msgs[0].created_at if unread_user_msgs else None
        last_msg = msgs[-1]
        threads.append({
            "user_id": u.id,
            "github_id": u.github_id,
            "github_username": u.github_username,
            "email": u.email,
            "plan": u.plan,
            "message_count": len(msgs),
            "unread_user_count": len(unread_user_msgs),
            "oldest_unread_at": oldest_unread.isoformat() if oldest_unread else None,
            "last_message_at": last_msg.created_at.isoformat() if last_msg.created_at else None,
            "last_message_preview": (last_msg.content or "")[:120],
            "last_message_author": last_msg.author_type,
        })

    # Oldest-unread first (None goes to the end), then by latest-message-desc.
    threads.sort(key=lambda t: (
        t["oldest_unread_at"] is None,
        t["oldest_unread_at"] or "",
        # negative-ish: reverse the ISO string so "latest first" within the no-unread bucket
        -1 * (1 if t["last_message_at"] else 0),
        t["last_message_at"] or "",
    ))
    return {"threads": threads, "total": len(threads)}


@app.get("/api/admin/support/threads/{user_id}")
async def get_support_thread(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin: full thread for one user (by internal DB id) + user info."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    msg_result = await db.execute(
        select(SupportMessage)
        .where(SupportMessage.user_id == user_id)
        .order_by(SupportMessage.created_at.asc())
    )
    messages = list(msg_result.scalars().all())
    return {
        "user": {
            "id": user.id,
            "github_id": user.github_id,
            "github_username": user.github_username,
            "email": user.email,
            "plan": user.plan,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "messages": [_serialize_support_message(m) for m in messages],
    }


@app.post("/api/admin/support/threads/{user_id}/reply")
async def reply_to_support_thread(
    user_id: int,
    data: SupportReply,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin replies to a user's support thread."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    content = (data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Reply is empty")
    if len(content) > SUPPORT_MESSAGE_MAX_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Reply is {len(content)} characters; the limit is {SUPPORT_MESSAGE_MAX_CHARS}.",
        )

    msg = SupportMessage(
        user_id=user.id,
        author_type="admin",
        author_admin_id=(data.admin_id or "support")[:64],
        content=content,
    )
    db.add(msg)

    # Reading the thread to reply implicitly acknowledges the user's open
    # questions, so flush their unread bucket in the same transaction.
    await db.execute(
        update(SupportMessage)
        .where(
            SupportMessage.user_id == user.id,
            SupportMessage.author_type == "user",
            SupportMessage.read_at.is_(None),
        )
        .values(read_at=datetime.utcnow())
    )

    await db.commit()
    await db.refresh(msg)
    return _serialize_support_message(msg)


@app.patch("/api/admin/support/threads/{user_id}/read")
async def mark_thread_read(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Superadmin opened a thread → mark all of that user's messages as read."""
    result = await db.execute(
        update(SupportMessage)
        .where(
            SupportMessage.user_id == user_id,
            SupportMessage.author_type == "user",
            SupportMessage.read_at.is_(None),
        )
        .values(read_at=datetime.utcnow())
    )
    await db.commit()
    return {"updated": result.rowcount or 0}


# ============= Weekly Digests =============
# Per-user weekly snapshot persistence — powers the Weekly Briefing UI
# (docs/WEEKLY_BRIEFING_UI_PLAN.md, Track 1). Keyed by (user, ISO year+week,
# site_url). Cleanup helper prunes rows older than 26 ISO weeks on every write
# so each user keeps ~6 months of history.

WEEKLY_DIGEST_RETENTION_WEEKS = 26


class WeeklyDigestCreate(BaseModel):
    year: int
    iso_week: int
    site_url: Optional[str] = None
    headline: Optional[str] = None
    action_items: Optional[Any] = None  # list[str] | list[dict] — serialized as JSON
    snapshot: Any  # enriched snapshot blob — serialized as JSON


def _serialize_weekly_digest_summary(d: WeeklyDigest) -> Dict[str, Any]:
    """Lightweight row shape for the list endpoint — omits the heavy snapshot."""
    return {
        "id": d.id,
        "year": d.year,
        "iso_week": d.iso_week,
        "site_url": d.site_url,
        "headline": d.headline,
        "action_items": json.loads(d.action_items_json) if d.action_items_json else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _serialize_weekly_digest_full(d: WeeklyDigest) -> Dict[str, Any]:
    """Full row shape for the single-fetch endpoint — includes the snapshot blob."""
    return {
        "id": d.id,
        "year": d.year,
        "iso_week": d.iso_week,
        "site_url": d.site_url,
        "headline": d.headline,
        "action_items": json.loads(d.action_items_json) if d.action_items_json else None,
        "snapshot": json.loads(d.snapshot_json) if d.snapshot_json else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


async def _prune_old_weekly_digests(db: AsyncSession, user_id: int) -> int:
    """Delete this user's digest rows older than WEEKLY_DIGEST_RETENTION_WEEKS
    ISO weeks. Called from the POST endpoint so each write self-trims."""
    cutoff = datetime.utcnow() - timedelta(weeks=WEEKLY_DIGEST_RETENTION_WEEKS)
    res = await db.execute(
        delete(WeeklyDigest).where(
            WeeklyDigest.user_id == user_id,
            WeeklyDigest.created_at < cutoff,
        )
    )
    return res.rowcount or 0


@app.post("/api/users/{user_identifier}/weekly-digests")
async def upsert_weekly_digest(
    user_identifier: str,
    data: WeeklyDigestCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Upsert a weekly digest keyed by (user_id, year, iso_week, site_url).

    If a row already exists for that composite key, updates headline /
    action_items / snapshot / created_at. Otherwise inserts a new row.
    Returns the row id.
    """
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not (1 <= data.iso_week <= 53):
        raise HTTPException(status_code=400, detail="iso_week must be between 1 and 53")
    if data.year < 1970 or data.year > 9999:
        raise HTTPException(status_code=400, detail="year out of range")

    action_items_json = json.dumps(data.action_items) if data.action_items is not None else None
    snapshot_json = json.dumps(data.snapshot)

    # Composite-key lookup. SQLite treats NULL ≠ NULL inside UNIQUE so we have
    # to branch on site_url to find an existing row for the no-workspace case.
    where_clause = [
        WeeklyDigest.user_id == user.id,
        WeeklyDigest.year == data.year,
        WeeklyDigest.iso_week == data.iso_week,
    ]
    if data.site_url is None:
        where_clause.append(WeeklyDigest.site_url.is_(None))
    else:
        where_clause.append(WeeklyDigest.site_url == data.site_url)

    existing_res = await db.execute(select(WeeklyDigest).where(*where_clause))
    existing = existing_res.scalar_one_or_none()

    now = datetime.utcnow()
    if existing:
        existing.headline = data.headline
        existing.action_items_json = action_items_json
        existing.snapshot_json = snapshot_json
        existing.created_at = now
        await db.commit()
        await db.refresh(existing)
        await _prune_old_weekly_digests(db, user.id)
        await db.commit()
        return {"id": existing.id, "created": False}

    digest = WeeklyDigest(
        user_id=user.id,
        year=data.year,
        iso_week=data.iso_week,
        site_url=data.site_url,
        headline=data.headline,
        action_items_json=action_items_json,
        snapshot_json=snapshot_json,
        created_at=now,
    )
    db.add(digest)
    await db.commit()
    await db.refresh(digest)
    await _prune_old_weekly_digests(db, user.id)
    await db.commit()
    return {"id": digest.id, "created": True}


@app.get("/api/users/{user_identifier}/weekly-digests")
async def get_weekly_digests(
    user_identifier: str,
    year: Optional[int] = None,
    iso_week: Optional[int] = None,
    site_url: Optional[str] = None,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Two modes (branched on whether year+iso_week were supplied):

    - **Single-fetch**: pass `year` + `iso_week` (and optional `site_url`).
      Returns the one matching digest including the full snapshot blob, or
      404 if absent.
    - **List**: omit `year`/`iso_week` and optionally pass `limit` (default 8,
      max 26). Returns the last N digests ordered by (year DESC, iso_week DESC)
      WITHOUT the heavy snapshot blob — clients call the single-fetch variant
      to load a specific week.
    """
    user = await get_user_by_identifier(db, user_identifier)
    if not user:
        if year is not None and iso_week is not None:
            raise HTTPException(status_code=404, detail="User not found")
        return {"digests": [], "exists": False}

    # Single-fetch by composite key
    if year is not None and iso_week is not None:
        where_clause = [
            WeeklyDigest.user_id == user.id,
            WeeklyDigest.year == year,
            WeeklyDigest.iso_week == iso_week,
        ]
        if site_url is None:
            where_clause.append(WeeklyDigest.site_url.is_(None))
        else:
            where_clause.append(WeeklyDigest.site_url == site_url)

        result = await db.execute(select(WeeklyDigest).where(*where_clause))
        digest = result.scalar_one_or_none()
        if not digest:
            raise HTTPException(status_code=404, detail="Weekly digest not found")
        return _serialize_weekly_digest_full(digest)

    # List mode
    capped_limit = max(1, min(limit, WEEKLY_DIGEST_RETENTION_WEEKS))
    query = (
        select(WeeklyDigest)
        .where(WeeklyDigest.user_id == user.id)
        .order_by(WeeklyDigest.year.desc(), WeeklyDigest.iso_week.desc())
        .limit(capped_limit)
    )
    if site_url is not None:
        query = query.where(WeeklyDigest.site_url == site_url)

    result = await db.execute(query)
    digests = list(result.scalars().all())
    return {
        "digests": [_serialize_weekly_digest_summary(d) for d in digests],
        "exists": True,
    }


# ============= Health Check =============
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ============= Run =============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
