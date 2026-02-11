import json
import os
import sys
import subprocess
import time

# Configuration
USER_DATA_ROOT = "/home/ubuntu/vibecode/users"
BASE_PORT = 8081
DOCKER_IMAGE = "coollabsio/openclaw:latest"

def get_next_port():
    """Finds the next available port starting from 8081."""
    try:
        result = subprocess.run(["docker", "ps", "--format", "{{.Ports}}"], capture_output=True, text=True)
        ports_in_use = []
        for line in result.stdout.splitlines():
            # Example line: 0.0.0.0:8081->8080/tcp
            if ":" in line and "->" in line:
                port = line.split(":")[1].split("->")[0]
                ports_in_use.append(int(port))
        
        current_port = BASE_PORT
        while current_port in ports_in_use:
            current_port += 1
        return current_port
    except Exception:
        return BASE_PORT

def provision_user(github_id, telegram_token=None, github_token=None, api_key=None):
    """
    Spins up a completely isolated OpenClaw Docker container for a user.
    """
    user_id = str(github_id).lower().replace(" ", "_")
    container_name = f"vc_agent_{user_id}"
    user_dir = os.path.join(USER_DATA_ROOT, user_id)
    os.makedirs(user_dir, exist_ok=True)
    
    # Ensure Docker is running
    port = get_next_port()
    
    # Base Docker Command
    cmd = [
        "docker", "run", "-d",
        "--name", container_name,
        "--restart", "always",
        "-p", f"{port}:8080",
        "-v", f"{user_dir}:/data",
        "-e", f"OPENCLAW_WORKSPACE_DIR=/data/workspace",
        "-e", f"OPENCLAW_STATE_DIR=/data/.openclaw",
    ]

    # Add API Key (Use ours as default for now if none provided)
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

    # Image
    cmd.append(DOCKER_IMAGE)

    try:
        # Check if container already exists
        check = subprocess.run(["docker", "ps", "-a", "--filter", f"name={container_name}", "--format", "{{.Names}}"], capture_output=True, text=True)
        if container_name in check.stdout:
            return {"status": "error", "message": f"Container {container_name} already exists."}

        subprocess.run(cmd, check=True)
        return {
            "status": "success",
            "container": container_name,
            "port": port,
            "url": f"http://agent.divygoyal.in:{port}"
        }
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 provision_user.py <github_id> [telegram_token] [github_token]")
        sys.exit(1)
        
    g_id = sys.argv[1]
    t_token = sys.argv[2] if len(sys.argv) > 2 else None
    gh_token = sys.argv[3] if len(sys.argv) > 3 else None
    
    # Use the Gemini Key from the environment
    result = provision_user(g_id, t_token, gh_token)
    print(json.dumps(result, indent=2))
