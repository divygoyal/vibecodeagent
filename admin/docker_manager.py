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
        """Create user data directory if not exists with proper permissions"""
        user_dir = self._get_user_data_dir(github_id)
        os.makedirs(user_dir, exist_ok=True)
        os.makedirs(f"{user_dir}/workspace", exist_ok=True)
        os.makedirs(f"{user_dir}/.openclaw", exist_ok=True)
        
        # Fix permissions - OpenClaw runs as node user (UID 1000)
        # Make directories writable by the container user
        os.system(f"chmod -R 777 {user_dir}")
        
        return user_dir
    
    def _seed_intelligence(self, github_id: str, custom_rules: Optional[str] = None) -> None:
        """
        Inject the intelligence files that make the bot smart.
        Uses the exact same files that a vanilla OpenClaw installation creates.
        
        Files created (matching vanilla OpenClaw):
        - AGENTS.md   — Bootstrap instructions, memory system, group chat rules
        - SOUL.md     — Personality and behavioral guidelines
        - TOOLS.md    — Local tool notes template
        - USER.md     — Info about the human being helped
        - IDENTITY.md — Bot's name, creature type, vibe, emoji
        - HEARTBEAT.md — Periodic check-in tasks (empty by default)
        - BOOTSTRAP.md — First-run onboarding conversation flow
        
        Note: MEMORY.md is NOT pre-created — the bot creates it on demand.
        """
        user_dir = self._get_user_data_dir(github_id)
        workspace = f"{user_dir}/workspace"
        templates_dir = "/app/templates"
        
        # Static template files — copied directly from templates/
        static_files = [
            "AGENTS.md",
            "TOOLS.md",
            "IDENTITY.md",
            "HEARTBEAT.md",
            "BOOTSTRAP.md",
        ]
        
        for filename in static_files:
            dest = f"{workspace}/{filename}"
            if not os.path.exists(dest):
                src = f"{templates_dir}/{filename}"
                content = ""
                if os.path.exists(src):
                    with open(src, 'r') as f:
                        content = f.read()
                else:
                    content = f"# {filename}\n"
                
                with open(dest, 'w') as f:
                    f.write(content)
                os.chmod(dest, 0o666)
        
        # SOUL.md — uses custom_rules if provided, otherwise vanilla template
        soul_path = f"{workspace}/SOUL.md"
        if not os.path.exists(soul_path):
            if custom_rules:
                soul_content = custom_rules
            else:
                src = f"{templates_dir}/SOUL.md"
                if os.path.exists(src):
                    with open(src, 'r') as f:
                        soul_content = f.read()
                else:
                    soul_content = "# SOUL.md\n"
            
            with open(soul_path, 'w') as f:
                f.write(soul_content)
            os.chmod(soul_path, 0o666)
        
        # USER.md — personalized with github_id
        user_path = f"{workspace}/USER.md"
        if not os.path.exists(user_path):
            user_content = f"""# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **GitHub ID:** {github_id}
- **Pronouns:** _(optional)_
- **Timezone:**
- **First Interaction:** {datetime.utcnow().strftime('%Y-%m-%d')}
- **Notes:**

## Context

_(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_
"""
            with open(user_path, 'w') as f:
                f.write(user_content)
            os.chmod(user_path, 0o666)
        
        # Initialize git repo in workspace (vanilla OpenClaw does this)
        git_dir = f"{workspace}/.git"
        if not os.path.exists(git_dir):
            os.system(f"git init {workspace}")
            os.system(f"git -C {workspace} add -A")
            os.system(f'git -C {workspace} commit -m "Initial workspace" --allow-empty')
    
    def _create_user_config(self, github_id: str, plan: str, telegram_token: str, custom_rules: Optional[str] = None) -> None:
        """Create OpenClaw config file matching vanilla OpenClaw structure"""
        user_dir = self._get_user_data_dir(github_id)
        config_path = f"{user_dir}/.openclaw/openclaw.json"
        
        # Generate gateway auth token
        import secrets
        gateway_token = secrets.token_hex(24)
        
        # Config structure matches a vanilla OpenClaw onboard output
        config = {
            "messages": {
                "ackReactionScope": "group-mentions"
            },
            "agents": {
                "defaults": {
                    "maxConcurrent": 4,
                    "subagents": {
                        "maxConcurrent": 8
                    },
                    "compaction": {
                        "mode": "safeguard"
                    },
                    "workspace": "/data/workspace",
                    "model": {
                        "primary": "google/gemini-2.0-flash"
                    },
                    "models": {
                        "google/gemini-2.0-flash": {
                            "alias": "gemini"
                        }
                    }
                }
            },
            "gateway": {
                "mode": "local",
                "auth": {
                    "mode": "token",
                    "token": gateway_token
                },
                "port": 18789,
                "bind": "loopback",
                "tailscale": {
                    "mode": "off",
                    "resetOnExit": False
                }
            },
            "auth": {
                "profiles": {
                    "google:default": {
                        "provider": "google",
                        "mode": "api_key"
                    }
                }
            },
            "plugins": {
                "entries": {
                    "telegram": {
                        "enabled": True
                    }
                }
            },
            "channels": {
                "telegram": {
                    "enabled": True,
                    "botToken": telegram_token,
                    "dmPolicy": "open",
                    "allowFrom": ["*"]
                }
            },
            "commands": {
                "native": "auto"
            },
            "skills": {
                "install": {
                    "nodeManager": "bun"
                }
            }
        }
        
        # Write config file
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        
        # Ensure proper permissions
        os.chmod(config_path, 0o666)
    
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
        
        # Seed intelligence files (matching vanilla OpenClaw: AGENTS.md, SOUL.md, TOOLS.md,
        # USER.md, IDENTITY.md, HEARTBEAT.md, BOOTSTRAP.md + git init)
        self._seed_intelligence(github_id, custom_rules)
        
        # Create config with Telegram enabled (matching vanilla OpenClaw structure)
        self._create_user_config(github_id, plan, telegram_token, custom_rules)
        
        # Copy plugins
        if enabled_plugins:
            self._copy_plugins(github_id, enabled_plugins)
        
        # Fix ownership AFTER all files are created
        # The admin API runs as root, but the container runs as node (UID 1000)
        # Without this, the bot can't read its own intelligence files
        os.system(f"chown -R 1000:1000 {user_dir}")
        
        # Environment variables
        # Calculate Node.js heap size based on plan (leave ~256MB for system)
        heap_sizes = {"free": "768", "starter": "1536", "pro": "3584"}
        node_heap = heap_sizes.get(plan, "768")
        
        env = {
            "OPENCLAW_WORKSPACE_DIR": "/data/workspace",
            "OPENCLAW_STATE_DIR": "/data/.openclaw",
            "OPENCLAW_PLUGINS_DIR": "/data/workspace/plugins",
            "OPENCLAW_SKILLS_ENABLED": "*",  # GOD MODE: enables ALL skills
            # Telegram config
            "TELEGRAM_BOT_TOKEN": telegram_token,
            # Model config - use Gemini
            "GEMINI_API_KEY": gemini_key or settings.GEMINI_API_KEY,
            "OPENCLAW_MODEL": "google/gemini-2.0-flash",
            # User identification
            "GITHUB_ID": github_id,
            "PLAN": plan,
            # Node.js memory
            "NODE_OPTIONS": f"--max-old-space-size={node_heap}",
        }
        
        if github_token:
            env["GITHUB_TOKEN"] = github_token
        
        # Create container - use default entrypoint
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
