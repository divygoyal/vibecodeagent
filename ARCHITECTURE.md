# ClawBot Platform Architecture

## Overview

ClawBot is a multi-tenant AI assistant platform that provides dedicated OpenClaw containers for each subscriber. The architecture prioritizes isolation, token efficiency, and reliability.

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  VPS (16GB RAM)                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           SYSTEM SERVICES                                   │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
│  │  │  Nginx   │  │  Web         │  │  Admin API   │  │  Watchdog        │   │ │
│  │  │  Proxy   │──│  Dashboard   │──│  (FastAPI)   │──│  Service         │   │ │
│  │  │  :80/:443│  │  (Next.js)   │  │  :8000       │  │                  │   │ │
│  │  └──────────┘  │  :3000       │  │              │  │  - Health checks │   │ │
│  │                └──────────────┘  │  - CRUD      │  │  - Auto-restart  │   │ │
│  │                                  │  - Docker    │  │  - Alerts        │   │ │
│  │                                  │  - Auth      │  └──────────────────┘   │ │
│  │                                  └──────────────┘                          │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           USER CONTAINERS                                   │ │
│  │                                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         ┌───────────┐  │ │
│  │  │  ClawBot    │  │  ClawBot    │  │  ClawBot    │   ...   │  ClawBot  │  │ │
│  │  │  User A     │  │  User B     │  │  User C     │         │  User N   │  │ │
│  │  │  256MB/0.25 │  │  512MB/0.5  │  │  1GB/1.0    │         │           │  │ │
│  │  │  :9000      │  │  :9001      │  │  :9002      │         │  :9049    │  │ │
│  │  │  [free]     │  │  [starter]  │  │  [pro]      │         │           │  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         └─────┬─────┘  │ │
│  │         │                │                │                      │        │ │
│  │         └────────────────┴────────────────┴──────────────────────┘        │ │
│  │                                   │                                        │ │
│  │                                   ▼                                        │ │
│  │                        ┌─────────────────────┐                             │ │
│  │                        │   Telegram API      │                             │ │
│  │                        └─────────────────────┘                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           STORAGE                                           │ │
│  │  /home/ubuntu/clawbot-data/                                                │ │
│  │  ├── user_a/           # Mounted as /data in container                     │ │
│  │  │   ├── workspace/    # User's workspace                                  │ │
│  │  │   └── .openclaw/    # OpenClaw state & config                           │ │
│  │  ├── user_b/                                                               │ │
│  │  └── user_n/                                                               │ │
│  │                                                                             │ │
│  │  /app/admin/data/admin.db  # SQLite database                               │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Request Flow

### User Onboarding

```
User                    Web Dashboard           Admin API             Docker
  │                          │                      │                    │
  │──── GitHub OAuth ───────▶│                      │                    │
  │◀──── Session Token ──────│                      │                    │
  │                          │                      │                    │
  │── Enter Telegram Token ─▶│                      │                    │
  │                          │── POST /api/users ──▶│                    │
  │                          │                      │── docker run ─────▶│
  │                          │                      │◀── container_id ───│
  │                          │◀── success ──────────│                    │
  │◀── "Bot Connected!" ─────│                      │                    │
```

### Message Flow

```
User (Telegram)         User's ClawBot           Gemini API
       │                      │                       │
       │── Send message ─────▶│                       │
       │                      │── API request ───────▶│
       │                      │◀── Response ──────────│
       │◀── Reply ────────────│                       │
```

### Health Monitoring

```
Watchdog                Admin API             Docker              Telegram
   │                       │                    │                    │
   │── Check containers ──▶│                    │                    │
   │                       │── docker status ──▶│                    │
   │                       │◀── statuses ───────│                    │
   │                       │                    │                    │
   │  [If unhealthy]       │                    │                    │
   │── restart container ─▶│── docker restart ─▶│                    │
   │                       │                    │                    │
   │  [If max restarts]    │                    │                    │
   │── send alert ─────────│────────────────────│── Alert! ─────────▶│
```

## Token Optimization Strategy

### 1. Model Routing

```
User Query                 Classification              Model Used
    │                           │                          │
    ▼                           ▼                          ▼
"What time is it?"  ─────▶  Simple Query  ─────▶  gemini-2.0-flash-lite
"Refactor this code" ─────▶  Code Task    ─────▶  gemini-2.0-flash
"Design a system"   ─────▶  Complex      ─────▶  gemini-2.0-pro
```

### 2. Context Management

```
┌────────────────────────────────────────────────────────────┐
│                    32K Token Context                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │   System    │  │   Session    │  │    Current        │ │
│  │   Prompt    │  │   Summary    │  │    Exchange       │ │
│  │   (2K)      │  │   (6K)       │  │    (16K)          │ │
│  └─────────────┘  └──────────────┘  └───────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Reserve Buffer (4K)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Compaction triggers at 24K tokens                         │
│  Older messages are summarized and pruned                  │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### 3. Tool Output Truncation

```
Tool Output                    Processing                    To LLM
    │                              │                            │
    ▼                              ▼                            ▼
50,000 chars  ───────▶  Truncate to 5,000  ───────▶  5,000 chars
  raw API                      + summary                  efficient
  response                   of remaining                   input
```

## Container Resource Allocation

| Plan    | Memory | CPU   | Token Budget/Day | Restart Policy    |
|---------|--------|-------|------------------|-------------------|
| Free    | 256MB  | 0.25  | 1M tokens        | 3 attempts, stop  |
| Starter | 512MB  | 0.50  | 10M tokens       | 3 attempts, alert |
| Pro     | 1GB    | 1.00  | 50M tokens       | Unlimited, alert  |

## Database Schema

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    github_id VARCHAR(50) UNIQUE NOT NULL,
    github_username VARCHAR(100),
    email VARCHAR(255),
    plan VARCHAR(20) DEFAULT 'free',
    container_id VARCHAR(100),
    container_name VARCHAR(100),
    container_port INTEGER,
    telegram_bot_token VARCHAR(255),
    gemini_api_key VARCHAR(255),
    github_token VARCHAR(255),
    custom_rules TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    container_status VARCHAR(20) DEFAULT 'stopped',
    restart_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking
CREATE TABLE usage_logs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date VARCHAR(10),
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0
);

-- Container events
CREATE TABLE container_events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    container_id VARCHAR(100),
    event_type VARCHAR(50),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Security Considerations

1. **Container Isolation**: Each user runs in a separate Docker container
2. **No Host Network**: Containers use bridge networking
3. **Resource Limits**: Memory and CPU capped per plan
4. **API Key Protection**: Keys stored in env vars, never in code
5. **Admin API Auth**: API key required for all admin endpoints
6. **Input Sanitization**: All user inputs sanitized before processing

## Scaling Path

### Current: Single VPS (50 users)
```
1 VPS → 50 containers → Direct Docker management
```

### Medium Scale: Multiple VPS (500 users)
```
Load Balancer
     │
     ├── VPS 1 (50 containers)
     ├── VPS 2 (50 containers)
     └── VPS N (50 containers)
     
Shared PostgreSQL database
```

### Large Scale: Kubernetes (1000+ users)
```
Kubernetes Cluster
     │
     ├── Web Deployment (3 replicas)
     ├── Admin API Deployment (2 replicas)
     ├── Watchdog DaemonSet
     └── ClawBot Pods (autoscaled)

Managed PostgreSQL
Redis for caching
```

## Monitoring & Alerting

| Event | Severity | Action |
|-------|----------|--------|
| Container started | Info | Log only |
| Container stopped | Warning | Attempt restart |
| Health check failed | Warning | Restart container |
| Max restarts reached | Critical | Telegram alert |
| High memory usage | Warning | Log + alert if persists |
| Watchdog started | Info | Telegram notification |
