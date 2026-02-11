import json
import os
import sys
import uuid

CONFIG_PATH = "/home/ubuntu/.openclaw/openclaw.json"
USER_DATA_ROOT = "/home/ubuntu/.openclaw/workspace/users"

def provision_user(github_id, telegram_token=None):
    """
    Provisions a new isolated OpenClaw Agent for a VibeCode user.
    """
    user_dir = os.path.join(USER_DATA_ROOT, str(github_id))
    os.makedirs(user_dir, exist_ok=True)
    
    # Create isolated memory file
    memory_file = os.path.join(user_dir, "MEMORY.md")
    if not os.path.exists(memory_file):
        with open(memory_file, "w") as f:
            f.write(f"# Memory for User {github_id}\n\nInitialized VibeCode Agent.")

    # Load existing config
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    # Check if agent already exists
    agent_id = f"user_{github_id}"
    agents_list = config.get("agents", {}).get("list", [])
    
    existing_agent = next((a for a in agents_list if a["id"] == agent_id), None)
    
    if not existing_agent:
        # Create new isolated agent entry
        new_agent = {
            "id": agent_id,
            "name": f"VibeCode Assistant ({github_id})",
            "workspace": user_dir,
            "sandbox": {
                "mode": "non-main",
                "workspaceAccess": "rw"
            },
            # OPTIMIZATION: Limit context window to prevent TPM exhaustion
            "contextPruning": {
                "mode": "cache-ttl",
                "ttl": "1h",
                "softTrim": {
                    "maxChars": 16000,  # ~4k tokens max context
                    "headChars": 1000,
                    "tailChars": 2000
                }
            },
            # OPTIMIZATION: Use local embeddings (zero API cost)
            "memorySearch": {
                "enabled": True,
                "provider": "local",
                "store": {
                    "path": os.path.join(user_dir, "search.sqlite"),
                    "vector": {"enabled": True}
                }
            }
        }
        
        # If user provided a BYOB token, attach it
        if telegram_token:
            new_agent["channels"] = {
                "telegram": {
                    "enabled": True,
                    "botToken": telegram_token,
                    "dmPolicy": "pairing"
                }
            }
            
        agents_list.append(new_agent)
        config["agents"]["list"] = agents_list

        # Write back updated config
        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=2)
            
        return {"status": "created", "agent_id": agent_id, "workspace": user_dir}
    
    return {"status": "exists", "agent_id": agent_id, "workspace": user_dir}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 provision_user.py <github_id> [telegram_token]")
        sys.exit(1)
        
    g_id = sys.argv[1]
    t_token = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = provision_user(g_id, t_token)
    print(json.dumps(result, indent=2))
