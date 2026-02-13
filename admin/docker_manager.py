"""
Docker Container Manager
Handles creation, management, and monitoring of user containers
"""
import docker
import os
import json
import logging
from typing import Optional, Dict, Any
from config import settings, PLANS
from datetime import datetime

# Setup logger
logger = logging.getLogger(__name__)

class DockerManager:
    """Manages Docker containers for user ClawBots"""
    
    def __init__(self):
        self.client = docker.from_env()
        self.base_dir = "/home/ubuntu/clawbot-data"  # Host path for user data
    
    def _get_container_name(self, user_identifier: str) -> str:
        """Generate unique container name"""
        return f"{settings.CONTAINER_PREFIX}_{user_identifier}"
    
    def _get_user_data_dir(self, user_identifier: str) -> str:
        """Get host path for user's data directory"""
        return f"{self.base_dir}/{user_identifier}"
    
    def _ensure_user_dir(self, user_identifier: str) -> str:
        """Create user data directory if not exists with proper permissions"""
        user_dir = self._get_user_data_dir(user_identifier)
        os.makedirs(user_dir, exist_ok=True)
        os.makedirs(f"{user_dir}/workspace", exist_ok=True)
        os.makedirs(f"{user_dir}/.openclaw", exist_ok=True)
        
        # Fix permissions - OpenClaw runs as node user (UID 1000)
        # Make directories writable by the container user
        os.system(f"chmod -R 777 {user_dir}")
        
        return user_dir
    
    def _seed_intelligence(self, user_identifier: str, custom_rules: Optional[str] = None, connections: Optional[Dict[str, Any]] = None) -> None:
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
        user_dir = self._get_user_data_dir(user_identifier)
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
        
        # USER.md — personalized with user_identifier
        user_path = f"{workspace}/USER.md"
        if not os.path.exists(user_path):
            user_content = f"""# USER.md - About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **User Identifier:** {user_identifier}
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

        # Always ensure Active Connections are up to date (Idempotent update)
        if connections:
             try:
                 if os.path.exists(user_path):
                     with open(user_path, 'r') as f:
                         content = f.read()
                     
                     # Remove existing "Active Connections" section if present to avoid duplication
                     if "## Active Connections" in content:
                         content = content.split("## Active Connections")[0].strip()
                     
                     # Build new connections section
                     new_lines = []
                     if "google" in connections:
                         new_lines.append("- ✅ Google Analytics (Active: Session authenticated via environment)")
                     if "github" in connections:
                         new_lines.append("- ✅ GitHub (Active: Authenticated via environment)")
                     
                     if new_lines:
                         content += "\n\n## Active Connections\n" + "\n".join(new_lines) + "\n"
                         
                     with open(user_path, 'w') as f:
                         f.write(content)
                     
             except Exception as e:
                 logger.error(f"Failed to update USER.md with connections: {e}")
        
        # Initialize git repo in workspace (vanilla OpenClaw does this)
        git_dir = f"{workspace}/.git"
        if not os.path.exists(git_dir):
            os.system(f"git init {workspace}")
            os.system(f"git -C {workspace} add -A")
            os.system(f'git -C {workspace} commit -m "Initial workspace" --allow-empty')
    
    def _create_user_config(self, user_identifier: str, plan: str, telegram_token: str, custom_rules: Optional[str] = None) -> None:
        """Create OpenClaw config file matching vanilla OpenClaw structure"""
        user_dir = self._get_user_data_dir(user_identifier)
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
                        "primary": "google/gemini-3-pro-preview"
                    },
                    "models": {
                        "google/gemini-3-pro-preview": {
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
    
    def _copy_plugins(self, user_identifier: str, enabled_plugins: list) -> None:
        """Copy enabled plugins to user's workspace"""
        user_dir = self._get_user_data_dir(user_identifier)
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
        user_identifier: str,
        plan: str,
        port: int,
        telegram_token: str,
        gemini_key: Optional[str] = None,
        connections: Optional[Dict[str, Any]] = None, # Generic connections dict
        custom_rules: Optional[str] = None,
        enabled_plugins: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Create a new ClawBot container for a user
        
        Returns:
            Dict with container_id and status
        """
        container_name = self._get_container_name(user_identifier)
        
        # Check if container already exists
        # Check if container already exists
        try:
            existing = self.client.containers.get(container_name)
            # If exists, we should ensure it's running and maybe update config?
            # For now, just ensure it's running. IDEMPOTENCY FIX.
            if existing.status != "running":
                existing.start()
            
            return {
                "success": True,
                "container_id": existing.id,
                "container_name": container_name,
                "status": "running",
                "message": "Container already exists, ensured running."
            }
        except docker.errors.NotFound:
            pass
        
        # Get plan limits
        plan_config = PLANS.get(plan, PLANS["free"])
        
        # Ensure directories exist
        user_dir = self._ensure_user_dir(user_identifier)
        
        # Seed intelligence files
        self._seed_intelligence(user_identifier, custom_rules, connections)
        
        # Create config
        self._create_user_config(user_identifier, plan, telegram_token, custom_rules)
        
        # Copy plugins
        if enabled_plugins:
            self._copy_plugins(user_identifier, enabled_plugins)
        
        # Fix ownership
        os.system(f"chown -R 1000:1000 {user_dir}")
        
        # Environment variables
        heap_sizes = {"free": "768", "starter": "1536", "pro": "3584"}
        node_heap = heap_sizes.get(plan, "768")
        
        # Calculate enabled skills based on connections
        skills = []
        connections_json = "{}"
        if connections:
            import json
            connections_json = json.dumps(connections)
            if "github" in connections:
                skills.append("coding")
                skills.append("github-ghost") # Explicitly add github plugin if present
            if "google" in connections:
                skills.append("google-analytics") # Use the plugin name, not generic 'analytics'
        else:
            # Fallback/Legacy: if no connections passed, assume coding (or none?)
            # But likely we want to defaults to coding if we can't determine
            skills.append("coding")

        env = {
            "OPENCLAW_WORKSPACE_DIR": "/data/workspace",
            "OPENCLAW_STATE_DIR": "/data/.openclaw",
            "OPENCLAW_PLUGINS_DIR": "/data/workspace/plugins",
            "OPENCLAW_SKILLS_DIR": "/data/workspace/plugins", # Fallback for bot skill discovery
            "OPENCLAW_SKILLS_ENABLED": ",".join(skills) if skills else "*", 
            # Telegram config
            "TELEGRAM_BOT_TOKEN": telegram_token,
            # Model config
            "GEMINI_API_KEY": gemini_key or settings.GEMINI_API_KEY,
            "OPENCLAW_MODEL": "google/gemini-3-pro-preview",
            # User identification
            "USER_IDENTIFIER": user_identifier,
            "PLAN": plan,
            # Node.js memory
            "NODE_OPTIONS": f"--max-old-space-size={node_heap}",
            # Generic Connections
            "OPENCLAW_CONNECTIONS": connections_json,
            # OAuth Keys (Required for refresh token flow)
            "GOOGLE_CLIENT_ID": settings.GOOGLE_CLIENT_ID or "",
            "GOOGLE_CLIENT_SECRET": settings.GOOGLE_CLIENT_SECRET or ""
        }
        
        # Legacy compat: maintain GITHUB_TOKEN/ID env vars if present in connections
        if connections and "github" in connections:
             env["GITHUB_TOKEN"] = connections["github"].get("access_token", "")
             env["GITHUB_ID"] = connections["github"].get("provider_account_id", user_identifier)
        else:
             env["GITHUB_ID"] = user_identifier
        
        # Create container - use default entrypoint
        try:
            container = self.client.containers.run(
                settings.OPENCLAW_IMAGE,
                name=container_name,
                detach=True,
                restart_policy={"Name": "on-failure", "MaximumRetryCount": 3},
                ports={"8080/tcp": port},
                volumes={
                    user_dir: {"bind": "/data", "mode": "rw"},
                    # Also mount plugins to /app/skills/workspace so they are auto-discovered
                    str(settings.PLUGINS_DIR): {"bind": "/app/skills/workspace", "mode": "rw"}
                },
                environment=env,
                mem_limit=plan_config["memory_limit"],
                cpu_quota=int(plan_config["cpu_limit"] * 100000),
                labels={
                    "clawbot.user": user_identifier,
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
    
    def stop_container(self, user_identifier: str) -> Dict[str, Any]:
        """Stop a user's container"""
        container_name = self._get_container_name(user_identifier)
        
        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=10)
            return {"success": True, "status": "stopped"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def start_container(self, user_identifier: str) -> Dict[str, Any]:
        """Start a stopped container"""
        container_name = self._get_container_name(user_identifier)
        
        try:
            container = self.client.containers.get(container_name)
            container.start()
            return {"success": True, "status": "running"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def restart_container(self, user_identifier: str) -> Dict[str, Any]:
        """Restart a container"""
        container_name = self._get_container_name(user_identifier)
        
        try:
            container = self.client.containers.get(container_name)
            container.restart(timeout=10)
            return {"success": True, "status": "running"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def delete_container(self, user_identifier: str, remove_data: bool = False) -> Dict[str, Any]:
        """Delete a container (and optionally its data)"""
        container_name = self._get_container_name(user_identifier)
        
        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=5)
            container.remove()
            
            if remove_data:
                user_dir = self._get_user_data_dir(user_identifier)
                os.system(f"rm -rf {user_dir}")
            
            return {"success": True, "status": "deleted"}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}
    
    def get_container_status(self, user_identifier: str) -> Dict[str, Any]:
        """Get container health and status"""
        container_name = self._get_container_name(user_identifier)
        
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
            
            # Parse logs for Telegram status
            logs = ""
            try:
                logs = container.logs(tail=50).decode('utf-8')
            except:
                pass

            telegram_status = "initializing"
            bot_username = None
            
            # Simple log parsing logic
            logs_lower = logs.lower()
            has_errors = "error" in logs_lower and "telegram" in logs_lower
            
            if has_errors:
                telegram_status = "error"
                if "409" in logs_lower or "conflict" in logs_lower:
                    telegram_status = "webhook_conflict"
            elif any(s in logs_lower for s in ["logged in as", "bot started", "polling", "telegram connected", "launching", "started", "running", "ready", "listening"]):
                telegram_status = "connected"
            elif health_status == "healthy":
                telegram_status = "connected"
            elif container.status == "running" and not has_errors:
                # Fallback: if container is running with no errors in logs,
                # assume it's connected (handles containers without HEALTHCHECK)
                import time
                started_at = container.attrs.get("State", {}).get("StartedAt", "")
                if started_at:
                    try:
                        from datetime import datetime, timezone
                        # Docker timestamps: 2024-01-15T10:30:00.123456789Z
                        # Truncate nanoseconds to microseconds for Python parsing
                        ts = started_at.replace("Z", "+00:00")
                        if "." in ts:
                            parts = ts.split(".")
                            frac = parts[1].split("+")[0].split("-")[0]
                            tz = "+" + parts[1].split("+")[1] if "+" in parts[1] else "-" + parts[1].split("-")[1] if parts[1].count("-") > 0 else "+00:00"
                            ts = parts[0] + "." + frac[:6] + tz
                        start_time = datetime.fromisoformat(ts)
                        now = datetime.now(timezone.utc)
                        uptime_seconds = (now - start_time).total_seconds()
                        if uptime_seconds > 30:
                            telegram_status = "connected"
                    except Exception:
                        # If we can't parse the timestamp, just assume connected
                        # since the container IS running
                        telegram_status = "connected"
                else:
                    telegram_status = "connected"
                
            # Try to extract username from logs
            import re
            user_match = re.search(r"Logged in as @(\w+)", logs, re.IGNORECASE)
            if not user_match:
                user_match = re.search(r"@(\w+Bot)", logs, re.IGNORECASE)
            if user_match:
                bot_username = user_match.group(1)
            
            return {
                "success": True,
                "status": container.status,
                "health": health_status,
                "memory_usage_mb": round(mem_usage / (1024 * 1024), 2),
                "memory_percent": round(mem_percent, 2),
                "restart_count": container.attrs["RestartCount"],
                "started_at": container.attrs["State"]["StartedAt"],
                "telegram_status": telegram_status,
                "bot_username": bot_username
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
                "user_identifier": labels.get("clawbot.user"),
                "plan": labels.get("clawbot.plan"),
                "created": labels.get("clawbot.created")
            })
        
        return result
    
    def get_container_logs(self, user_identifier: str, tail: int = 100) -> Dict[str, Any]:
        """Get recent logs from a container"""
        container_name = self._get_container_name(user_identifier)
        
        try:
            container = self.client.containers.get(container_name)
            logs = container.logs(tail=tail, timestamps=True).decode('utf-8')
            return {"success": True, "logs": logs}
        except docker.errors.NotFound:
            return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}


    def inspect_container_for_sync(self, user_identifier: str) -> Optional[Dict[str, Any]]:
        """
        Inspect a container to recover user data for DB sync.
        Extracts tokens and config from ENV variables and Labels.
        """
        container_name = self._get_container_name(user_identifier)
        try:
            container = self.client.containers.get(container_name)
            labels = container.labels
            
            # Safely extract Env variables (handle missing/malformed)
            try:
                env_list = container.attrs.get('Config', {}).get('Env', [])
                env = {}
                for e in env_list:
                    if '=' in e:
                        k, v = e.split('=', 1)
                        env[k] = v
            except Exception:
                env = {}
            
            # Extract port mapping safely
            host_port = None
            try:
                ports = container.attrs.get('NetworkSettings', {}).get('Ports', {})
                if ports and "8080/tcp" in ports and ports["8080/tcp"]:
                    host_port = int(ports["8080/tcp"][0]["HostPort"])
            except Exception:
                pass
            
            # Fallback for created_at
            created_at = labels.get("clawbot.created")
            if not created_at:
                # Try to get from State.StartedAt
                started_at = container.attrs.get("State", {}).get("StartedAt")
                created_at = started_at if started_at else datetime.utcnow().isoformat()

            username = env.get("GITHUB_USERNAME")
            if not username:
                # If username missing from env, use user_identifier as fallback or fetch from potential label
                username = labels.get("clawbot.username", user_identifier)

            return {
                "user_identifier": user_identifier,
                "github_username": username,
                "plan": labels.get("clawbot.plan", "free"),
                "container_id": container.id,
                "container_name": container_name,
                "container_port": host_port,
                "container_status": container.status,
                "telegram_bot_token": env.get("TELEGRAM_BOT_TOKEN", ""),
                "gemini_api_key": env.get("GEMINI_API_KEY"),
                "github_token": env.get("GITHUB_TOKEN"),
                "custom_rules": None,
                "created_at": created_at
            }
        except Exception as e:
            print(f"Error inspecting container {container_name}: {e}")
            return None


# Singleton instance
docker_manager = DockerManager()