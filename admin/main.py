"""
ClawBot Admin API
Manages user containers, subscriptions, and monitoring
"""
from fastapi import FastAPI, HTTPException, Depends, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import json
import docker
import logging
import secrets
import subprocess
import os
import requests

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, delete, text
from contextlib import asynccontextmanager

from config import settings, PLANS
from models import Base, User, OAuthConnection, UsageLog, ContainerEvent, Alert, ContactQuery, EmbedToken, SharedDashboard, LeaderboardEntry
from docker_manager import docker_manager


# ============= Database Setup =============
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Auto-migrate new columns for existing SQLite databases
        for col, col_def in [("credits", "INTEGER DEFAULT 10"), ("bot_engine", "VARCHAR(50) DEFAULT 'openclaw'"), ("subscription_id", "VARCHAR(100)"), ("telegram_bot_enabled", "BOOLEAN DEFAULT 0"), ("subscription_cancelled", "BOOLEAN DEFAULT 0")]:
            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_def}"))
            except Exception:
                pass


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
    action: str  # start, stop, restart, delete


class UserResponse(BaseModel):
    id: int
    github_id: Optional[str]
    github_username: Optional[str]
    email: Optional[str]
    plan: str
    container_status: str
    container_port: Optional[int]
    is_active: bool
    created_at: datetime
    bot_engine: str


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


# ============= User Endpoints =============
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
        
    # 3. Upsert Logic
    if existing_user:
        user = existing_user
        print(f"[USER] Found existing user={user.id}, updating fields")
        # Update fields if provided
        if user_data.telegram_bot_token:
            print(f"[USER] Updating telegram bot token for user={user.id}")
            user.telegram_bot_token = user_data.telegram_bot_token
        if user_data.gemini_api_key:
            user.gemini_api_key = user_data.gemini_api_key
        if user_data.bot_engine:
            user.bot_engine = user_data.bot_engine
            
        # Update OAuth credentials if provided (Critical for re-auth/refresh tokens)
        if user_data.provider and user_data.provider_id:
            stmt = select(OAuthConnection).where(
                OAuthConnection.user_id == user.id,
                OAuthConnection.provider == user_data.provider
            )
            result = await db.execute(stmt)
            oauth = result.scalars().first()  # Use first() to handle multiple connections gracefully
            
            if oauth:
                if user_data.access_token:
                    oauth.access_token = user_data.access_token
                if user_data.refresh_token:
                    oauth.refresh_token = user_data.refresh_token
                oauth.updated_at = datetime.utcnow()
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

        await db.commit()
        await db.refresh(user)
    else:
        # Create new user
        
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
                await db.commit()

        except Exception as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # 4. Only create container if telegram_bot_token is set
    #    Container should NOT be created on initial signup — only when bot token is provided
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

    # 5. Ensure Container Exists & Is Running (only when we have a telegram token)
    try:
        if not user.container_port:
             print(f"[DEBUG] create_user: existing user has no port, assigning one.")
             user.container_port = await get_next_available_port(db)
             await db.commit()

        plan_config = PLANS[user.plan]
        connections = {}
        
        # Reload ALL connections from DB — only include those with valid tokens
        res = await db.execute(select(OAuthConnection).where(OAuthConnection.user_id == user.id))
        for c in res.scalars().all():
            if c.access_token and c.access_token.strip():
                connections[c.provider] = {
                    "provider_account_id": c.provider_account_id,
                    "accessToken": c.access_token,
                    "refreshToken": c.refresh_token,
                    "token_type": c.token_type
                }

        docker_identifier = user.github_id 

        # Use sync_container to ensure memory files + env vars are always up to date
        result = docker_manager.sync_container(
            user_identifier=docker_identifier,
            plan=user.plan,
            port=user.container_port,
            telegram_token=user.telegram_bot_token,
            gemini_key=user.gemini_api_key,
            connections=connections,
            custom_rules=user.custom_rules,
            enabled_plugins=plan_config.get("features", []),
            bot_engine=user.bot_engine
        )
        
        if not result["success"]:
            print(f"[ERROR] Container creation failed: {result.get('error')}")
            raise HTTPException(status_code=500, detail=f"Container operation failed: {result['error']}")

        # Update container info
        user.container_id = result.get("container_id", user.container_id)
        user.container_status = "running"
        await db.commit()

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] create_user: Failed to ensure container: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start bot: {str(e)}")

    print(f"[USER] create_user: Success. user_id={user.id}, github_id={user.github_id}, container={user.container_status}")
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
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    return [
        UserResponse(
            id=u.id,
            github_id=u.github_id,
            github_username=u.github_username,
            email=u.email,
            plan=u.plan,
            container_status=u.container_status,
            container_port=u.container_port,
            is_active=u.is_active,
            created_at=u.created_at,
            bot_engine=u.bot_engine or "openclaw"
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
    
    display_token = user.telegram_bot_token or ""

    # Get container status from Docker
    try:
        container_status = docker_manager.get_container_status(user.github_id)
    except Exception as e:
        print(f"[ERROR] Failed to get container status for {user.github_id}: {e}")
        container_status = {"status": "error", "error": str(e)}

    # CRITICAL FIX: If container is not provisioned in Docker, force status to "not_provisioned"
    # UNLESS the DB says it should be running (race condition during startup)
    docker_status = container_status.get("status")
    
    if docker_status in ["not_found", "not_provisioned"]:
        # Check if DB expects it to be running (startup latency)
        if user.container_status in ["running", "pending", "starting"]:
            container_status["status"] = "initializing"
            # Keep token visible if initializing, user might want to verify
        else:
            container_status["status"] = "not_provisioned"
            display_token = "" # Hide if truly not provisioned
            
    elif user.container_id == "pending":
         container_status["status"] = "initializing" # Treat pending as initializing

    # CRITICAL FIX 2: Even if container is running, if there is NO token, it's not really provisioned
    # This handles "zombie" containers or containers created without tokens during robustness fixes
    if not user.telegram_bot_token:
        container_status["status"] = "not_provisioned"
        display_token = ""




    
    # Fetch connected OAuth providers (only those with valid tokens)
    oauth_result = await db.execute(
        select(OAuthConnection).where(OAuthConnection.user_id == user.id)
    )
    connected_providers = [
        {"provider": c.provider, "connected": True}
        for c in oauth_result.scalars().all()
        if c.access_token and c.access_token.strip()  # Only include if token is non-empty
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
        "telegram_bot_username": container_status.get("bot_username"), # Use container status
        "telegram_bot_token": user.telegram_bot_token or "", # Expose masked token
        "connected_providers": connected_providers,
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

@app.post("/api/users/{github_id}/exec")
async def exec_plugin(
    github_id: str,
    req: PluginExecRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Execute a plugin command. Google plugins run as local subprocesses (no container needed).
    Bot-specific plugins require a running container."""
    if req.plugin not in ALLOWED_PLUGINS:
        raise HTTPException(status_code=400, detail=f"Plugin '{req.plugin}' not allowed")

    # Validate command is alphanumeric with hyphens only (prevent path traversal)
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', req.command):
        raise HTTPException(status_code=400, detail="Invalid command name")

    # Validate args don't contain path traversal
    for arg in req.args:
        if '..' in arg or arg.startswith('/'):
            raise HTTPException(status_code=400, detail="Invalid argument")

    user = await get_user_by_identifier(db, github_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Google plugins run locally using OAuth tokens from DB — no container needed
    # Only bot-specific plugins (e.g. github-ghost) require a running container
    CONTAINER_REQUIRED_PLUGINS = {"github-ghost"}
    
    if req.plugin in CONTAINER_REQUIRED_PLUGINS:
        container_name = docker_manager._get_container_name(user.github_id)
        try:
            container = docker_manager.client.containers.get(container_name)
            if container.status != "running":
                raise HTTPException(status_code=503, detail="Container not running")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=503, detail="Container not provisioned. Set up your bot first.")

    try:
        # Build the command: node /app/plugins/<plugin>/index.js <command> <args> <options>
        cmd = ["node", f"/app/plugins/{req.plugin}/index.js", req.command] + req.args
        for key, value in req.options.items():
            cmd.append(f"--{key}")
            if value is not None and value != "":
                cmd.append(str(value))

        # Inject OAuth tokens if available
        # Find Google tokens for analytics/search-console plugins
        if req.plugin in ["google-analytics", "google-search-console"]:
            from models import OAuthConnection  # Absolute import for uvicorn execution
            from sqlalchemy import select
            
            stmt = select(OAuthConnection).where(
                OAuthConnection.user_id == user.id,
                OAuthConnection.provider == "google"
            )
            result = await db.execute(stmt)
            oauth = result.scalars().first()
            
            if oauth:
                if oauth.access_token:
                    cmd.append("--accessToken")
                    cmd.append(oauth.access_token)
                if oauth.refresh_token:
                    cmd.append("--refreshToken")
                    cmd.append(oauth.refresh_token)

        # Pass environment variables
        env = os.environ.copy()
        
        print(f"Executing plugin: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=60)
        stdout = result.stdout
        stderr = result.stderr
        
        print(f"Plugin stdout: {stdout[:500]}...") # Log first 500 chars
        if stderr:
            print(f"Plugin stderr: {stderr}")

        # Try to parse stdout as JSON
        import json as json_lib
        try:
            parsed = json_lib.loads(stdout)
            return {"status": "ok", "data": parsed, "stderr": stderr}
        except json_lib.JSONDecodeError:
            # Fallback: Try to find JSON in the output (ignore leading log lines)
            try:
                # Find the start of the JSON structure (first { or [)
                cleaned = stdout.strip()
                start_index = -1
                for i, char in enumerate(cleaned):
                    if char in ['{', '[']:
                        start_index = i
                        break
                
                if start_index != -1:
                    json_candidate = cleaned[start_index:]
                    parsed = json_lib.loads(json_candidate)
                    return {"status": "ok", "data": parsed, "stderr": stderr}
            except Exception:
                pass
            
            return {"status": "ok", "data": stdout, "stderr": stderr}

    except subprocess.TimeoutExpired:
        print(f"Plugin exec timeout for {github_id}: {req.plugin} {req.command}")
        raise HTTPException(status_code=504, detail="Plugin execution timed out")
    except Exception as e:
        print(f"Plugin exec error for {github_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Plugin execution failed: {str(e)}")


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


# ============= Shared Dashboards =============

class SharedDashboardCreate(BaseModel):
    user_identifier: str
    property_id: str
    site_url: Optional[str] = None
    config: Optional[dict] = None


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
    config_json = json.dumps(data.config) if data.config else '{"traffic":true,"sources":true,"pages":true,"geo":true,"seo":false}'

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

    return {
        "token": shared.token,
        "property_id": shared.property_id,
        "site_url": shared.site_url,
        "config": json.loads(shared.config) if shared.config else {},
        "views": shared.views,
        "created_at": shared.created_at.isoformat() if shared.created_at else None,
    }


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

    return [
        {
            "token": s.token,
            "property_id": s.property_id,
            "site_url": s.site_url,
            "config": json.loads(s.config) if s.config else {},
            "views": s.views,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "last_viewed_at": s.last_viewed_at.isoformat() if s.last_viewed_at else None,
        }
        for s in shares
    ]


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

    return {
        "token": shared.token,
        "property_id": shared.property_id,
        "site_url": shared.site_url,
        "config": json.loads(shared.config) if shared.config else {},
        "views": shared.views,
        "created_at": shared.created_at.isoformat() if shared.created_at else None,
    }


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

class LeaderboardJoinRequest(BaseModel):
    startup_name: str
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    category: Optional[str] = None
    mrr_range: Optional[str] = None
    looking_for: Optional[List[str]] = None
    twitter_handle: Optional[str] = None
    ga_property_id: Optional[str] = None


class LeaderboardUpdateRequest(BaseModel):
    startup_name: Optional[str] = None
    description: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    category: Optional[str] = None
    mrr_range: Optional[str] = None
    looking_for: Optional[List[str]] = None
    twitter_handle: Optional[str] = None
    ga_property_id: Optional[str] = None
    is_active: Optional[bool] = None


@app.get("/api/leaderboard/{entry_id}/detail")
async def get_leaderboard_entry_detail(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — get a single leaderboard entry's full details."""
    result = await db.execute(
        select(LeaderboardEntry).where(
            LeaderboardEntry.id == entry_id,
            LeaderboardEntry.is_active == True
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {
        "id": entry.id,
        "startup_name": entry.startup_name,
        "description": entry.description,
        "website_url": entry.website_url,
        "logo_url": entry.logo_url,
        "category": entry.category,
        "mrr_range": entry.mrr_range,
        "looking_for": json.loads(entry.looking_for) if entry.looking_for else [],
        "twitter_handle": entry.twitter_handle,
        "monthly_visitors": entry.monthly_visitors,
        "monthly_pageviews": entry.monthly_pageviews,
        "engagement_rate": entry.engagement_rate,
        "bounce_rate": entry.bounce_rate,
        "avg_session_duration": entry.avg_session_duration,
        "visitor_trend": entry.visitor_trend,
        "is_verified": entry.is_verified,
        "last_refreshed": entry.last_refreshed.isoformat() if entry.last_refreshed else None,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


@app.get("/api/leaderboard")
async def list_leaderboard(
    sort: str = "traffic",
    category: Optional[str] = None,
    mrr: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — list all active leaderboard entries."""
    query = select(LeaderboardEntry).where(LeaderboardEntry.is_active == True)

    if category and category != "all":
        query = query.where(LeaderboardEntry.category == category)
    if mrr and mrr != "all":
        query = query.where(LeaderboardEntry.mrr_range == mrr)

    if sort == "engagement":
        query = query.order_by(LeaderboardEntry.engagement_rate.desc())
    elif sort == "newest":
        query = query.order_by(LeaderboardEntry.created_at.desc())
    else:  # "traffic" default
        query = query.order_by(LeaderboardEntry.monthly_visitors.desc())

    result = await db.execute(query)
    entries = result.scalars().all()

    return [
        {
            "id": e.id,
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
            "last_refreshed": e.last_refreshed.isoformat() if e.last_refreshed else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@app.post("/api/leaderboard/{identifier}/join")
async def join_leaderboard_for_user(
    identifier: str,
    data: LeaderboardJoinRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Create or update a leaderboard entry for the given user."""
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id)
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
        if data.ga_property_id is not None: entry.ga_property_id = data.ga_property_id
        entry.is_active = True
        entry.updated_at = datetime.utcnow()
    else:
        entry = LeaderboardEntry(
            user_id=user.id,
            startup_name=data.startup_name,
            description=data.description,
            website_url=data.website_url,
            logo_url=data.logo_url,
            category=data.category or "Other",
            mrr_range=data.mrr_range or "$0-500",
            looking_for=json.dumps(data.looking_for or []),
            twitter_handle=data.twitter_handle,
            ga_property_id=data.ga_property_id,
        )
        db.add(entry)

    await db.commit()
    await db.refresh(entry)
    return {
        "success": True,
        "id": entry.id,
        "message": "Joined leaderboard" if is_new else "Updated leaderboard entry",
    }


@app.put("/api/leaderboard/{identifier}")
async def update_leaderboard_entry(
    identifier: str,
    data: LeaderboardUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Update a leaderboard entry."""
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Leaderboard entry not found")

    update_data = data.model_dump(exclude_unset=True)
    if "looking_for" in update_data and update_data["looking_for"] is not None:
        update_data["looking_for"] = json.dumps(update_data["looking_for"])

    for key, value in update_data.items():
        setattr(entry, key, value)
    entry.updated_at = datetime.utcnow()

    await db.commit()
    return {"success": True, "message": "Entry updated"}


@app.delete("/api/leaderboard/{identifier}")
async def leave_leaderboard(
    identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Opt-out of the leaderboard (soft delete — sets is_active=False)."""
    user = await get_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Leaderboard entry not found")

    entry.is_active = False
    entry.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Left leaderboard"}


@app.get("/api/leaderboard/{identifier}/status")
async def get_leaderboard_status(
    identifier: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key),
):
    """Check if a user has a leaderboard entry."""
    user = await get_user_by_identifier(db, identifier)
    if not user:
        return {"joined": False}

    result = await db.execute(
        select(LeaderboardEntry).where(LeaderboardEntry.user_id == user.id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return {"joined": False}
    return {
        "joined": True,
        "id": entry.id,
        "is_active": entry.is_active,
        "startup_name": entry.startup_name,
        "description": entry.description,
        "website_url": entry.website_url,
        "logo_url": entry.logo_url,
        "category": entry.category,
        "mrr_range": entry.mrr_range,
        "looking_for": json.loads(entry.looking_for) if entry.looking_for else [],
        "twitter_handle": entry.twitter_handle,
        "ga_property_id": entry.ga_property_id,
        "monthly_visitors": entry.monthly_visitors,
        "is_verified": entry.is_verified,
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
    """Update GA4 stats for a leaderboard entry (called by cron after fetching GA4 data)."""
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

    entry.is_verified = True
    entry.last_refreshed = datetime.utcnow()
    await db.commit()
    return {"success": True}


# ============= Health Check =============
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ============= Run =============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
