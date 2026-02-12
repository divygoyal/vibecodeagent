"""
ClawBot Watchdog Service
Monitors container health and handles auto-recovery
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List

import docker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update

from config import settings
from models import User, ContainerEvent, Alert
from alerts import AlertManager

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("watchdog")


class Watchdog:
    """
    Monitors ClawBot containers and handles:
    - Health checks
    - Auto-restart on failure
    - Alerting
    - Cleanup of orphaned containers
    """
    
    def __init__(self):
        self.docker_client = docker.from_env()
        self.alert_manager = AlertManager()
        
        # Database
        self.engine = create_async_engine(settings.DATABASE_URL, echo=False)
        self.async_session = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
        
        # Track restart attempts
        self.restart_attempts: Dict[str, int] = {}
    
    async def get_db(self) -> AsyncSession:
        """Get database session"""
        return self.async_session()
    
    async def check_container_health(self, github_id: str, container_name: str) -> Dict:
        """Check health of a single container"""
        try:
            container = self.docker_client.containers.get(container_name)
            
            # Get health status
            state = container.attrs.get("State", {})
            health = state.get("Health", {})
            status = container.status
            health_status = health.get("Status", "unknown")
            
            return {
                "github_id": github_id,
                "container_name": container_name,
                "status": status,
                "health": health_status,
                "running": status == "running",
                "healthy": health_status in ["healthy", "starting"],
                "restart_count": container.attrs.get("RestartCount", 0)
            }
            
        except docker.errors.NotFound:
            return {
                "github_id": github_id,
                "container_name": container_name,
                "status": "not_found",
                "health": "not_found",
                "running": False,
                "healthy": False,
                "restart_count": 0
            }
        except Exception as e:
            logger.error(f"Error checking container {container_name}: {e}")
            return {
                "github_id": github_id,
                "container_name": container_name,
                "status": "error",
                "health": "error",
                "running": False,
                "healthy": False,
                "error": str(e)
            }
    
    async def handle_unhealthy_container(self, user: User, health_info: Dict, db: AsyncSession):
        """Handle an unhealthy or stopped container"""
        github_id = user.github_id
        container_name = f"{settings.CONTAINER_PREFIX}_{github_id}"
        
        # Track restart attempts
        attempts = self.restart_attempts.get(github_id, 0)
        
        if attempts >= settings.MAX_RESTART_ATTEMPTS:
            # Max restarts reached - alert and disable
            logger.error(f"Max restart attempts reached for {github_id}")
            
            # Update user status
            user.container_status = "error"
            user.is_active = False
            await db.commit()
            
            # Log event
            event = ContainerEvent(
                user_id=user.id,
                container_id=user.container_id,
                event_type="max_restarts",
                details=f"Container failed after {attempts} restart attempts"
            )
            db.add(event)
            
            # Create alert
            alert = Alert(
                severity="critical",
                message=f"Container for user {github_id} failed after {attempts} restarts. Manual intervention required.",
                user_id=user.id
            )
            db.add(alert)
            await db.commit()
            
            # Send notification
            await self.alert_manager.send_alert(
                severity="critical",
                title="Container Failed",
                message=f"User: {github_id}\nContainer: {container_name}\nStatus: FAILED after {attempts} restarts\nAction: Manual intervention required"
            )
            
            # Reset attempts counter
            self.restart_attempts[github_id] = 0
            return
        
        # Attempt restart
        logger.warning(f"Attempting restart {attempts + 1}/{settings.MAX_RESTART_ATTEMPTS} for {github_id}")
        
        try:
            container = self.docker_client.containers.get(container_name)
            
            if health_info["status"] == "exited":
                container.start()
            else:
                container.restart(timeout=10)
            
            # Update tracking
            self.restart_attempts[github_id] = attempts + 1
            
            # Update user status
            user.container_status = "restarting"
            user.restart_count = user.restart_count + 1
            await db.commit()
            
            # Log event
            event = ContainerEvent(
                user_id=user.id,
                container_id=user.container_id,
                event_type="auto_restart",
                details=f"Attempt {attempts + 1}/{settings.MAX_RESTART_ATTEMPTS}"
            )
            db.add(event)
            await db.commit()
            
            # Send warning alert
            await self.alert_manager.send_alert(
                severity="warning",
                title="Container Auto-Restarted",
                message=f"User: {github_id}\nContainer: {container_name}\nAttempt: {attempts + 1}/{settings.MAX_RESTART_ATTEMPTS}"
            )
            
            logger.info(f"Restart initiated for {github_id}")
            
        except docker.errors.NotFound:
            logger.error(f"Container not found for {github_id}")
            user.container_status = "not_found"
            await db.commit()
            
        except Exception as e:
            logger.error(f"Failed to restart container for {github_id}: {e}")
            self.restart_attempts[github_id] = attempts + 1
    
    async def handle_healthy_container(self, user: User, health_info: Dict, db: AsyncSession):
        """Update status for a healthy container"""
        github_id = user.github_id
        
        # Reset restart counter if healthy
        if github_id in self.restart_attempts:
            del self.restart_attempts[github_id]
        
        # Update user status if changed
        if user.container_status != "running":
            user.container_status = "running"
            user.last_health_check = datetime.utcnow()
            await db.commit()
            
            logger.info(f"Container {github_id} recovered to healthy state")
    
    async def check_all_containers(self):
        """Check health of all user containers"""
        db = await self.get_db()
        
        try:
            # Get all active users
            result = await db.execute(
                select(User).where(User.is_active == True)
            )
            users = result.scalars().all()
            
            logger.info(f"Checking {len(users)} containers...")
            
            for user in users:
                container_name = f"{settings.CONTAINER_PREFIX}_{user.github_id}"
                
                # Check health
                health_info = await self.check_container_health(user.github_id, container_name)
                
                if health_info["running"] and health_info["healthy"]:
                    await self.handle_healthy_container(user, health_info, db)
                else:
                    await self.handle_unhealthy_container(user, health_info, db)
                
                # Update last health check time
                user.last_health_check = datetime.utcnow()
            
            await db.commit()
            logger.info("Health check cycle complete")
            
        except Exception as e:
            logger.error(f"Error during health check cycle: {e}")
        finally:
            await db.close()
    
    async def cleanup_orphaned_containers(self):
        """Remove containers that don't have a corresponding user"""
        db = await self.get_db()
        
        try:
            # Get all clawbot containers
            containers = self.docker_client.containers.list(
                all=True,
                filters={"label": "clawbot.user"}
            )
            
            # Get all user github_ids
            result = await db.execute(select(User.github_id))
            valid_users = {row[0] for row in result.fetchall()}
            
            for container in containers:
                github_id = container.labels.get("clawbot.user")
                
                if github_id not in valid_users:
                    logger.warning(f"Found orphaned container: {container.name}")
                    
                    try:
                        container.stop(timeout=5)
                        container.remove()
                        logger.info(f"Removed orphaned container: {container.name}")
                    except Exception as e:
                        logger.error(f"Failed to remove orphaned container {container.name}: {e}")
            
        except Exception as e:
            logger.error(f"Error during orphan cleanup: {e}")
        finally:
            await db.close()
    
    async def run(self):
        """Main watchdog loop"""
        logger.info("Watchdog service started")
        logger.info(f"Health check interval: {settings.HEALTH_CHECK_INTERVAL}s")
        logger.info(f"Max restart attempts: {settings.MAX_RESTART_ATTEMPTS}")
        
        # Send startup notification
        await self.alert_manager.send_alert(
            severity="info",
            title="Watchdog Started",
            message="ClawBot watchdog service is now running"
        )
        
        while True:
            try:
                # Check all containers
                await self.check_all_containers()
                
                # Cleanup orphans (less frequently)
                # Every 10 cycles
                
            except Exception as e:
                logger.error(f"Watchdog loop error: {e}")
            
            # Wait for next cycle
            await asyncio.sleep(settings.HEALTH_CHECK_INTERVAL)


async def main():
    """Entry point"""
    watchdog = Watchdog()
    await watchdog.run()


if __name__ == "__main__":
    asyncio.run(main())
