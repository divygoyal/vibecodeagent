"""
Docker Container Manager
Handles creation, management, and monitoring of user containers
"""
import docker
import os
import json
import logging
import shutil
import subprocess
from typing import Optional, Dict, Any
from config import settings, PLANS
from datetime import datetime, timedelta

# Setup logger
logger = logging.getLogger(__name__)

class DockerManager:
    """Manages Docker containers for user ClawBots"""
    
    def __init__(self):
        self._docker_available = False
        try:
            self.client = docker.from_env()
            self._docker_available = True
        except docker.errors.DockerException as e:
            logger.warning(f"Docker is not available: {e}. Running in stub mode (API will start but container operations will be no-ops).")
            self.client = None
        self.base_dir = settings.DATA_DIR  # Host path for user data
        if self._docker_available:
            self._shared_plugins_dir = self._ensure_shared_plugins()
            self._nanobot_build_event = self._start_nanobot_build()
        else:
            self._shared_plugins_dir = settings.PLUGINS_DIR
            self._nanobot_build_event = None

    def _get_container_name(self, user_identifier: str) -> str:
        """Generate unique container name"""
        return f"{settings.CONTAINER_PREFIX}_{user_identifier}"

    def _get_llm_key(self, user_key: Optional[str] = None) -> str:
        """Resolve the per-user key, shared Vertex key, or legacy Gemini key."""
        return user_key or settings.GOOGLE_VERTEX_API_KEY or settings.GEMINI_API_KEY or ""

    def _get_genai_model(self) -> str:
        return settings.GOOGLE_GENAI_MODEL or "gemini-3.5-flash"

    def _get_genai_fallback_model(self) -> str:
        return settings.GOOGLE_GENAI_FALLBACK_MODEL or "gemini-3-flash-preview"

    def _get_openclaw_model(self) -> str:
        return f"google/{self._get_genai_model()}"

    def _get_nanobot_model(self) -> str:
        return f"vertex_ai/{self._get_genai_model()}"

    def _get_nanobot_fallback_models(self) -> str:
        return ",".join([
            self._get_nanobot_model(),
            f"vertex_ai/{self._get_genai_fallback_model()}",
            "vertex_ai/gemini-2.5-flash",
        ])

    def _start_nanobot_build(self):
        """Kick off nanobot image build in background thread. Returns an Event that is set when done."""
        import threading
        tag = "trafficclaw/nanobot:v13"
        done_event = threading.Event()
        try:
            self.client.images.get(tag)
            logger.info(f"Nanobot image {tag} already exists")
            done_event.set()
            return done_event
        except docker.errors.ImageNotFound:
            logger.info(f"Image {tag} not found — building in background...")
            self._nanobot_build_error = None

            def build_image():
                build_dir = "/app/nanobot-build"
                try:
                    for line in self.client.api.build(
                        path=build_dir,
                        dockerfile="Dockerfile.nanobot",
                        tag=tag,
                        rm=True,
                        decode=True,
                    ):
                        if 'stream' in line and line['stream'].strip():
                            print(f"[BUILDER] {line['stream'].strip()}")
                    logger.info(f"Successfully built {tag}!")
                except Exception as e:
                    logger.error(f"Failed to build nanobot image: {e}")
                    self._nanobot_build_error = e
                finally:
                    done_event.set()

            threading.Thread(target=build_image, daemon=True).start()
            return done_event

    def _ensure_nanobot_image(self) -> None:
        """Wait for the background nanobot build to finish. Raises if build failed."""
        tag = "trafficclaw/nanobot:v13"
        # Quick check — image may already exist
        try:
            self.client.images.get(tag)
            return
        except docker.errors.ImageNotFound:
            pass
        logger.info("Waiting for nanobot image build to complete...")
        self._nanobot_build_event.wait(timeout=300)
        if getattr(self, '_nanobot_build_error', None):
            raise RuntimeError(f"Nanobot image build failed: {self._nanobot_build_error}")
        # Final check
        self.client.images.get(tag)

    def _get_user_data_dir(self, user_identifier: str) -> str:
        """Get host path for user's data directory"""
        return f"{self.base_dir}/{user_identifier}"

    def _get_safe_user_data_dir(self, user_identifier: str) -> str:
        """Resolve a user's data dir and ensure cleanup stays inside DATA_DIR."""
        if not str(user_identifier or "").strip():
            raise RuntimeError("Refusing to resolve an empty user data directory")

        base_dir = os.path.realpath(self.base_dir)
        user_dir = os.path.realpath(self._get_user_data_dir(user_identifier))
        try:
            is_inside_base = os.path.commonpath([base_dir, user_dir]) == base_dir
        except ValueError:
            is_inside_base = False

        if not is_inside_base or user_dir == base_dir:
            raise RuntimeError(f"Refusing unsafe user data path: {user_dir}")
        return user_dir

    def _remove_user_data_dir(self, user_identifier: str) -> bool:
        """Remove all persisted workspace/runtime data for a user."""
        user_dir = self._get_safe_user_data_dir(user_identifier)
        if not os.path.exists(user_dir):
            return False
        shutil.rmtree(user_dir)
        return True

    def _reset_nanobot_runtime(self, user_identifier: str) -> bool:
        """Clear Nanobot runtime/config memory while preserving the main workspace."""
        user_dir = self._get_safe_user_data_dir(user_identifier)
        nanobot_dir = os.path.realpath(os.path.join(user_dir, ".nanobot"))
        try:
            is_inside_user_dir = os.path.commonpath([user_dir, nanobot_dir]) == user_dir
        except ValueError:
            is_inside_user_dir = False

        if not is_inside_user_dir or nanobot_dir == user_dir:
            raise RuntimeError(f"Refusing unsafe nanobot runtime path: {nanobot_dir}")

        if not os.path.exists(nanobot_dir):
            return False
        shutil.rmtree(nanobot_dir)
        return True

    def _get_admin_network_info(self):
        """Return (network_name, admin_ip) for the running admin-api container.

        Coolify gives containers random hash names so name-based lookup misses
        them. Instead we identify admin-api as *ourselves*: this code runs
        inside admin-api, so /proc/self/cgroup or the hostname resolves to
        admin's own container ID, which gives us its network attachment
        directly.

        Per-user clawbot containers default to the docker bridge and can't
        resolve `admin-api` over Coolify's project network, which breaks the
        multi-tenant plugin's call back to the admin API. Pinning both the
        target network and admin's IP lets token fetches work regardless of
        how Coolify wires up DNS aliases for that network.
        """
        candidate_ids = []

        # Primary: read our container ID from /proc/self/cgroup. Works on
        # cgroup v1 (lines like `12:cpu:/docker/<id>`) and v2 (`0::/docker/<id>`
        # or `0::/system.slice/docker-<id>.scope`).
        try:
            with open("/proc/self/cgroup", "r") as fh:
                for line in fh:
                    line = line.strip()
                    for chunk in line.split("/"):
                        for piece in chunk.split("-"):
                            piece = piece.replace(".scope", "")
                            if len(piece) >= 12 and all(c in "0123456789abcdef" for c in piece.lower()):
                                candidate_ids.append(piece)
        except Exception:
            pass

        # Secondary: hostname is the short container ID by default.
        try:
            import socket
            hn = socket.gethostname().strip()
            if hn and len(hn) >= 12:
                candidate_ids.append(hn)
        except Exception:
            pass

        for cid in candidate_ids:
            try:
                container = self.client.containers.get(cid)
            except Exception:
                continue
            networks = container.attrs.get("NetworkSettings", {}).get("Networks", {})
            for net_name, net_info in networks.items():
                ip = (net_info or {}).get("IPAddress")
                if ip:
                    return net_name, ip

        # Tertiary fallback: scan containers for compose-service or coolify
        # labels matching admin-api. Won't help on Coolify-hash names but is
        # cheap insurance for non-Coolify deploys.
        try:
            for c in self.client.containers.list():
                labels = c.labels or {}
                name = (c.name or "").lower()
                is_admin = (
                    labels.get("com.docker.compose.service") == "admin-api"
                    or ("admin" in name and "clawbot" not in name)
                    or labels.get("coolify.name", "").lower().startswith("trafficclaw-admin")
                )
                if not is_admin:
                    continue
                networks = c.attrs.get("NetworkSettings", {}).get("Networks", {})
                for net_name, net_info in networks.items():
                    ip = (net_info or {}).get("IPAddress")
                    if ip:
                        return net_name, ip
        except Exception as e:
            logger.warning(f"_get_admin_network_info scan failed: {e}")

        return None, None
    
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
            # 0o755: containers access via chown (see create_container); world-execute lets
            # non-owner processes traverse the directory tree without full write access.
            os.chmod(user_dir, 0o755)
            os.chmod(f"{user_dir}/workspace", 0o755)
            os.chmod(f"{user_dir}/.openclaw", 0o755)
        except Exception as e:
            logger.warning(f"Could not chmod user_dir for {user_identifier}: {e}")
            # Best-effort fallback — use list args to avoid shell injection
            subprocess.run(["chmod", "-R", "755", user_dir], check=False, capture_output=True)
        
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
                    if os.path.exists(dst):
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
            logger.info(f"Copied plugins from {source_plugins} to {shared_dir}")
            try:
                os.chmod(shared_dir, 0o755)
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
            os.chmod(memory_dir, 0o755)
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
                    new_lines.append("  - Tokens are injected through `OPENCLAW_CONNECTIONS`; do not use `--client-id` for this user's own Google data.")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js list-properties` to find property IDs")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js query <propertyId> --dimensions <dims> --metrics <mets> ...` for ANY custom report")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js realtime <propertyId>` for live data")
                    new_lines.append("  - Run: `node /app/skills/workspace/google-analytics/index.js list-metrics <propertyId>` to discover all dimensions & metrics")
                    new_lines.append("- ✅ **Google Search Console** — Full API access via OAuth.")
                    new_lines.append("  - Tokens are injected through `OPENCLAW_CONNECTIONS`; do not use `--client-id` for this user's own Google data.")
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
                    content += (
                        "_No integrations were injected through OPENCLAW_CONNECTIONS yet. "
                        "For Google Analytics/Search Console, run the plain tool command first and report the actual command error if auth fails._\n"
                    )
                    
                with open(user_path, 'w') as f:
                    f.write(content)
                
                logger.info(f"Updated USER.md connections for {user_identifier}: {list(connections.keys()) if connections else 'none'}")
                
        except Exception as e:
            logger.error(f"Failed to update USER.md with connections: {e}")
        
        # Initialize git repo in workspace (vanilla OpenClaw does this)
        git_dir = f"{workspace}/.git"
        if not os.path.exists(git_dir):
            subprocess.run(["git", "init", workspace], check=False, capture_output=True)
            subprocess.run(["git", "-C", workspace, "config", "user.email", "bot@trafficclaw.com"], check=False, capture_output=True)
            subprocess.run(["git", "-C", workspace, "config", "user.name", "TrafficClaw Bot"], check=False, capture_output=True)
            subprocess.run(["git", "-C", workspace, "add", "-A"], check=False, capture_output=True)
            subprocess.run(["git", "-C", workspace, "commit", "-m", "Initial workspace", "--allow-empty"], check=False, capture_output=True)
    
    def _build_nanobot_system_prompt(self, user_identifier: str, connections: Optional[Dict[str, Any]] = None) -> str:
        """Build a lean system prompt optimized for fast responses."""
        prompt_parts = []
        today = datetime.utcnow().date()
        yesterday = today - timedelta(days=1)

        # Core identity — keep it SHORT
        prompt_parts.append(f"""You are TrafficClaw Bot — an expert SEO & analytics assistant. You give data-driven verdicts, not generic advice.

Current date: {today.isoformat()}.
When the user says "yesterday", use startDate={yesterday.isoformat()} and endDate={yesterday.isoformat()}.

## SPEED RULES (CRITICAL)
1. For direct traffic requests, use the one-shot GA traffic-summary command. Do NOT read memory/SITES.md first for those requests.
2. For greetings (hi, hello, hey) — respond directly WITHOUT running any tools.
3. Run the MINIMUM commands needed. One query is better than three.
4. Don't narrate what you're about to do. Just DO IT and report results directly.
5. Cache new property IDs and site URLs to memory/SITES.md only after successful discovery when it does not delay the answer.
6. NEVER explore directories, check package.json, or verify skill paths. The commands below are PRE-INSTALLED and GUARANTEED to work.
7. Combine data in a SINGLE response. Don't send partial results then follow up — gather everything first, then respond once.

## TOOL CALLING RULES (CRITICAL)
- Tools are shell commands. Execute them using your shell/exec capability.
- The commands are Node.js scripts. Run them exactly as shown with `node /data/.nanobot/workspace/skills/...`
- For this user's own Google Analytics/Search Console data, DO NOT use `--client-id`. OAuth tokens are injected through `OPENCLAW_CONNECTIONS`, and the scripts load them automatically.
- NEVER use `--client-id` in Nanobot Telegram mode. Internal admin API token lookup is disabled in this sandbox.
- NEVER refuse Google Analytics/Search Console work just because `OPENCLAW_CONNECTIONS` looks missing. Run the plain command first and report the actual command error if auth fails.
- NEVER say "I can't find the module" or "skill not found". The scripts are pre-installed and WILL work.
- NEVER try alternative paths like `python3 -m skills...` — always use the exact `node` commands listed below.
- NEVER run `ls`, `cat package.json`, or `find` to verify skill paths — they are GUARANTEED correct.
- If a command fails, report the actual error. Don't retry with made-up alternative commands.
- If one Google command fails with auth/config/path errors, STOP tool-calling and answer with that exact error.
- BUDGET: You have a LIMITED number of tool calls per conversation. Use them wisely — every wasted call counts.

## DIRECT TRAFFIC QUERY FLOW
- For "traffic", "users", "sessions", or "pageviews", use Google Analytics only. Do NOT call Search Console unless the user asks about SEO/search/queries/rankings.
- For direct traffic requests, run exactly ONE command: `node /data/.nanobot/workspace/skills/google-analytics/index.js traffic-summary <site-or-domain-from-user> --startDate <date> --endDate <date>`.
- For "total traffic yesterday", use `--startDate {yesterday.isoformat()} --endDate {yesterday.isoformat()}`.
- For "last 7 days traffic", use the exact 7-day range ending today.
- Do not call list-properties first; traffic-summary resolves the matching GA4 property internally.
- Do not spend tool calls writing memory for traffic-summary requests; answer first.

## Rules
- NEVER fabricate data. Always run actual commands. Say "I don't have access" rather than guessing.
- Lead with the verdict: "Traffic dropped 23% WoW" not "Let me check your analytics."
- Bold **key metrics**. Use 📊🔴🟢📈📉🎯 sparingly. Short paragraphs for Telegram readability.
- End with 🎯 **Action Items** when recommending changes.
- Default: last 7 days for quick checks, last 28 days for deep analysis.""")

        # Tool commands — compact format. Always expose Google tools; auth is
        # resolved from OPENCLAW_CONNECTIONS first, with admin lookup only as a fallback.
        prompt_parts.append("""
## Tools — EXACT commands to run (copy-paste, don't modify paths)

### Google Analytics 4
Base command: `node /data/.nanobot/workspace/skills/google-analytics/index.js`

Examples:
```
node /data/.nanobot/workspace/skills/google-analytics/index.js traffic-summary <site-or-domain> --startDate YYYY-MM-DD --endDate YYYY-MM-DD
node /data/.nanobot/workspace/skills/google-analytics/index.js list-properties
node /data/.nanobot/workspace/skills/google-analytics/index.js query 123456789 --dimensions date --metrics activeUsers,sessions,screenPageViews --startDate 2026-02-26 --endDate 2026-03-05
node /data/.nanobot/workspace/skills/google-analytics/index.js realtime 123456789
```
Metrics: activeUsers, sessions, screenPageViews, bounceRate, averageSessionDuration, engagementRate, newUsers, conversions
Dimensions: date, country, deviceCategory, pagePath, sessionSource, sessionMedium, browser, landingPage

### Google Search Console
Base command: `node /data/.nanobot/workspace/skills/google-search-console/index.js`

Examples:
```
node /data/.nanobot/workspace/skills/google-search-console/index.js list-sites
node /data/.nanobot/workspace/skills/google-search-console/index.js query https://example.com --dimensions query,page --startDate 2026-02-26 --endDate 2026-03-05 --limit 25
node /data/.nanobot/workspace/skills/google-search-console/index.js inspect-url https://example.com https://example.com/page
```
Dimensions: query, page, country, device, date
Filters: `--filters '[{"dimension":"query","operator":"contains","expression":"keyword"}]'`

## Analysis Tips
- Compare periods with % change: ((new-old)/old)×100
- Traffic drops: check date trend → keyword-level → page-level
- Default --limit 25, increase only if needed""")

        if connections and "github" in connections:
            prompt_parts.append("""
**GitHub:** Authenticated. Use git CLI. Token in OPENCLAW_CONNECTIONS env var.""")

        return "\n".join(prompt_parts).replace("__CLIENT_ID__", user_identifier)

    def _seed_nanobot_workspace(self, workspace: str, user_identifier: str, connections: Optional[Dict[str, Any]] = None) -> None:
        """Seed nanobot workspace with intelligence files for analytics mastery."""

        # SOUL.md — Lean identity file (system prompt has the full instructions)
        soul_path = os.path.join(workspace, "SOUL.md")
        soul_content = """# SOUL.md

You are **TrafficClaw Bot** — an expert SEO & analytics assistant on Telegram.

- NEVER fabricate data. Run actual commands. Say "I don't have access" if you can't.
- Lead with the verdict, not the process. Be direct and insightful.
- Have opinions. Push back with data when you see problems.
- For direct traffic requests, use google-analytics traffic-summary first.
- Check memory/SITES.md before manual list-properties or list-sites discovery.
- Bold **key metrics**. Use emojis for visual structure. Short paragraphs for Telegram.
- End with 🎯 **Action Items** when recommending changes.
"""
        with open(soul_path, 'w') as f:
            f.write(soul_content)
        os.chmod(soul_path, 0o666)

        # AGENTS.md — Lean session behavior (system prompt has the full instructions)
        agents_path = os.path.join(workspace, "AGENTS.md")
        agents_content = f"""# AGENTS.md

## Session Start
1. For direct traffic requests, use google-analytics traffic-summary and skip memory reads.
2. For manual GA/GSC discovery, read memory/SITES.md for cached property IDs and site URLs.

## Speed Rules
- For greetings — respond directly, no tool calls needed
- Cache property IDs / site URLs to memory/SITES.md after first discovery
- Run the minimum commands needed to answer the question
- Direct traffic requests should use one command: google-analytics traffic-summary
- Use plain Google Analytics/Search Console commands first; tokens load from OPENCLAW_CONNECTIONS
- Default: last 7 days for quick checks, last 28 days for deep analysis

## Memory
- **memory/SITES.md** — Cached GA4 property IDs and GSC site URLs for manual discovery
- **memory/YYYY-MM-DD.md** — Daily analysis logs (save important findings)
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
            user_content += f"""- ✅ **Google Analytics 4** — Full API access via OAuth
- ✅ **Google Search Console** — Full API access via OAuth
- 🔑 Use plain Google Analytics/Search Console commands first; tokens load from OPENCLAW_CONNECTIONS
- ⚡ Use google-analytics traffic-summary for direct traffic requests; use memory/SITES.md for manual discovery
"""
        else:
            user_content += """- 🔑 Google Analytics/Search Console commands should run plain first. If tokens are missing, ask the user to reconnect Google in the dashboard.
- Do not assume Google is unavailable because `OPENCLAW_CONNECTIONS` is empty. Run the plain command first and report the actual command error if auth fails.
"""

        if connections and "github" in connections:
            user_content += "- ✅ **GitHub** — Authenticated via OAuth. Use git CLI and GitHub API.\n"

        # Always overwrite USER.md to keep connections fresh
        with open(user_path, 'w') as f:
            f.write(user_content)
        os.chmod(user_path, 0o666)

        # HEARTBEAT.md — Keep empty to skip nanobot's 30-min heartbeat API calls
        heartbeat_path = os.path.join(workspace, "HEARTBEAT.md")
        if not os.path.exists(heartbeat_path):
            heartbeat_content = """# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.
# Add tasks below when you want the agent to check something periodically.
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

        # SITES.md — Cache for property IDs and site URLs (speeds up repeated queries)
        sites_path = os.path.join(workspace, "memory", "SITES.md")
        if not os.path.exists(sites_path):
            with open(sites_path, 'w') as f:
                f.write(f"# SITES.md — Cached Property IDs & Site URLs\n\n"
                        "⚡ Use traffic-summary for direct traffic questions. Check here before manual list-properties or list-sites discovery.\n\n"
                        "🔑 Google tool commands should run plain first; OPENCLAW_CONNECTIONS supplies tokens when Google is connected.\n\n"
                        "## GA4 Properties\nNo cached GA4 properties yet.\n\n"
                        "## GSC Sites\nNo cached GSC sites yet.\n")
            os.chmod(sites_path, 0o666)

    def _create_user_config(self, user_identifier: str, plan: str, telegram_token: str, custom_rules: Optional[str] = None) -> None:
        """Create OpenClaw config file matching vanilla OpenClaw structure"""
        telegram_token = telegram_token or ""
        user_dir = self._get_user_data_dir(user_identifier)
        config_path = f"{user_dir}/.openclaw/openclaw.json"
        
        # Generate gateway auth token
        import secrets
        gateway_token = secrets.token_hex(24)
        openclaw_model = self._get_openclaw_model()
        
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
                        "primary": openclaw_model
                    },
                    "models": {
                        openclaw_model: {
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
                if os.path.exists(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
    
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

        if bot_engine == "nanobot":
            try:
                if self._reset_nanobot_runtime(user_identifier):
                    logger.info(f"Cleared stale Nanobot runtime for {user_identifier}")
            except Exception as e:
                logger.error(f"Failed to reset Nanobot runtime for {user_identifier}: {e}")
                return {"success": False, "error": f"Failed to reset Nanobot runtime: {e}"}
        
        # Seed intelligence files
        self._seed_intelligence(user_identifier, custom_rules, connections)
        
        # Create config
        self._create_user_config(user_identifier, plan, telegram_token, custom_rules)
        
        # Create auth-profiles.json with the actual LLM API key
        resolved_llm_key = self._get_llm_key(gemini_key)
        if resolved_llm_key:
            self._create_auth_profiles(user_identifier, resolved_llm_key)
        else:
            logger.warning(f"No Google Gen AI key available for {user_identifier} — auth-profiles.json not created")
        
        # Copy plugins
        if enabled_plugins:
            self._copy_plugins(user_identifier, enabled_plugins)
        
        # Fix ownership
        try:
            # Best-effort: if the container runs as UID 1000, this avoids EACCES.
            subprocess.run(["chown", "-R", "1000:1000", user_dir], check=False, capture_output=True)
        except Exception as e:
            logger.warning(f"Could not chown user_dir for {user_identifier}: {e}")
        
        # Environment variables
        heap_sizes = {"free": "768", "starter": "1536", "growth": "2048", "pro": "3584"}
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
            for skill in ["google-analytics", "google-search-console"]:
                if skill not in skills:
                    skills.append(skill)

        if bot_engine == "nanobot":
            nanobot_dir = os.path.join(user_dir, ".nanobot")
            nanobot_workspace = os.path.join(nanobot_dir, "workspace")
            os.makedirs(nanobot_dir, exist_ok=True)
            os.makedirs(nanobot_workspace, exist_ok=True)
            os.makedirs(os.path.join(nanobot_workspace, "memory"), exist_ok=True)
            os.makedirs(os.path.join(nanobot_workspace, "skills"), exist_ok=True)

            # Build rich system prompt
            system_prompt = self._build_nanobot_system_prompt(user_identifier, connections)

            # Seed nanobot workspace with intelligence files
            self._seed_nanobot_workspace(nanobot_workspace, user_identifier, connections)

            # Copy plugins into nanobot workspace/skills
            source_plugins = "/app/plugins"
            nanobot_skills_dir = os.path.join(nanobot_workspace, "skills")
            for plugin in ["google-analytics", "google-search-console"]:
                src = f"{source_plugins}/{plugin}"
                dst = os.path.join(nanobot_skills_dir, plugin)
                if os.path.exists(src):
                    if os.path.exists(dst):
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)

            nanobot_config = {
                "channels": {
                    "telegram": {
                        "enabled": bool(telegram_token),
                        "token": telegram_token or "",
                        "allowFrom": ["*"]
                    }
                },
                "providers": {
                    "vertex_ai": {
                        "enabled": True,
                        "apiKey": resolved_llm_key,
                        "project": settings.GOOGLE_CLOUD_PROJECT or "",
                        "location": settings.GOOGLE_CLOUD_LOCATION or "global"
                    },
                    "gemini": {
                        "enabled": True,
                        "apiKey": resolved_llm_key
                    }
                },
                "agents": {
                    "defaults": {
                        "model": self._get_nanobot_model(),
                        "systemPrompt": system_prompt,
                        "max_tokens": 4096,
                        "temperature": 1.0,
                        "max_tool_iterations": 30,
                        "request_timeout": 30
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
            "GOOGLE_VERTEX_API_KEY": resolved_llm_key,
            "VERTEX_API_KEY": resolved_llm_key,
            "VERTEXAI_API_KEY": resolved_llm_key,
            "GOOGLE_API_KEY": resolved_llm_key,
            "GEMINI_API_KEY": resolved_llm_key,
            "GOOGLE_GENAI_USE_VERTEXAI": "true",
            "GOOGLE_GENAI_MODEL": self._get_genai_model(),
            "GOOGLE_GENAI_FALLBACK_MODEL": self._get_genai_fallback_model(),
            "GOOGLE_CLOUD_PROJECT": settings.GOOGLE_CLOUD_PROJECT or "",
            "GOOGLE_CLOUD_LOCATION": settings.GOOGLE_CLOUD_LOCATION or "global",
            "VERTEXAI_PROJECT": settings.GOOGLE_CLOUD_PROJECT or "",
            "VERTEXAI_LOCATION": settings.GOOGLE_CLOUD_LOCATION or "global",
            "OPENCLAW_MODEL": self._get_openclaw_model(),
            # LLM fallback config — retry primary once, then fall back through Vertex models
            "NANOBOT_FALLBACK_MODELS": self._get_nanobot_fallback_models(),
            "NANOBOT_RETRY_COUNT": "1",
            "NANOBOT_RETRY_DELAY": "1.0",
            "NANOBOT_REQUEST_TIMEOUT": "30",
            # User identification
            "USER_IDENTIFIER": user_identifier,
            "PLAN": plan,
            # Node.js memory
            "NODE_OPTIONS": f"--max-old-space-size={node_heap}",
            # Generic Connections
            "OPENCLAW_CONNECTIONS": connections_json,
            "DISABLE_ADMIN_TOKEN_LOOKUP": "true" if bot_engine == "nanobot" else "false",
            # OAuth Keys (Required for refresh token flow)
            "GOOGLE_CLIENT_ID": settings.GOOGLE_CLIENT_ID or "",
            "GOOGLE_CLIENT_SECRET": settings.GOOGLE_CLIENT_SECRET or "",
            # Admin API access — lets multi-tenant plugin commands like
            # `--client-id <github_id>` fetch that client's stored OAuth tokens
            # at runtime instead of using this container's baked-in tokens.
            # The URL is rewritten below to the admin container's IP on
            # whichever docker network admin-api is on, since per-user clawbot
            # containers default to the bridge network and cannot resolve the
            # `admin-api` hostname registered in the Coolify-managed network.
            "ADMIN_API_URL": "http://admin-api:8000",
            "ADMIN_API_KEY": settings.ADMIN_API_KEY or "",
        }

        # Detect the network admin-api is reachable on so the new container
        # can call back to it. We attach the new container to that same network
        # AND override ADMIN_API_URL with admin's IP so DNS-alias quirks across
        # Coolify versions don't matter.
        admin_network, admin_ip = self._get_admin_network_info()
        if admin_ip:
            env["ADMIN_API_URL"] = f"http://{admin_ip}:8000"
            logger.info(f"Detected admin-api at {admin_ip} on network {admin_network}; new container will join that network.")
        else:
            logger.warning("Could not detect admin-api network; --client-id mode will fail with 'fetch failed' from inside this container.")
        
        # Legacy compat: maintain GITHUB_TOKEN/ID env vars if present in connections
        if connections and "github" in connections:
             env["GITHUB_TOKEN"] = connections["github"].get("access_token", "")
             env["GITHUB_ID"] = connections["github"].get("provider_account_id", user_identifier)
        else:
             env["GITHUB_ID"] = user_identifier
        
        # Create container - select image and memory limit based on engine
        if bot_engine != "openclaw":
            self._ensure_nanobot_image()
        image_name = settings.OPENCLAW_IMAGE if bot_engine == "openclaw" else "trafficclaw/nanobot:v13"
        mem_limit_bytes = plan_config["memory_limit"] if bot_engine == "openclaw" else 400 * 1024 * 1024

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
            run_kwargs = dict(
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
            if admin_network:
                run_kwargs["network"] = admin_network
            container = self.client.containers.run(image_name, **run_kwargs)
            
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
        container_removed = False
        data_removed = False

        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=5)
            container.remove()
            container_removed = True
        except docker.errors.NotFound:
            if not remove_data:
                return {"success": False, "error": "Container not found"}
        except docker.errors.APIError as e:
            return {"success": False, "error": str(e)}

        if remove_data:
            try:
                data_removed = self._remove_user_data_dir(user_identifier)
            except Exception as e:
                return {"success": False, "error": f"Failed to remove user data: {e}"}

        return {
            "success": True,
            "status": "deleted",
            "container_removed": container_removed,
            "data_removed": data_removed
        }
    
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
                "gemini_api_key": env.get("GOOGLE_VERTEX_API_KEY") or env.get("GEMINI_API_KEY"),
                "github_token": env.get("GITHUB_TOKEN"),
                "custom_rules": None,
                "created_at": created_at
            }
        except Exception as e:
            print(f"Error inspecting container {container_name}: {e}")
            return None


# Singleton instance
docker_manager = DockerManager()
