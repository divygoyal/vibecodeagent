#!/usr/bin/env python3
"""
VibeCode Agent - User Provisioning Script
Optimized for token-efficient OpenClaw deployments
"""

import json
import os
import sys
import subprocess
import shutil
from pathlib import Path

# Configuration
USER_DATA_ROOT = "/home/ubuntu/vibecode/users"
CONFIG_ROOT = "/home/ubuntu/vibecode/config"
BASE_PORT = 8081
DOCKER_IMAGE = "coollabsio/openclaw:latest"

# Token optimization defaults
TOKEN_CONFIG = {
    "contextTokens": 32000,
    "maxInputTokens": 8000,
    "compaction": "aggressive",
    "heartbeatEnabled": False,
    "heartbeatInterval": "60m",
    "defaultModel": "gemini-2.0-flash"
}

def get_next_port():
    """Finds the next available port starting from 8081."""
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Ports}}"], 
            capture_output=True, text=True
        )
        ports_in_use = set()
        for line in result.stdout.splitlines():
            if ":" in line and "->" in line:
                try:
                    port = int(line.split(":")[1].split("->")[0])
                    ports_in_use.add(port)
                except (IndexError, ValueError):
                    continue
        
        current_port = BASE_PORT
        while current_port in ports_in_use:
            current_port += 1
        return current_port
    except Exception:
        return BASE_PORT

def setup_user_config(user_dir: str, user_id: str):
    """
    Copy optimized OpenClaw config files to user workspace.
    This includes token-efficient SOUL, IDENTITY, and settings.
    """
    openclaw_dir = os.path.join(user_dir, ".openclaw")
    workspace_dir = os.path.join(user_dir, "workspace")
    
    os.makedirs(openclaw_dir, exist_ok=True)
    os.makedirs(workspace_dir, exist_ok=True)
    
    # Copy optimized config files if they exist
    config_files = ["openclaw.json", "SOUL.md", "IDENTITY.md", "HEARTBEAT.md"]
    for config_file in config_files:
        src = os.path.join(CONFIG_ROOT, config_file)
        dst = os.path.join(openclaw_dir, config_file)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)
    
    # Create user-specific MEMORY.md with minimal footprint
    memory_file = os.path.join(openclaw_dir, "MEMORY.md")
    if not os.path.exists(memory_file):
        with open(memory_file, "w") as f:
            f.write(f"""# Memory
## User
- ID: {user_id}
- Created: {subprocess.check_output(['date', '+%Y-%m-%d']).decode().strip()}

## Preferences
- Token-efficient responses preferred
- Concise over verbose
""")

def provision_user(github_id, telegram_token=None, github_token=None, api_key=None):
    """
    Spins up a completely isolated, token-optimized OpenClaw Docker container.
    
    Key optimizations:
    - Heartbeat disabled by default
    - Aggressive context compaction
    - Tool output truncation enabled
    - Session auto-pruning configured
    """
    user_id = str(github_id).lower().replace(" ", "_").replace("-", "_")
    container_name = f"vc_agent_{user_id}"
    user_dir = os.path.join(USER_DATA_ROOT, user_id)
    
    # Setup directories and config
    os.makedirs(user_dir, exist_ok=True)
    setup_user_config(user_dir, user_id)
    
    port = get_next_port()
    
    # Build Docker command with token-optimized env vars
    cmd = [
        "docker", "run", "-d",
        "--name", container_name,
        "--restart", "unless-stopped",
        "-p", f"{port}:8080",
        "-v", f"{user_dir}:/data",
        # Core paths
        "-e", "OPENCLAW_WORKSPACE_DIR=/data/workspace",
        "-e", "OPENCLAW_STATE_DIR=/data/.openclaw",
        # Token optimization settings
        "-e", f"OPENCLAW_CONTEXT_TOKENS={TOKEN_CONFIG['contextTokens']}",
        "-e", f"OPENCLAW_MAX_INPUT_TOKENS={TOKEN_CONFIG['maxInputTokens']}",
        "-e", f"OPENCLAW_COMPACTION={TOKEN_CONFIG['compaction']}",
        "-e", f"OPENCLAW_HEARTBEAT_ENABLED={str(TOKEN_CONFIG['heartbeatEnabled']).lower()}",
        "-e", f"OPENCLAW_HEARTBEAT_EVERY={TOKEN_CONFIG['heartbeatInterval']}",
        "-e", f"OPENCLAW_DEFAULT_MODEL={TOKEN_CONFIG['defaultModel']}",
        # Disable thinking/reasoning mode (saves tokens)
        "-e", "OPENCLAW_THINKING_ENABLED=false",
        # Resource limits
        "--memory=512m",
        "--cpus=0.5",
    ]

    # Add API Key
    gemini_key = api_key or os.environ.get("GEMINI_API_KEY")
    if gemini_key:
        cmd += ["-e", f"GEMINI_API_KEY={gemini_key}"]

    # Add Telegram Bot Token
    if telegram_token:
        cmd += [
            "-e", f"TELEGRAM_BOT_TOKEN={telegram_token}",
            "-e", "TELEGRAM_DM_POLICY=pairing"
        ]

    # Add GitHub Integration
    if github_token:
        cmd += ["-e", f"GITHUB_TOKEN={github_token}"]

    # Docker image
    cmd.append(DOCKER_IMAGE)

    try:
        # Check if container already exists
        check = subprocess.run(
            ["docker", "ps", "-a", "--filter", f"name=^{container_name}$", "--format", "{{.Names}}"],
            capture_output=True, text=True
        )
        
        if container_name in check.stdout.strip():
            # Container exists - check if running
            running_check = subprocess.run(
                ["docker", "ps", "--filter", f"name=^{container_name}$", "--format", "{{.Status}}"],
                capture_output=True, text=True
            )
            
            if running_check.stdout.strip():
                return {
                    "status": "exists",
                    "container": container_name,
                    "message": "Container already running",
                    "port": port
                }
            else:
                # Container exists but stopped - restart it
                subprocess.run(["docker", "start", container_name], check=True)
                return {
                    "status": "restarted",
                    "container": container_name,
                    "port": port
                }

        # Create new container
        subprocess.run(cmd, check=True)
        
        return {
            "status": "success",
            "container": container_name,
            "port": port,
            "url": f"http://agent.divygoyal.in:{port}",
            "config": {
                "contextTokens": TOKEN_CONFIG['contextTokens'],
                "compaction": TOKEN_CONFIG['compaction'],
                "heartbeat": TOKEN_CONFIG['heartbeatEnabled']
            }
        }
        
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Unexpected error: {str(e)}"}

def cleanup_sessions(user_id: str, max_size_mb: float = 0.5):
    """
    Cleanup bloated session files for a user.
    Sessions > max_size_mb are backed up and reset.
    """
    user_dir = os.path.join(USER_DATA_ROOT, user_id)
    sessions_dir = os.path.join(user_dir, ".openclaw", "sessions")
    
    if not os.path.exists(sessions_dir):
        return {"status": "no_sessions"}
    
    cleaned = []
    max_size_bytes = max_size_mb * 1024 * 1024
    
    for session_file in Path(sessions_dir).glob("*.jsonl"):
        if session_file.stat().st_size > max_size_bytes:
            backup_path = session_file.with_suffix(".jsonl.bak")
            shutil.move(str(session_file), str(backup_path))
            cleaned.append(session_file.name)
    
    return {
        "status": "cleaned",
        "files": cleaned,
        "count": len(cleaned)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 provision_user.py <github_id> [telegram_token] [github_token]")
        print("       python3 provision_user.py --cleanup <github_id>")
        sys.exit(1)
    
    if sys.argv[1] == "--cleanup" and len(sys.argv) > 2:
        result = cleanup_sessions(sys.argv[2])
    else:
        g_id = sys.argv[1]
        t_token = sys.argv[2] if len(sys.argv) > 2 else None
        gh_token = sys.argv[3] if len(sys.argv) > 3 else None
        result = provision_user(g_id, t_token, gh_token)
    
    print(json.dumps(result, indent=2))
