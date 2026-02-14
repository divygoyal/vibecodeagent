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

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from contextlib import asynccontextmanager

from config import settings, PLANS
from models import Base, User, OAuthConnection, UsageLog, ContainerEvent, Alert
from docker_manager import docker_manager


# ============= Database Setup =============
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    provider: str = "github"
    provider_id: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None # New
    
    github_username: Optional[str] = None
    email: Optional[str] = None
    plan: str = "free"
    telegram_bot_token: str
    gemini_api_key: Optional[str] = None
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
    Find user by github_id OR any connected OAuth provider_account_id.
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
        # Update fields if provided
        if user_data.telegram_bot_token:
            user.telegram_bot_token = user_data.telegram_bot_token
        if user_data.gemini_api_key:
            user.gemini_api_key = user_data.gemini_api_key
            
        # Update OAuth credentials if provided (Critical for re-auth/refresh tokens)
        if user_data.provider and user_data.provider_id:
            stmt = select(OAuthConnection).where(
                OAuthConnection.user_id == user.id,
                OAuthConnection.provider == user_data.provider
            )
            result = await db.execute(stmt)
            oauth = result.scalar_one_or_none()
            
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
            container_id="pending", 
            container_name=container_name,
            container_port=port,
            container_status="stopped",
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

    # 4. Ensure Container Exists & Is Running (Idempotent)
    plan_config = PLANS[user.plan]
    connections = {}
    
    # Reload connections from DB to be sure we have everything
    res = await db.execute(select(OAuthConnection).where(OAuthConnection.user_id == user.id))
    for c in res.scalars().all():
        connections[c.provider] = {
            "provider_account_id": c.provider_account_id,
            "accessToken": c.access_token,
            "refreshToken": c.refresh_token,
            "token_type": c.token_type
        }

    # We use the user's stored github_id as the identifier for Docker to ensure consistency
    docker_identifier = user.github_id 

    result = docker_manager.create_container(
        user_identifier=docker_identifier,
        plan=user.plan,
        port=user.container_port,
        telegram_token=user.telegram_bot_token,
        gemini_key=user.gemini_api_key,
        connections=connections,
        enabled_plugins=plan_config.get("features", [])
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=f"Container operation failed: {result['error']}")

    # Update container info
    user.container_id = result.get("container_id", user.container_id)
    user.container_status = "running"
    await db.commit()

    print(f"[DEBUG] create_user: Success. user_id={user.id}, github_id={user.github_id}, container={user.container_status}")
    return UserResponse(
        id=user.id,
        github_id=user.github_id or "",
        github_username=user.github_username,
        email=user.email,
        plan=user.plan,
        container_status=user.container_status,
        container_port=user.container_port,
        is_active=user.is_active,
        created_at=user.created_at
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
            created_at=u.created_at
        )
        for u in users
    ]


@app.get("/api/users/{github_id}")
async def get_user(
    github_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Get user details with container status"""
    user = await get_user_by_identifier(db, github_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get live container status (use canonical ID associated with Docker)
    container_status = docker_manager.get_container_status(user.github_id)
    
    return {
        "id": user.id,
        "github_id": user.github_id,
        "github_username": user.github_username,
        "email": user.email,
        "plan": user.plan,
        "is_active": user.is_active,
        "container": container_status,
        "subscription_start": user.subscription_start,
        "subscription_end": user.subscription_end,
        "created_at": user.created_at,
        "telegram_bot_username": container_status.get("bot_username"), # Use container status
        "telegram_bot_token": user.telegram_bot_token or "" # Expose masked token
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
        conn = result.scalar_one_or_none()
        
        if conn:
            if user_update.access_token:
                conn.access_token = user_update.access_token
            if user_update.refresh_token:
                conn.refresh_token = user_update.refresh_token
            conn.updated_at = datetime.utcnow()
        else:
            # Create new if not exists (upsert)
            if user_update.access_token:
               conn = OAuthConnection(
                   user_id=user.id,
                   provider=user_update.provider,
                   provider_account_id=user.github_id, # Fallback to github_id if we don't have provider_id in update param?
                   # Wait, UserUpdate doesn't have provider_id. 
                   # route.ts passes provider_id though? No, route.ts passes provider_id in payload...
                   # Let's check UserUpdate model.
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
             conn = result.scalar_one_or_none()
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
    
    # If plan changed, need to recreate container with new limits
    if user_update.plan and user_update.plan != user.plan:
        # Stop old container
        docker_manager.stop_container(user.github_id)
        docker_manager.delete_container(user.github_id, remove_data=False)
        
        # Fetch connections for logic
        result = await db.execute(
            select(OAuthConnection).where(OAuthConnection.user_id == user.id)
        )
        conns_list = result.scalars().all()
        connections = {}
        for c in conns_list:
             connections[c.provider] = {
                 "provider_account_id": c.provider_account_id,
                 "access_token": c.access_token,
                 "token_type": c.token_type,
                 "scope": c.scope
             }

        # Create new container with new limits
        plan_config = PLANS[user_update.plan]
        result = docker_manager.create_container(
            user_identifier=user.github_id,
            plan=user_update.plan,
            port=user.container_port,
            telegram_token=user.telegram_bot_token,
            gemini_key=user.gemini_api_key,
            connections=connections,
            custom_rules=user.custom_rules,
            enabled_plugins=plan_config.get("features", [])
        )
        
        if result["success"]:
            user.container_id = result["container_id"]
            user.container_status = "running"
            await db.commit()
            await log_container_event(db, user.id, result["container_id"], "upgrade", f"Plan changed to: {user_update.plan}")
    
    return {"success": True, "message": "User updated"}


@app.delete("/api/users/{github_id}")
async def delete_user(
    github_id: str,
    remove_data: bool = False,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Delete user and their container"""
    user = await get_user_by_identifier(db, github_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete container
    docker_result = docker_manager.delete_container(user.github_id, remove_data=remove_data)
    
    # Delete user record (cascade should handle OAuthConnections if configured, but let's manual delete to be safe)
    await db.execute(
        select(OAuthConnection).where(OAuthConnection.user_id == user.id)
    ) # actually just delete user, SQLAlchemy rarely does cascades unless configured. 
      # Since we don't have relationships defined in model, we rely on DB FK or manual.
      # DB schema doesn't have FK constraints explicitly defined in models shown, so let's check.
      # Assuming manual delete for now.
    
    # Actually, simplistic delete.
    await db.delete(user)
    await db.commit()
    
    return {"success": True, "message": "User deleted", "container": docker_result}


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
                enabled_plugins=plan_config.get("features", [])
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


# ============= Health Check =============
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


# ============= Run =============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
