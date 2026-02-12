# 🦞 ClawBot Platform

A multi-tenant AI assistant platform powered by [OpenClaw](https://github.com/openclaw/openclaw). Each user gets their own dedicated, sandboxed ClawBot container accessible via Telegram.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLAWBOT PLATFORM                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│   ┌─────────┐     ┌─────────────┐     ┌───────────────────────────────────┐  │
│   │  Nginx  │────▶│  Web        │     │         Admin API                 │  │
│   │  :80    │     │  Dashboard  │────▶│       (FastAPI)                   │  │
│   │  :443   │     │  (Next.js)  │     │                                   │  │
│   └─────────┘     └─────────────┘     │  • User CRUD                      │  │
│                                       │  • Container management           │  │
│                                       │  • Subscription handling          │  │
│                                       └───────────────────────────────────┘  │
│                                                      │                        │
│                                                      ▼                        │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│   │  ClawBot    │    │  ClawBot    │    │  ClawBot    │    │  Watchdog   │  │
│   │  User 1     │    │  User 2     │    │  User N     │    │  Service    │  │
│   │  :9000      │    │  :9001      │    │  :900N      │    │             │  │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │  • Health   │  │
│          │                  │                  │           │  • Restart  │  │
│          │                  │                  │           │  • Alerts   │  │
│          ▼                  ▼                  ▼           └─────────────┘  │
│   ┌─────────────────────────────────────────────────────┐                   │
│   │                    Telegram API                      │                   │
│   └─────────────────────────────────────────────────────┘                   │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **🔒 Isolated Containers**: Each user runs in their own Docker container
- **⚡ Token Optimized**: Aggressive caching, compaction, and model routing
- **🔄 Auto-Recovery**: Watchdog service monitors and restarts failed containers
- **📊 Subscription Plans**: Free, Starter, and Pro tiers with different limits
- **🔔 Alerts**: Telegram notifications for system events

## Quick Start

### Prerequisites

- Ubuntu 22.04+ VPS (4 vCPU, 16GB RAM recommended)
- Docker & Docker Compose
- Domain name (for HTTPS)

### 1. Clone and Setup

```bash
git clone https://github.com/divygoyal/vibecodeagent.git
cd vibecodeagent

# Copy environment template
cp env.example .env
```

### 2. Configure Environment

Edit `.env` with your values:

```bash
# Required
GITHUB_ID=your_github_oauth_id
GITHUB_SECRET=your_github_oauth_secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ADMIN_API_KEY=$(openssl rand -hex 32)
GEMINI_API_KEY=your_gemini_key

# For alerts
TELEGRAM_ADMIN_BOT_TOKEN=your_admin_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_chat_id
```

### 3. Deploy

```bash
# Pull OpenClaw image
docker pull ghcr.io/openclaw/openclaw:latest

# Start all services
docker compose up -d

# Check status
docker compose ps
```

### 4. Configure Domain (Optional)

1. Point your domain to the VPS IP
2. Uncomment HTTPS block in `nginx/nginx.conf`
3. Add SSL certificates to `nginx/ssl/`
4. Update `NEXTAUTH_URL` in `.env`
5. Restart: `docker compose restart nginx`

## Subscription Plans

| Feature | Free | Starter ($30) | Pro ($50) |
|---------|------|---------------|-----------|
| Memory | 256MB | 512MB | 1GB |
| CPU | 0.25 core | 0.5 core | 1 core |
| Daily Messages | 50 | 500 | 5000 |
| GitHub Plugin | ❌ | ✅ | ✅ |
| GSC/Analytics | ❌ | ❌ | ✅ |
| Custom Rules | ❌ | ❌ | ✅ |

## Admin API

The Admin API provides full control over users and containers:

```bash
# List all users
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/api/users

# Get user status
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/api/users/github_id

# Restart container
curl -X POST \
  -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "restart"}' \
  http://localhost:8000/api/users/github_id/container

# System status
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/api/admin/status
```

## Project Structure

```
vibecodeagent/
├── admin/                   # Admin API (FastAPI)
│   ├── main.py              # API endpoints
│   ├── docker_manager.py    # Container management
│   ├── watchdog.py          # Health monitoring
│   ├── alerts.py            # Telegram alerts
│   └── Dockerfile
├── web/                     # Web Dashboard (Next.js)
│   └── src/app/
├── nginx/                   # Reverse proxy config
├── templates/               # OpenClaw config templates
├── plugins/                 # Shared plugins (github-ghost)
├── docker-compose.yml
├── env.example
└── README.md
```

## Monitoring

- **Health Checks**: Watchdog checks every 60s
- **Auto-Restart**: Up to 3 attempts before alerting
- **Telegram Alerts**: Critical failures notify admins
- **Container Logs**: `docker logs clawbot_<github_id>`

## Scaling

Current architecture supports ~50 users per VPS (16GB RAM).

For 1000+ users:
- Multiple VPS instances with load balancer
- Kubernetes deployment
- Shared database (PostgreSQL)

## Contributing

Pull requests welcome! Please follow the existing code style.

## License

MIT License - see LICENSE file
