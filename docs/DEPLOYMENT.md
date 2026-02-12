# VibeCode Agent - Deployment Guide

Complete guide for deploying VibeCode Agent on a VPS with OpenClaw.

## Prerequisites

- Ubuntu 22.04+ VPS (2GB RAM minimum, 4GB recommended)
- Domain pointed to VPS IP (e.g., `agent.divygoyal.in`)
- GitHub OAuth App credentials
- Gemini API key (1M TPM tier recommended)

## Step 1: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Clone repository
git clone https://github.com/divygoyal/vibecodeagent.git /home/ubuntu/vibecode
cd /home/ubuntu/vibecode

# Run automated setup
sudo bash scripts/setup.sh
```

The setup script will install:
- Docker & Docker Compose
- Node.js 20 LTS
- Nginx reverse proxy
- Python 3 with pip
- All project dependencies

## Step 2: Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your values
nano .env
```

Required variables:

```env
# GitHub OAuth (create at https://github.com/settings/developers)
GITHUB_ID=your_client_id
GITHUB_SECRET=your_client_secret

# NextAuth
NEXTAUTH_URL=https://agent.divygoyal.in
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Gemini API
GEMINI_API_KEY=your_gemini_key
```

## Step 3: SSL Certificate

```bash
# Install SSL certificate
sudo certbot --nginx -d agent.divygoyal.in

# Auto-renewal is configured automatically
```

## Step 4: Start Services

```bash
# Enable and start web dashboard
sudo systemctl enable vibecode-web
sudo systemctl start vibecode-web

# Check status
sudo systemctl status vibecode-web
```

## Step 5: Pull OpenClaw Image

```bash
# Pull latest OpenClaw
docker pull coollabsio/openclaw:latest

# Verify
docker images | grep openclaw
```

## Step 6: Setup Maintenance Cron

```bash
# Make maintenance script executable
chmod +x /home/ubuntu/vibecode/scripts/maintenance.sh

# Add to crontab (runs every Sunday at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * 0 /home/ubuntu/vibecode/scripts/maintenance.sh") | crontab -
```

## Token Optimization Configuration

The `config/openclaw.json` file contains token-saving settings:

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "enabled": false,      // Disabled - use cron instead
        "every": "60m"         // If enabled, very infrequent
      },
      "session": {
        "contextTokens": 32000,    // Hard limit on context
        "compaction": "aggressive" // Auto-summarize history
      }
    }
  }
}
```

### Why These Settings?

| Setting | Reason |
|---------|--------|
| Heartbeat disabled | Each heartbeat costs ~500-2000 tokens. Use cron jobs instead |
| 32K context limit | Prevents runaway conversations from consuming entire budget |
| Aggressive compaction | Automatically summarizes old messages to save space |
| Thinking disabled | Reasoning mode can 10x token usage |

## User Provisioning Flow

1. User visits `https://agent.divygoyal.in`
2. Clicks "Sign in with GitHub"
3. After OAuth, `provision_user.py` creates:
   - Isolated Docker container
   - User workspace directory
   - Optimized OpenClaw config
4. User enters Telegram bot token
5. Bot connects to user's private agent

## Directory Structure on VPS

```
/home/ubuntu/
├── vibecode/                    # Application root
│   ├── config/                  # Shared OpenClaw configs
│   ├── scripts/                 # Automation scripts
│   ├── web/                     # Dashboard (Next.js)
│   └── users/                   # User data (created on provisioning)
│       └── {github_id}/
│           ├── .openclaw/       # Agent state
│           │   ├── sessions/    # Conversation history
│           │   └── MEMORY.md    # Agent memory
│           └── workspace/       # User files
└── .openclaw/                   # Global OpenClaw config (optional)
```

## Monitoring

### Check Logs

```bash
# Web dashboard logs
sudo journalctl -u vibecode-web -f

# Container logs
docker logs vc_agent_{user_id} -f

# Maintenance logs
tail -f /var/log/vibecode/maintenance.log
```

### Check Token Usage

```bash
# List all running agents
docker ps --filter "name=vc_agent_"

# Check disk usage per user
du -sh /home/ubuntu/vibecode/users/*

# Find bloated sessions
find /home/ubuntu/vibecode/users -name "*.jsonl" -size +500k
```

## Troubleshooting

### Container won't start

```bash
# Check Docker status
sudo systemctl status docker

# Check for port conflicts
netstat -tlnp | grep 808

# View container logs
docker logs vc_agent_{user_id}
```

### High token usage

1. Check for large session files:
   ```bash
   find /home/ubuntu/vibecode/users -name "*.jsonl" -size +500k -exec ls -lh {} \;
   ```

2. Run cleanup:
   ```bash
   python3 scripts/provision_user.py --cleanup {user_id}
   ```

3. Verify heartbeat is disabled in user's config

### Web dashboard not loading

```bash
# Check if running
sudo systemctl status vibecode-web

# Rebuild if needed
cd /home/ubuntu/vibecode/web
npm run build
sudo systemctl restart vibecode-web

# Check Nginx
sudo nginx -t
sudo systemctl reload nginx
```

## Security Notes

1. **Never commit `.env` file** - it contains secrets
2. **User containers are isolated** - they can't access other users' data
3. **API keys are injected at runtime** - not stored in container images
4. **Input sanitization** - All user inputs are sanitized before shell execution

## Scaling

For multiple VPS instances:

1. Use shared Redis for session management
2. Use shared PostgreSQL for user metadata
3. Load balance with Nginx upstream
4. Consider Kubernetes for auto-scaling

## Updating

```bash
cd /home/ubuntu/vibecode
git pull origin main

# Rebuild web
cd web && npm install && npm run build

# Restart services
sudo systemctl restart vibecode-web

# Pull latest OpenClaw (new containers will use it)
docker pull coollabsio/openclaw:latest
```
