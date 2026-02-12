"""
Docker Container Manager
Handles creation, management, and monitoring of user containers
"""
import docker
import os
import json
from typing import Optional, Dict, Any
from config import settings, PLANS
from datetime import datetime


class DockerManager:
    """Manages Docker containers for user ClawBots"""
    
    def __init__(self):
        self.client = docker.from_env()
        self.base_dir = "/home/ubuntu/clawbot-data"  # Host path for user data
    
    def _get_container_name(self, github_id: str) -> str:
        """Generate unique container name"""
        return f"{settings.CONTAINER_PREFIX}_{github_id}"
    
    def _get_user_data_dir(self, github_id: str) -> str:
        """Get host path for user's data directory"""
        return f"{self.base_dir}/{github_id}"
    
    def _ensure_user_dir(self, github_id: str) -> str:
        """Create user data directory if not exists"""
        user_dir = self._get_user_data_dir(github_id)
        os.makedirs(user_dir, exist_ok=True)
        os.makedirs(f"{user_dir}/workspace", exist_ok=True)
        os.makedirs(f"{user_dir}/.openclaw", exist_ok=True)
        return user_dir
    
    def _create_user_config(self, github_id: str, plan: str, custom_rules: Optional[str] = None) -> None:
        """Create token-optimized config for user"""
        user_dir = self._get_user_data_dir(github_id)
        
        # Base config - token optimized
        config = {
            "heartbeat": {
                "enabled": False  # Disable heartbeats - major token saver
            },
            "context": {
                "maxTokens": 32000,     # Context limit
                "compactionThreshold": 24000,  # Aggressive compaction
                "reserveTokens": 4000
            },
            "toolOutputTruncation": {
                "maxChars": 5000
            },
            "modelRouting": {
                "simple": "gemini-2.0-flash-lite",  # Cheap for simple tasks
                "complex": "gemini-2.0-flash"       # Better for complex
            }
        }
        
        # Add custom rules if pro plan
        if plan == "pro" and custom_rules:
            try:
                config["customRules"] = json.loads(custom_rules)
            except:
                pass
        
        config_path = f"{user_dir}/.openclaw/config.json"
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    
    def _copy_plugins(self, github_id: str, enabled_plugins: list) -> None:
        """Copy enabled plugins to user's workspace"""
        user_dir = self._get_user_data_dir(github_id)
        plugins_dir = f"{user_dir}/workspace/plugins"
        os.makedirs(plugins_dir, exist_ok=True)
        
        # Source plugins directory (mounted from host)
        source_plugins = "/opt/clawbot/plugins"
        
        for plugin in enabled_plugins:
            src = f"{source_plugins}/{plugin}"
            dst = f"{plugins_dir}/{plugin}"
            if os.path.exists(src) and not os.path.exists(dst):
                os.system(f"cp -r {src} {dst}")
    
    def create_container(
        self,
        github_id: str,
        plan: str,
        port: int,
        telegram_token: str,
        gemini_key: Optional[str] = None,
        github_token: Optional[str] = None,
        custom_rules: Optional[str] = None,
        enabled_plugins: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Create a new ClawBot container for a user
        
        Returns:
            Dict with container_id and status
        """
        container_name = self._get_container_name(github_id)
        
        # Check if container already exists
        try:
            existing = self.client.containers.get(container_name)
            return {
                "success": False,
                "error": "Container already exists",
                "container_id": existing.id
            }
        except docker.errors.NotFound:
            pass
        
        # Get plan limits
        plan_config = PLANS.get(plan, PLANS["free"])
        
        # Ensure directories exist
        user_dir = self._ensure_user_dir(github_id)
        
        # Create config
        self._create_user_config(github_id, plan, custom_rules)
        
        # Copy plugins
        if enabled_plugins:
            self._copy_plugins(github_id, enabled_plugins)
        
        # Environment variables
        # Calculate Node.js heap size based on plan (leave ~256MB for system)
        heap_sizes = {"free": "768", "starter": "1536", "pro": "3584"}
        node_heap = heap_sizes.get(plan, "768")
        
        # Generate a unique gateway token for this container
        import secrets
        gateway_token = secrets.token_hex(16)
        
        env = {
            "OPENCLAW_WORKSPACE_DIR": "/data/workspace",
            "OPENCLAW_STATE_DIR": "/data/.openclaw",
            "TELEGRAM_BOT_TOKEN": telegram_token,
            "GEMINI_API_KEY": gemini_key or settings.GEMINI_API_KEY,
            "GITHUB_ID": github_id,
            "PLAN": plan,
            "NODE_OPTIONS": f"--max-old-space-size={node_heap}",  # Increase JS heap
            # OpenClaw specific settings
            "OPENCLAW_GATEWAY_TOKEN": gateway_token,  # Required for gateway auth
            "OPENCLAW_TELEGRAM_ENABLED": "true",       # Enable Telegram
            "OPENCLAW_GATEWAY_AUTH": "none",           # Disable gateway auth for simplicity
        }
        
        if github_token:
            env["GITHUB_TOKEN"] = github_token
        
        # Create container
        try:
            container = self.client.containers.run(
                settings.OPENCLAW_IMAGE,
                name=container_name,
                detach=True,
                restart_policy={"Name": "on-failure", "MaximumRetryCount": 3},
                ports={"8080/tcp": port},
                volumes={
                    user_dir: {"bind": "/data", "mode": "rw"}
                },
                environment=env,
                mem_limit=plan_config["memory_limit"],
                cpu_quota=int(plan_config["cpu_limit"] * 100000),
                healthcheck={
                    "test": ["CMD", "curl", "-f", "http://localhost:8080/health"],
                    "interval": 30000000000,  # 30s in nanoseconds
                    "timeout": 10000000000,   # 10s
                    "retries": 3,
                    "start_period": 60000000000  # 60s
                },
                labels={
                    "clawbot.user": github_id,
                    "clawbot.plan": plan,
                    "clawbot.created": datetime.utcnow().isoformat()
                }
            )
            
            return {
                "success": True,
                "container_id": container.id,
                "container_name": container_name,
                "port": port,
                "status": "running"
            }
            
        except docker.errors.APIError as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def stop_container(self, github_id: str) -> Dict[str, Any]:
        """Stop a user's container"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=10)
            return {"success": True, "status": "stopped"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def start_container(self, github_id: str) -> Dict[str, Any]:
        """Start a stopped container"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            container.start()
            return {"success": True, "status": "running"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def restart_container(self, github_id: str) -> Dict[str, Any]:
        """Restart a container"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            container.restart(timeout=10)
            return {"success": True, "status": "running"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def delete_container(self, github_id: str, remove_data: bool = False) -> Dict[str, Any]:
        """Delete a container (and optionally its data)"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=5)
            container.remove()
            
            if remove_data:
                user_dir = self._get_user_data_dir(github_id)
                os.system(f"rm -rf {user_dir}")
            
            return {"success": True, "status": "deleted"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def get_container_status(self, github_id: str) -> Dict[str, Any]:
        """Get container health and status"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            stats = container.stats(stream=False)
            
            # Calculate memory usage
            mem_usage = stats["memory_stats"].get("usage", 0)
            mem_limit = stats["memory_stats"].get("limit", 1)
            mem_percent = (mem_usage / mem_limit) * 100 if mem_limit > 0 else 0
            
            # Get health status
            health = container.attrs.get("State", {}).get("Health", {})
            health_status = health.get("Status", "unknown")
            
            return {
                "success": True,
                "status": container.status,
                "health": health_status,
                "memory_usage_mb": round(mem_usage / (1024 * 1024), 2),
                "memory_percent": round(mem_percent, 2),
                "restart_count": container.attrs["RestartCount"],
                "started_at": container.attrs["State"]["StartedAt"]
            }
            
        except docker.errors.NotFound:
            return {"success": False, "status": "not_found", "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "status": "error", "error": str(e)}
    
    def get_all_containers(self) -> list:
        """Get all ClawBot containers"""
        containers = self.client.containers.list(
            all=True,
            filters={"label": f"clawbot.user"}
        )
        
        result = []
        for container in containers:
            labels = container.labels
            result.append({
                "container_id": container.short_id,
                "name": container.name,
                "status": container.status,
                "github_id": labels.get("clawbot.user"),
                "plan": labels.get("clawbot.plan"),
                "created": labels.get("clawbot.created")
            })
        
        return result
    
    def get_container_logs(self, github_id: str, tail: int = 100) -> Dict[str, Any]:
        """Get recent logs from a container"""
        container_name = self._get_container_name(github_id)
        
        try:
            container = self.client.containers.get(container_name)
            logs = container.logs(tail=tail, timestamps=True).decode('utf-8')
            return {"success": True, "logs": logs}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}


# Singleton instance
docker_manager = DockerManager()
