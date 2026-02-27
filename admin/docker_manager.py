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
        self.base_dir = settings.DATA_DIR  # Host path for user data
        self._shared_plugins_dir = self._ensure_shared_plugins()
        self._ensure_nanobot_image()
    
    def _get_container_name(self, user_identifier: str) -> str:
        """Generate unique container name"""
        return f"{settings.CONTAINER_PREFIX}_{user_identifier}"
    
    def _ensure_nanobot_image(self) -> None:
        """Build the trafficclaw/nanobot image natively on the host if it doesn't exist."""
        tag = "trafficclaw/nanobot:v4"
        try:
            self.client.images.get(tag)
            logger.info(f"Nanobot image {tag} already exists")
        except docker.errors.ImageNotFound:
            logger.info(f"Image {tag} not found! Starting background build thread...")
            import threading
            def build_image():
                import io
                dockerfile_content = '''FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

RUN apt-get update && \\
    apt-get install -y --no-install-recommends curl ca-certificates gnupg git && \\
    mkdir -p /etc/apt/keyrings && \\
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \\
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \\
    apt-get update && \\
    apt-get install -y --no-install-recommends nodejs && \\
    apt-get purge -y gnupg && \\
    apt-get autoremove -y && \\
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install --no-cache-dir git+https://github.com/HKUDS/nanobot.git
ENV HOME=/data
RUN mkdir -p /data/.nanobot/workspace/skills /data/.nanobot/workspace/memory
EXPOSE 18790
ENTRYPOINT ["nanobot"]
CMD ["gateway"]
'''
                try:
                    for line in self.client.api.build(fileobj=io.BytesIO(dockerfile_content.encode('utf-8')), tag=tag, rm=True, decode=True):
                        if 'stream' in line and line['stream'].strip():
                            print(f"[BUILDER] {line['stream'].strip()}")
                    logger.info(f"Successfully built {tag} in background!")
                except Exception as e:
                    logger.error(f"Failed to build nanobot image in background: {e}")
                    
            builder_thread = threading.Thread(target=build_image, daemon=True)
            builder_thread.start()

    def _get_user_data_dir(self, user_identifier: str) -> str:
        """Get host path for user's data directory"""
        return f"{self.base_dir}/{user_identifier}"
    
    def _ensure_user_dir(self, user_identifier: str) -> str:
        """Create user data directory if not exists with proper permissions"""
        user_dir = self._get_user_data_dir(user_identifier)
        os.makedirs(user_dir, exist_ok=True)
        os.makedirs(f"{user_dir}/workspace", exist_ok=True)
        os.makedirs(f"{user_dir}/.openclaw", exist_ok=True)
        # Pre-create the agent dir tree that auth-profiles.json writes into,
        # so _create_auth_profiles never fails with missing parent dirs.
        os.makedirs(f"{user_dir}/.openclaw/agents/main/agent", exist_ok=True)
        # Canvas directory — OpenClaw's canvas service mounts here at startup
        os.makedirs(f"{user_dir}/.openclaw/canvas", exist_ok=True)

        # OpenClaw needs to write to /data/.openclaw (mounted from host).
        # Ensure directory is writable for typical non-root container users.
        try:
            os.chmod(user_dir, 0o777)
            os.chmod(f"{user_dir}/workspace", 0o777)
            os.chmod(f"{user_dir}/.openclaw", 0o777)
        except Exception as e:
            logger.warning(f"Could not chmod user_dir for {user_identifier}: {e}")
            # Best-effort fallback
            os.system(f"chmod -R 777 '{user_dir}'")
        
        return user_dir
    
    def _ensure_shared_plugins(self) -> str:
        """Ensure plugins are available on the host for bot container mounts.
        
        On Coolify/Docker deployments, the configured PLUGINS_DIR may not exist
        on the host (it's baked into the admin image at /app/plugins).
        Copy them to DATA_DIR/_shared_plugins/ so sibling bot containers can
        access them via a host volume mount.
        """
        source_plugins = "/app/plugins"
        shared_dir = f"{self.base_dir}/_shared_plugins"
        
        # If configured PLUGINS_DIR exists on the host, use it directly
        if os.path.exists(settings.PLUGINS_DIR) and os.listdir(settings.PLUGINS_DIR):
            return settings.PLUGINS_DIR
        
        # Otherwise, copy from baked-in plugins to shared host path
        if os.path.exists(source_plugins):
            os.makedirs(shared_dir, exist_ok=True)
            for plugin in os.listdir(source_plugins):
                src = f"{source_plugins}/{plugin}"
                dst = f"{shared_dir}/{plugin}"
                if os.path.isdir(src):
                    os.system(f"cp -rf {src} {dst}")
            logger.info(f"Copied plugins from {source_plugins} to {shared_dir}")
            try:
                os.chmod(shared_dir, 0o777)
            except Exception:
                pass
            return shared_dir
        
        # Fallback: use configured dir (may fail, but log it)
        logger.warning(f"No plugins found at {source_plugins} or {settings.PLUGINS_DIR}")
        return settings.PLUGINS_DIR
    
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
        
        Note: MEMORY.md IS pre-created (empty stub) because AGENTS.md
        instructs the bot to read it on every session start.
        """
        user_dir = self._get_user_data_dir(user_identifier)
        workspace = f"{user_dir}/workspace"
        templates_dir = "/app/templates"
        
        # Pre-create the memory/ directory (AGENTS.md references memory/YYYY-MM-DD.md)
        memory_dir = f"{workspace}/memory"
        os.makedirs(memory_dir, exist_ok=True)
        try:
            os.chmod(memory_dir, 0o777)
        except Exception:
            pass
        
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
        
        # MEMORY.md — empty stub so the bot doesn't get ENOENT on first read.
        # AGENTS.md line 16: "If in MAIN SESSION: Also read MEMORY.md"
        memory_path = f"{workspace}/MEMORY.md"
        if not os.path.exists(memory_path):
            with open(memory_path, 'w') as f:
                f.write("# MEMORY.md\n\n_Your long-term memory. Update this as you learn about your human._\n")
            os.chmod(memory_path, 0o666)
        
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

        # Always ensure Active Connections section in USER.md is up to date (Idempotent update)
        # This runs on EVERY sync/create to reflect the current state of connections
        try:
            if os.path.exists(user_path):
                with open(user_path, 'r') as f:
                    content = f.read()
                
                # Remove existing "Active Connections" section if present to avoid duplication
                if "## Active Connections" in content:
                    content = content.split("## Active Connections")[0].strip()
                
                # Build new connections section with explicit tool instructions
                new_lines = []
                if connections and "google" in connections:
                    new_lines.append("- ✅ **Google Analytics** — Full API access via OAuth.")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js` (no args) to see ALL available commands and examples")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js list-properties` to find property IDs")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js query <propertyId> --dimensions <dims> --metrics <mets> ...` for ANY custom report")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js realtime <propertyId>` for live data")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js list-metrics <propertyId>` to discover all dimensions & metrics")
                    new_lines.append("- ✅ **Google Search Console** — Full API access via OAuth.")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-search-console/index.js` (no args) to see ALL available commands and examples")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-search-console/index.js list-sites` to find site URLs")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-search-console/index.js query <siteUrl> --dimensions <dims> --filters <json> ...` for ANY search analytics report")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-search-console/index.js inspect-url <siteUrl> <url>` for URL index status")
                if connections and "github" in connections:
                    new_lines.append("- ✅ **GitHub** — Authenticated via OAuth. Token is in `OPENCLAW_CONNECTIONS` env var.")
                    new_lines.append("  - You can clone repos, create commits, push code, and manage PRs using git CLI and GitHub API.")
                
                if new_lines:
                    content += "\n\n## Active Connections\n\n"
                    content += "**IMPORTANT:** Always use the actual commands below to fetch real data. NEVER fabricate or hallucinate analytics/search data.\n\n"
                    content += "\n".join(new_lines) + "\n"
                else:
                    content += "\n\n## Active Connections\n\n"
                    content += "_No integrations connected yet. Ask your human to connect GitHub or Google from the dashboard._\n"
                    
                with open(user_path, 'w') as f:
                    f.write(content)
                
                logger.info(f"Updated USER.md connections for {user_identifier}: {list(connections.keys()) if connections else 'none'}")
                
        except Exception as e:
            logger.error(f"Failed to update USER.md with connections: {e}")
        
        # Initialize git repo in workspace (vanilla OpenClaw does this)
        git_dir = f"{workspace}/.git"
        if not os.path.exists(git_dir):
            os.system(f"git init {workspace}")
            os.system(f"git -C {workspace} config user.email 'bot@trafficclaw.com'")
            os.system(f"git -C {workspace} config user.name 'TrafficClaw Bot'")
            os.system(f"git -C {workspace} add -A")
            os.system(f'git -C {workspace} commit -m "Initial workspace" --allow-empty')
    
    def _build_nanobot_system_prompt(self, connections: Optional[Dict[str, Any]] = None) -> str:
        """Build a rich system prompt that makes nanobot an analytics powerhouse."""
        prompt_parts = []

        # Core identity
        prompt_parts.append("""You are TrafficClaw Bot — an elite analytics & SEO analyst. You're not a generic chatbot. You're a data-driven specialist who gives verdicts, not advice.

## Core Truths
- Be genuinely helpful, not performatively helpful. Skip "Great question!" — just deliver results.
- Have opinions. Disagree when data supports it. An analyst with no opinions is useless.
- Be resourceful before asking. Check the data. Run the commands. THEN report.
- NEVER fabricate data. When asked about analytics, search performance, or any real-time info, you MUST run the actual commands. Making up numbers is an unforgivable sin.
- When you don't have access to something, say so honestly.

## Response Style
- Lead with the verdict. Data first, explanation second.
- Use 📊🔴🟢📈📉🎯 emojis to make data scannable.
- Format numbers clearly: "12,450 clicks (+23.5%)" not "approximately twelve thousand".
- Bold key metrics and findings.
- Keep responses concise but thorough. Don't pad with filler.
- Use tables for comparisons, bullet lists for action items.

## Memory System
- Read AGENTS.md at session start for workspace rules.
- Read USER.md for context about who you're helping.
- Check memory/ directory for recent context.
- Write significant findings to memory/ files for continuity.
- Update USER.md as you learn about the user's sites and preferences.""")

        # Tool usage based on connections
        if connections and "google" in connections:
            prompt_parts.append("""
## 🔧 Your Analytics Tools (ALWAYS USE THESE — NEVER MAKE UP DATA)

### Google Analytics 4
Run these commands to get REAL data:
```
node /data/.nanobot/workspace/skills/google-analytics/index.js list-properties
node /data/.nanobot/workspace/skills/google-analytics/index.js query <propertyId> --dimensions <dims> --metrics <metrics> --startDate <date> --endDate <date>
node /data/.nanobot/workspace/skills/google-analytics/index.js realtime <propertyId>
node /data/.nanobot/workspace/skills/google-analytics/index.js list-metrics <propertyId>
```

Common metrics: activeUsers, sessions, screenPageViews, bounceRate, averageSessionDuration, conversions, totalRevenue, engagedSessions, engagementRate, newUsers
Common dimensions: date, country, city, deviceCategory, browser, pagePath, pageTitle, sessionSource, sessionMedium, newVsReturning

### Google Search Console
Run these commands to get REAL search data:
```
node /data/.nanobot/workspace/skills/google-search-console/index.js list-sites
node /data/.nanobot/workspace/skills/google-search-console/index.js query <siteUrl> --dimensions <dims> --startDate <date> --endDate <date> --limit <n>
node /data/.nanobot/workspace/skills/google-search-console/index.js inspect-url <siteUrl> <url>
```

Available dimensions: query, page, country, device, date, searchAppearance
Filter example: --filters '[{"dimension":"query","operator":"contains","expression":"seo"}]'

### Analysis Patterns
When analyzing traffic:
1. First get date-level data for trend analysis (last 30 days)
2. Then get query/page level data for top performers
3. Compare periods: current 30 days vs previous 30 days
4. Calculate % changes for all key metrics

When diagnosing drops:
1. Get daily trend data to identify WHEN the drop started
2. Get query-level data to see WHICH keywords lost traffic
3. Get page-level data to see WHICH pages are affected
4. Get device breakdown to check mobile vs desktop
5. Provide a clear verdict with actionable recommendations""")
        else:
            prompt_parts.append("""
## Connections
No Google Analytics or Search Console connected yet. Ask the user to connect Google from their TrafficClaw dashboard to enable real-time analytics and SEO analysis.""")

        if connections and "github" in connections:
            prompt_parts.append("""
### GitHub
You have GitHub access. Use git CLI and GitHub API for code-related tasks.
Token is available in OPENCLAW_CONNECTIONS environment variable.""")

        return "\n".join(prompt_parts)

    def _seed_nanobot_workspace(self, workspace: str, user_identifier: str, connections: Optional[Dict[str, Any]] = None) -> None:
        """Seed nanobot workspace with intelligence files for analytics mastery."""

        # AGENTS.md — Session behavior for analytics bot
        agents_path = os.path.join(workspace, "AGENTS.md")
        if not os.path.exists(agents_path):
            agents_content = """# AGENTS.md - TrafficClaw Analytics Bot

This workspace is your home. You are an analytics & SEO expert.

## Every Session
1. Read USER.md — know who you're helping and what tools are available
2. Check memory/ for recent context
3. If asked about data — ALWAYS run the actual commands. Never guess.

## Memory
- **Daily notes:** memory/YYYY-MM-DD.md — raw logs of analyses done
- Save important findings (traffic trends, keyword discoveries, site issues)
- Skip secrets unless asked to keep them

## Safety
- Don't fabricate data. Ever. Run the commands.
- Don't run destructive commands without asking.
- When in doubt, ask.

## Analytics Best Practices
- Always compare time periods (current vs previous)
- Look at multiple dimensions (queries, pages, devices, countries)
- Calculate percentage changes for all metrics
- Provide actionable recommendations, not just data dumps
- Lead with the verdict, then show supporting data
"""
            with open(agents_path, 'w') as f:
                f.write(agents_content)
            os.chmod(agents_path, 0o666)

        # USER.md — Personalized with connections
        user_path = os.path.join(workspace, "USER.md")
        user_content = f"""# USER.md - About Your Human

- **User Identifier:** {user_identifier}
- **First Interaction:** {datetime.utcnow().strftime('%Y-%m-%d')}
- **Platform:** TrafficClaw (trafficclaw.com)

## Active Connections

"""
        if connections and "google" in connections:
            user_content += """**IMPORTANT:** Always use the actual commands below to fetch real data. NEVER fabricate or hallucinate analytics/search data.

- ✅ **Google Analytics** — Full API access via OAuth.
  - Run: `node /data/.nanobot/workspace/skills/google-analytics/index.js` (no args) to see ALL available commands
  - Run: `node /data/.nanobot/workspace/skills/google-analytics/index.js list-properties` to find property IDs
  - Run: `node /data/.nanobot/workspace/skills/google-analytics/index.js query <propertyId> --dimensions <dims> --metrics <mets> ...` for ANY custom report
  - Run: `node /data/.nanobot/workspace/skills/google-analytics/index.js realtime <propertyId>` for live data
- ✅ **Google Search Console** — Full API access via OAuth.
  - Run: `node /data/.nanobot/workspace/skills/google-search-console/index.js` (no args) to see ALL available commands
  - Run: `node /data/.nanobot/workspace/skills/google-search-console/index.js list-sites` to find site URLs
  - Run: `node /data/.nanobot/workspace/skills/google-search-console/index.js query <siteUrl> --dimensions <dims> ...` for ANY search report
  - Run: `node /data/.nanobot/workspace/skills/google-search-console/index.js inspect-url <siteUrl> <url>` for URL index status
"""
        else:
            user_content += "_No integrations connected yet. Ask your human to connect Google from the TrafficClaw dashboard._\n"

        if connections and "github" in connections:
            user_content += "- ✅ **GitHub** — Authenticated via OAuth. Use git CLI and GitHub API.\n"

        # Always overwrite USER.md to keep connections fresh
        with open(user_path, 'w') as f:
            f.write(user_content)
        os.chmod(user_path, 0o666)

        # HEARTBEAT.md — Periodic analytics check
        heartbeat_path = os.path.join(workspace, "HEARTBEAT.md")
        if not os.path.exists(heartbeat_path):
            heartbeat_content = """# HEARTBEAT.md - Periodic Tasks

## Analytics Monitoring
- [ ] Check if any site's traffic dropped significantly (>20%) compared to last week
- [ ] Look for new keyword opportunities (rising queries with low CTR)
- [ ] Monitor for crawl errors or indexing issues
"""
            with open(heartbeat_path, 'w') as f:
                f.write(heartbeat_content)
            os.chmod(heartbeat_path, 0o666)

        # MEMORY.md — Empty stub
        memory_path = os.path.join(workspace, "MEMORY.md")
        if not os.path.exists(memory_path):
            with open(memory_path, 'w') as f:
                f.write("# MEMORY.md\n\n_Your long-term memory. Update this as you learn about your human and their sites._\n")
            os.chmod(memory_path, 0o666)

    def _create_user_config(self, user_identifier: str, plan: str, telegram_token: str, custom_rules: Optional[str] = None) -> None:
        """Create OpenClaw config file matching vanilla OpenClaw structure"""
        telegram_token = telegram_token or ""
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
    
    def _create_auth_profiles(self, user_identifier: str, gemini_api_key: str) -> None:
        """Create auth-profiles.json that OpenClaw reads for provider API keys.
        
        OpenClaw's auth system works in two parts:
        1. openclaw.json -> auth.profiles declares profile shape (provider + mode)
        2. agents/<id>/agent/auth-profiles.json stores the actual credentials
        
        Without this file, OpenClaw errors:
        'No API key found for provider "google"'
        """
        user_dir = self._get_user_data_dir(user_identifier)
        agent_dir = f"{user_dir}/.openclaw/agents/main/agent"
        os.makedirs(agent_dir, exist_ok=True)
        
        auth_profiles = {
            "google:default": {
                "provider": "google",
                "mode": "api_key",
                "apiKey": gemini_api_key
            }
        }
        
        auth_path = f"{agent_dir}/auth-profiles.json"
        with open(auth_path, 'w') as f:
            json.dump(auth_profiles, f, indent=2)
        os.chmod(auth_path, 0o666)
        
        logger.info(f"Created auth-profiles.json for {user_identifier}")
    
    def _copy_plugins(self, user_identifier: str, enabled_plugins: list) -> None:
        """Copy enabled plugins to user's workspace"""
        user_dir = self._get_user_data_dir(user_identifier)
        plugins_dir = f"{user_dir}/workspace/plugins"
        os.makedirs(plugins_dir, exist_ok=True)
        
        # Source plugins directory (baked into admin image via Dockerfile)
        source_plugins = "/app/plugins"
        
        for plugin in enabled_plugins:
            src = f"{source_plugins}/{plugin}"
            dst = f"{plugins_dir}/{plugin}"
            if os.path.exists(src):
                # Always re-copy to ensure latest plugin code (force overwrite)
                os.system(f"cp -rf {src} {dst}")
    
    def create_container(
        self,
        user_identifier: str,
        plan: str,
        port: int,
        telegram_token: str,
        gemini_key: Optional[str] = None,
        connections: Optional[Dict[str, Any]] = None, # Generic connections dict
        custom_rules: Optional[str] = None,
        enabled_plugins: Optional[list] = None,
        bot_engine: str = "openclaw"
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
        
        # Create auth-profiles.json with the actual API key
        resolved_gemini_key = gemini_key or settings.GEMINI_API_KEY
        if resolved_gemini_key:
            self._create_auth_profiles(user_identifier, resolved_gemini_key)
        else:
            logger.warning(f"No GEMINI_API_KEY available for {user_identifier} — auth-profiles.json not created")
        
        # Copy plugins
        if enabled_plugins:
            self._copy_plugins(user_identifier, enabled_plugins)
        
        # Fix ownership
        try:
            # Best-effort: if the container runs as UID 1000, this avoids EACCES.
            os.system(f"chown -R 1000:1000 '{user_dir}'")
        except Exception as e:
            logger.warning(f"Could not chown user_dir for {user_identifier}: {e}")
        
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
                skills.append("google-analytics")
                skills.append("google-search-console")
        else:
            # Fallback/Legacy: if no connections passed, assume coding (or none?)
            # But likely we want to defaults to coding if we can't determine
            skills.append("coding")

        if bot_engine == "nanobot":
            nanobot_dir = os.path.join(user_dir, ".nanobot")
            nanobot_workspace = os.path.join(nanobot_dir, "workspace")
            os.makedirs(nanobot_dir, exist_ok=True)
            os.makedirs(nanobot_workspace, exist_ok=True)
            os.makedirs(os.path.join(nanobot_workspace, "memory"), exist_ok=True)
            os.makedirs(os.path.join(nanobot_workspace, "skills"), exist_ok=True)

            # Build rich system prompt
            system_prompt = self._build_nanobot_system_prompt(connections)

            # Seed nanobot workspace with intelligence files
            self._seed_nanobot_workspace(nanobot_workspace, user_identifier, connections)

            # Copy plugins into nanobot workspace/skills
            source_plugins = "/app/plugins"
            nanobot_skills_dir = os.path.join(nanobot_workspace, "skills")
            if connections and "google" in connections:
                for plugin in ["google-analytics", "google-search-console"]:
                    src = f"{source_plugins}/{plugin}"
                    dst = os.path.join(nanobot_skills_dir, plugin)
                    if os.path.exists(src):
                        os.system(f"cp -rf {src} {dst}")

            nanobot_config = {
                "channels": {
                    "telegram": {
                        "enabled": bool(telegram_token),
                        "token": telegram_token or "",
                        "allowFrom": []
                    }
                },
                "providers": {
                    "gemini": {
                        "enabled": True,
                        "apiKey": gemini_key or settings.GEMINI_API_KEY
                    }
                },
                "agents": {
                    "defaults": {
                        "model": "gemini-3-pro-preview",
                        "systemPrompt": system_prompt
                    }
                },
                "tools": {
                    "restrictToWorkspace": False  # Needs shell access for plugins
                }
            }
            with open(os.path.join(nanobot_dir, "config.json"), "w", encoding="utf-8") as f:
                import json
                json.dump(nanobot_config, f, indent=4)

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
        
        # Create container - select image and memory limit based on engine
        image_name = settings.OPENCLAW_IMAGE if bot_engine == "openclaw" else "trafficclaw/nanobot:v4"
        mem_limit_bytes = plan_config["memory_limit"] if bot_engine == "openclaw" else 300 * 1024 * 1024

        # Set up volumes based on the engine
        volumes_config = {
            user_dir: {"bind": "/data", "mode": "rw"}
        }
        
        if bot_engine == "openclaw":
            volumes_config[self._shared_plugins_dir] = {"bind": "/app/skills/workspace", "mode": "rw"}
        else:
            # Mount user plugins AND shared plugins for nanobot
            nanobot_skills_path = f"{user_dir}/.nanobot/workspace/skills"
            os.makedirs(nanobot_skills_path, exist_ok=True)
            volumes_config[nanobot_skills_path] = {"bind": "/data/.nanobot/workspace/skills", "mode": "rw"}

        try:
            container = self.client.containers.run(
                image_name,
                name=container_name,
                detach=True,
                restart_policy={"Name": "on-failure", "MaximumRetryCount": 3},
                ports={"18790/tcp": port} if bot_engine == "nanobot" else {"8080/tcp": port},
                volumes=volumes_config,
                environment=env,
                mem_limit=mem_limit_bytes,
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
    
    def sync_container(
        self,
        user_identifier: str,
        plan: str,
        port: int,
        telegram_token: str,
        gemini_key: Optional[str] = None,
        connections: Optional[Dict[str, Any]] = None,
        custom_rules: Optional[str] = None,
        enabled_plugins: Optional[list] = None,
        bot_engine: str = "openclaw"
    ) -> Dict[str, Any]:
        """
        Recreate container with updated credentials (preserves user data).
        Docker containers cannot update env vars at runtime, so we must
        stop → delete → recreate to inject new provider tokens.
        """
        logger.info(f"Syncing container for {user_identifier} with connections: {list(connections.keys()) if connections else 'none'}")
        
        # Stop and delete existing container (keep /data volume)
        self.stop_container(user_identifier)
        self.delete_container(user_identifier, remove_data=False)
        
        # Recreate with updated connections/env vars
        return self.create_container(
            user_identifier=user_identifier,
            plan=plan,
            port=port,
            telegram_token=telegram_token,
            gemini_key=gemini_key,
            connections=connections,
            custom_rules=custom_rules,
            enabled_plugins=enabled_plugins,
            bot_engine=bot_engine
        )

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
            # Retrieve basic attributes first to check status
            status = container.attrs.get("State", {}).get("Status", "unknown")

            # Initialize stats
            mem_usage = 0
            mem_percent = 0

            # Only fetch stats if running to avoid overhead/errors
            if status == "running":
                try:
                    stats = container.stats(stream=False)
                    mem_usage = stats["memory_stats"].get("usage", 0)
                    mem_limit = stats["memory_stats"].get("limit", 1)
                    mem_percent = (mem_usage / mem_limit) * 100 if mem_limit > 0 else 0
                except Exception:
                    pass
            
            # Get health status
            health = container.attrs.get("State", {}).get("Health", {})
            health_status = health.get("Status", "unknown")
            
            # Parse logs for Telegram status
            logs = ""
            try:
                # Catch more logs to diagnose immediate crashes
                logs = container.logs(tail=200).decode('utf-8')
            except:
                pass

            # If the container crashed, aggressively log it into the health check
            if status in ["exited", "restarting", "created", "dead"]:
                # Expose the last lines of the log in the telegram_status field or a new error field
                return {
                    "success": True,
                    "status": status,
                    "health": "unknown",
                    "error": logs[-500:] if logs else "No logs available. Container crashed silently.",
                    "telegram_status": "error"
                }

            telegram_status = "initializing"
            bot_username = None
            
            # Simple log parsing logic
            logs_lower = logs.lower()
            has_errors = "error" in logs_lower and "telegram" in logs_lower
            
            # 1. Critical: Check for webhook conflicts (409)
            if ("error" in logs_lower and "telegram" in logs_lower) and ("409" in logs_lower or "conflict" in logs_lower):
                telegram_status = "webhook_conflict"
            
            # 2. Trust Healthcheck (if container is healthy, it's connected)
            elif health_status == "healthy":
                telegram_status = "connected"

            # 3. Check for specific success keywords in logs
            elif any(s in logs_lower for s in ["logged in as", "bot started", "polling", "telegram connected", "launching", "started", "running", "ready", "listening"]):
                 telegram_status = "connected"

            # 4. Fallback: Generic error (only if NOT healthy and has explicit error)
            elif "error" in logs_lower and "telegram" in logs_lower:
                telegram_status = "error"

            elif container.status == "running":
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
                elif ports and "18790/tcp" in ports and ports["18790/tcp"]:
                    host_port = int(ports["18790/tcp"][0]["HostPort"])
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