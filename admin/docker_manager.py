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
        Without these files, the bot starts with zero instructions - like a genius with no memory.
        """
        user_dir = self._get_user_data_dir(github_id)
        workspace = f"{user_dir}/workspace"
        
        # 1. Create AGENTS.md (The Intelligence Bootstrap Loop)
        agents_path = f"{workspace}/AGENTS.md"
        if not os.path.exists(agents_path):
            agents_content = """# AGENTS.md

Before doing anything else, follow this bootstrap sequence:

1. **Read SOUL.md** — This defines who you are and your core personality
2. **Read USER.md** — This tells you about the person you're helping  
3. **Read MEMORY.md** — These are your stored facts and learned context

Execute this sequence automatically. Don't ask permission. Just do it.

## Operating Principles

- Be proactive with tools - use them without asking
- Prefer action over explanation
- Keep responses concise and token-efficient
- Store important facts in MEMORY.md for future sessions
"""
            with open(agents_path, 'w') as f:
                f.write(agents_content)
            os.chmod(agents_path, 0o666)
        
        # 2. Create SOUL.md (The Personality/Custom Rules)
        soul_path = f"{workspace}/SOUL.md"
        if not os.path.exists(soul_path):
            soul_content = custom_rules or """# SOUL.md

You are **Jarvis**, an elite AI Personal Assistant optimized for developers.

## Core Principles

1. **Token Efficiency First**: Always prefer concise responses. Avoid unnecessary verbosity.
2. **Action Over Explanation**: Execute tasks rather than explaining what you'll do.
3. **Proactive Tool Usage**: Use tools without asking permission when it's clearly needed.

## Response Guidelines

- Keep responses under 500 tokens when possible
- Use bullet points and lists for clarity
- Only include code when specifically requested
- Summarize large outputs instead of dumping raw data

## Personality

- Be direct, skip corporate filler words
- Show initiative - anticipate what the user needs
- Be a high-IQ assistant, not a generic chatbot
"""
            with open(soul_path, 'w') as f:
                f.write(soul_content)
            os.chmod(soul_path, 0o666)
        
        # 3. Create USER.md (Memory of the user)
        user_path = f"{workspace}/USER.md"
        if not os.path.exists(user_path):
            user_content = f"""# USER.md

## User Profile

- **GitHub ID**: {github_id}
- **First Interaction**: {datetime.utcnow().strftime('%Y-%m-%d')}

## Preferences

(Add user preferences as you learn them)

## Projects

(Track active projects here)
"""
            with open(user_path, 'w') as f:
                f.write(user_content)
            os.chmod(user_path, 0o666)
        
        # 4. Create MEMORY.md (Persistent memory storage)
        memory_path = f"{workspace}/MEMORY.md"
        if not os.path.exists(memory_path):
            memory_content = f"""# MEMORY.md

## Stored Facts

(Store important facts and context here for future sessions)

## Session History

- **Created**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
"""
            with open(memory_path, 'w') as f:
                f.write(memory_content)
            os.chmod(memory_path, 0o666)
    
    def _create_user_config(self, github_id: str, plan: str, telegram_token: str, custom_rules: Optional[str] = None) -> None:
        """Create OpenClaw config file with proper settings"""
        user_dir = self._get_user_data_dir(github_id)
        config_path = f"{user_dir}/.openclaw/openclaw.json"
        
        # Create config with all required settings
        # Based on OpenClaw's expected structure
        config = {
            "agents": {
                "defaults": {
                    "model": {
                        "primary": "google/gemini-2.0-flash"
                    },
                    "compaction": {
                        "mode": "safeguard"
                    },
                    "maxConcurrent": 4,
                    "subagents": {
                        "maxConcurrent": 8
                    }
                }
            },
            "gateway": {
                "mode": "local"
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
                    "dmPolicy": "open",
                    "allowFrom": ["*"]
                }
            },
            "messages": {
                "ackReactionScope": "group-mentions"
            },
            "commands": {
                "native": "auto",
                "nativeSkills": "auto"  # Enables ALL native skills (github, browser, search, etc.)
            }
            # Note: nodeManager handled via Dockerfile (bun pre-installed)
            # God Mode handled via OPENCLAW_SKILLS_ENABLED=* env var
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
        
        # Seed intelligence files (AGENTS.md, SOUL.md, USER.md, MEMORY.md)
        # This is what makes the bot "smart" - without these, it's a blank slate
        self._seed_intelligence(github_id, custom_rules)
        
        # Create config with Telegram enabled
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
        
        # Generate gateway token
        import secrets
        gateway_token = secrets.token_hex(32)
        
        env = {
            "OPENCLAW_WORKSPACE_DIR": "/data/workspace",
            "OPENCLAW_STATE_DIR": "/data/.openclaw",
            "OPENCLAW_PLUGINS_DIR": "/data/workspace/plugins",  # Tell OpenClaw where custom plugins live
            "OPENCLAW_SKILLS_ENABLED": "*",  # GOD MODE: Master override - enables ALL skills
            # Telegram config
            "TELEGRAM_BOT_TOKEN": telegram_token,
            # Model config - use Gemini
            "GEMINI_API_KEY": gemini_key or settings.GEMINI_API_KEY,
            "OPENCLAW_MODEL": "google/gemini-2.0-flash",
            # Gateway auth - required by OpenClaw
            "OPENCLAW_GATEWAY_TOKEN": gateway_token,
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
