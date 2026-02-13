---
description: How to deploy VibeCode Agent on a new VPS from scratch
---

# Deploy VibeCode Agent on a New VPS

## Prerequisites

- Ubuntu 22.04+ VPS (minimum 2GB RAM, 2 CPU recommended)
- Domain pointed to VPS IP (e.g. `agent.yourdomain.com`)
- GitHub OAuth App credentials
- Gemini API Key
- Telegram Bot Token (from @BotFather)

---

## Step 1: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Re-login for group changes
exit
# SSH back in
```

## Step 2: Clone the Repo

```bash
cd /home/ubuntu
git clone https://github.com/divygoyal/vibecodeagent.git
cd vibecodeagent
```

## Step 3: Create .env File

```bash
cat > .env << 'EOF'
# Admin API
ADMIN_API_KEY=<generate-a-strong-random-key>

# Gemini (for the bot's brain)
GEMINI_API_KEY=<your-gemini-api-key>

# GitHub OAuth (for web dashboard login)
GITHUB_ID=<your-github-oauth-app-client-id>
GITHUB_SECRET=<your-github-oauth-app-client-secret>

# Admin Telegram Bot (optional — for admin notifications)
ADMIN_TELEGRAM_BOT_TOKEN=<admin-bot-token>
ADMIN_TELEGRAM_CHAT_ID=<your-telegram-chat-id>

# Web Dashboard
NEXTAUTH_URL=https://agent.yourdomain.com
NEXTAUTH_SECRET=<generate-a-random-secret>

# Data directory for user containers
DATA_DIR=/home/ubuntu/clawbot-data
EOF
```

> **Generate random keys:**
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

## Step 4: Set Up SSL (Let's Encrypt)

```bash
# Install certbot
sudo apt-get install -y certbot

# Get certificate (make sure domain points to this VPS)
sudo certbot certonly --standalone -d agent.yourdomain.com

# Create ACME directory
sudo mkdir -p /var/www/certbot
```

Update `nginx/nginx.conf` with your domain name if different from `agent.divygoyal.in`.

## Step 5: Create Data Directory

```bash
sudo mkdir -p /home/ubuntu/clawbot-data
sudo chown -R $USER:$USER /home/ubuntu/clawbot-data
```

## Step 6: Build and Start

```bash
cd /home/ubuntu/vibecodeagent

# Build all images (this takes a few minutes)
docker compose build

# Start all services
docker compose up -d

# Verify everything is running
docker compose ps
```

You should see:
- `clawbot-admin` — Running (healthy)
- `clawbot-watchdog` — Running
- `clawbot-web` — Running
- `clawbot-nginx` — Running

## Step 7: Verify

```bash
# Check admin API health
curl -s http://localhost:8000/health

# Check logs
docker compose logs -f admin-api --tail 20
```

## Step 8: Provision a User Bot

Use the admin API to create a user container:

```bash
curl -X POST http://localhost:8000/api/containers/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your-ADMIN_API_KEY>" \
  -d '{
    "github_id": "<user-github-id>",
    "plan": "free",
    "telegram_token": "<user-telegram-bot-token>"
  }'
```

## Step 9: Verify Bot Container

```bash
# Find the container name
docker ps | grep clawbot_

# Check all 7 intelligence files are created and owned by node
docker exec clawbot_<github_id> ls -la /data/workspace/

# Check config
docker exec clawbot_<github_id> cat /data/.openclaw/openclaw.json

# Check logs for clean startup
docker logs --tail 20 clawbot_<github_id>
```

You should see:
- 7 files: AGENTS.md, SOUL.md, TOOLS.md, USER.md, IDENTITY.md, HEARTBEAT.md, BOOTSTRAP.md
- All owned by `node:node`
- Logs showing `agent model: google/gemini-3-pro-preview`

## Step 10: Test the Bot

Open Telegram, find your bot, and send:

> "Hey, who are you?"

The bot should respond with personality. Then test tools:

> "Clone https://github.com/some/repo and show me what's inside"

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot says "I can't do that" | Check model is `gemini-3-pro-preview`, not `gemini-2.0-flash` |
| Files owned by `root:root` | `chown` runs after file creation in `_seed_intelligence()` — re-provision |
| Container won't start | Check `docker logs clawbot_<id>` and `GEMINI_API_KEY` |
| SSL errors | Verify certbot certs exist at `/etc/letsencrypt/live/yourdomain/` |
| Admin API unhealthy | `docker compose logs admin-api` — check DATABASE_URL and env vars |

## Architecture

```
VPS
├── nginx (port 80/443) → reverse proxy
├── web dashboard (Next.js) → GitHub OAuth login
├── admin-api (FastAPI) → provisions user containers  
├── watchdog → monitors container health
└── clawbot_<user> (per user) → OpenClaw + Gemini 3 Pro
    └── /data/
        ├── workspace/ (AGENTS.md, SOUL.md, etc.)
        └── .openclaw/ (openclaw.json config)
```
