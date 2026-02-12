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
from models import Base, User, UsageLog, ContainerEvent, Alert
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
    yield
    # Shutdown
    pass


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
    github_id: str
    github_username: Optional[str] = None
    email: Optional[str] = None
    plan: str = "free"
    telegram_bot_token: str
    gemini_api_key: Optional[str] = None
    github_token: Optional[str] = None


class UserUpdate(BaseModel):
    plan: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    gemini_api_key: Optional[str] = None
    github_token: Optional[str] = None
    custom_rules: Optional[str] = None
    is_active: Optional[bool] = None


class ContainerAction(BaseModel):
    action: str  # start, stop, restart, delete


class UserResponse(BaseModel):
    id: int
    github_id: str
    github_username: Optional[str]
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


# ============= User Endpoints =============
@app.post("/api/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Create a new user and provision their ClawBot container"""
    
    # Check if user already exists
    result = await db.execute(
        select(User).where(User.github_id == user_data.github_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")
    
    # Validate plan
    if user_data.plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Options: {list(PLANS.keys())}")
    
    # Get available port
    port = await get_next_available_port(db)
    
    # Create container
    plan_config = PLANS[user_data.plan]
    result = docker_manager.create_container(
        github_id=user_data.github_id,
        plan=user_data.plan,
        port=port,
        telegram_token=user_data.telegram_bot_token,
        gemini_key=user_data.gemini_api_key,
        github_token=user_data.github_token,
        enabled_plugins=plan_config.get("features", [])
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=f"Failed to create container: {result['error']}")
    
    # Create user record
    user = User(
        github_id=user_data.github_id,
        github_username=user_data.github_username,
        email=user_data.email,
        plan=user_data.plan,
        telegram_bot_token=user_data.telegram_bot_token,
        gemini_api_key=user_data.gemini_api_key,
        github_token=user_data.github_token,
        container_id=result["container_id"],
        container_name=result["container_name"],
        container_port=port,
        container_status="running",
        subscription_start=datetime.utcnow(),
        enabled_plugins=json.dumps(plan_config.get("features", []))
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Log event
    await log_container_event(db, user.id, result["container_id"], "create", f"Created with plan: {user_data.plan}")
    
    return UserResponse(
        id=user.id,
        github_id=user.github_id,
        github_username=user.github_username,
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
    result = await db.execute(
        select(User).where(User.github_id == github_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get live container status
    container_status = docker_manager.get_container_status(github_id)
    
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
        "created_at": user.created_at
    }


@app.patch("/api/users/{github_id}")
async def update_user(
    github_id: str,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_key)
):
    """Update user settings (plan upgrade, API keys, etc.)"""
    result = await db.execute(
        select(User).where(User.github_id == github_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    
    user.updated_at = datetime.utcnow()
    await db.commit()
    
    # If plan changed, need to recreate container with new limits
    if user_update.plan and user_update.plan != user.plan:
        # Stop old container
        docker_manager.stop_container(github_id)
        docker_manager.delete_container(github_id, remove_data=False)
        
        # Create new container with new limits
        plan_config = PLANS[user_update.plan]
        result = docker_manager.create_container(
            github_id=github_id,
            plan=user_update.plan,
            port=user.container_port,
            telegram_token=user.telegram_bot_token,
            gemini_key=user.gemini_api_key,
            github_token=user.github_token,
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
    result = await db.execute(
        select(User).where(User.github_id == github_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete container
    docker_result = docker_manager.delete_container(github_id, remove_data=remove_data)
    
    # Delete user record
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
    """Perform action on user's container (start/stop/restart)"""
    result = await db.execute(
        select(User).where(User.github_id == github_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if action.action == "start":
        result = docker_manager.start_container(github_id)
        status = "running"
    elif action.action == "stop":
        result = docker_manager.stop_container(github_id)
        status = "stopped"
    elif action.action == "restart":
        result = docker_manager.restart_container(github_id)
        status = "running"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    if result["success"]:
        user.container_status = status
        await db.commit()
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
    return docker_manager.get_container_logs(github_id, tail=tail)


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
