# 🚀 Complete Setup Checklist for agent.divygoyal.in

## OpenClaw Settings Explained

| Setting | What it Does | Token Savings |
|---------|--------------|---------------|
| `compaction.mode: "safeguard"` | Automatically compresses old messages when context gets full, but keeps critical info | **High** - prevents context overflow |
| `streamMode: "partial"` | Sends response in chunks as generated, doesn't wait for full response | **Medium** - faster perceived response |
| `skills.nodeManager: "bun"` | Uses Bun instead of npm for installing skills (faster, less memory) | **Indirect** - saves CPU/time |
| `heartbeat.enabled: false` | Disables periodic "thinking" checks | **High** - no idle token usage |

---

## ✅ Pre-Deployment Checklist

### 1. GitHub OAuth App ✓
- [x] Created at: https://github.com/settings/developers
- [x] Client ID: `Ov23lieNfFV4qq0ES5nO`
- [ ] **⚠️ REGENERATE CLIENT SECRET** (you shared it publicly!)
- [ ] Update callback URL to: `https://agent.divygoyal.in/api/auth/callback/github`

### 2. DNS Configuration
- [ ] Point `agent.divygoyal.in` to your EC2 IP address
  ```
  Type: A
  Name: agent
  Value: YOUR_EC2_IP
  TTL: 300
  ```

### 3. Gemini API Key
- [ ] Get from: https://aistudio.google.com/apikey
- [ ] Note your TPM limits (check your tier)

### 4. Admin Telegram Bot (for alerts)
- [ ] Create bot with @BotFather
- [ ] Get token: `/newbot` → follow prompts
- [ ] Get your chat ID: message @userinfobot

### 5. Generate Secrets
Run these commands to generate secure keys:
```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ADMIN_API_KEY
openssl rand -hex 32
```

---

## 📋 Complete Setup Steps

### Step 1: SSH into EC2
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP
```

### Step 2: Install Docker
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Logout and login again for group changes
exit
```

### Step 3: Clone Repository
```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

git clone https://github.com/divygoyal/vibecodeagent.git
cd vibecodeagent
```

### Step 4: Create .env File
```bash
cp env.template .env
nano .env
```

Fill in all values:
```env
# Your values
DOMAIN=agent.divygoyal.in
PROTOCOL=https

GITHUB_ID=Ov23lieNfFV4qq0ES5nO
GITHUB_SECRET=YOUR_NEW_REGENERATED_SECRET

NEXTAUTH_SECRET=YOUR_GENERATED_SECRET
NEXTAUTH_URL=https://agent.divygoyal.in

ADMIN_API_KEY=YOUR_GENERATED_KEY
ADMIN_API_URL=http://admin-api:8000

GEMINI_API_KEY=YOUR_GEMINI_KEY

ADMIN_TELEGRAM_BOT_TOKEN=YOUR_ADMIN_BOT_TOKEN
ADMIN_TELEGRAM_CHAT_ID=YOUR_CHAT_ID

MAX_USERS=50
DEFAULT_RAM_LIMIT=256m
DEFAULT_CPU_LIMIT=0.25
DATA_DIR=/home/ubuntu/clawbot-data

SSL_EMAIL=your@email.com
```

### Step 5: Setup SSL with Let's Encrypt
```bash
# Create nginx config for initial SSL setup
mkdir -p nginx/ssl

# Run certbot (we'll add this to setup)
sudo apt install certbot -y
sudo certbot certonly --standalone -d agent.divygoyal.in --email your@email.com --agree-tos -n
```

### Step 6: Start Services
```bash
docker compose up -d
```

### Step 7: Verify
```bash
# Check all services running
docker compose ps

# Check logs
docker compose logs -f web
docker compose logs -f admin-api

# Test endpoints
curl https://agent.divygoyal.in/api/health
```

---

## 🔧 File Changes Summary

Files you need to commit:
```
vibecodeagent/
├── admin/                    # NEW - Admin API backend
│   ├── Dockerfile
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── docker_manager.py
│   ├── watchdog.py
│   ├── alerts.py
│   └── requirements.txt
├── nginx/                    # NEW - Reverse proxy config
│   └── nginx.conf
├── templates/                # NEW - Config templates for users
│   ├── openclaw.json
│   ├── SOUL.md
│   ├── IDENTITY.md
│   └── HEARTBEAT.md
├── web/                      # UPDATED - Dashboard
│   ├── Dockerfile           # NEW
│   └── src/app/api/auth/... # UPDATED
├── docker-compose.yml        # NEW - Orchestration
├── env.template              # NEW - Environment template
├── SETUP_CHECKLIST.md        # NEW - This file
└── ARCHITECTURE.md           # UPDATED
```

---

## 🧪 Testing the Setup

### Test 1: Web Dashboard
1. Go to `https://agent.divygoyal.in`
2. Click "Sign in with GitHub"
3. Authorize the app
4. You should see the dashboard

### Test 2: Create Your First Bot
1. Create a Telegram bot with @BotFather
2. Copy the token
3. Paste in dashboard → "Connect Bot"
4. Wait for container to start (~30 seconds)
5. Message your bot on Telegram

### Test 3: Check Container
```bash
# On VPS
docker ps | grep clawbot

# Should see your container
clawbot_YOUR_GITHUB_ID
```

---

## 🔐 Security Reminders

1. **Never commit `.env`** - it's in .gitignore
2. **Regenerate GitHub secret** - you shared it publicly
3. **Use strong NEXTAUTH_SECRET** - at least 32 chars
4. **Firewall rules** - only open ports 80, 443, 22

```bash
# UFW firewall setup
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 📊 Monitoring

### Check Token Usage
```bash
# View logs for token usage
docker logs clawbot_GITHUB_ID 2>&1 | grep -i token
```

### Container Health
```bash
# Admin API health check
curl http://localhost:8000/api/health

# List all containers
curl -H "X-API-Key: YOUR_ADMIN_API_KEY" http://localhost:8000/api/containers
```

### Resource Usage
```bash
docker stats
```

---

## ❓ Troubleshooting

### OAuth Callback Error
- Check callback URL matches exactly: `https://agent.divygoyal.in/api/auth/callback/github`
- Ensure SSL is working (https, not http)

### Container Won't Start
```bash
docker logs clawbot_GITHUB_ID
```

### SSL Issues
```bash
# Check certificate
sudo certbot certificates

# Renew if needed
sudo certbot renew
```

### Port Already in Use
```bash
# Check what's using port 80
sudo lsof -i :80
```

---

## 🎯 What's Working After Setup

| Feature | Status |
|---------|--------|
| GitHub OAuth Login | ✅ |
| User Dashboard | ✅ |
| Bot Creation | ✅ |
| Container Isolation | ✅ |
| Token Optimization | ✅ |
| Health Monitoring | ✅ |
| Auto-restart on Crash | ✅ |
| Admin Alerts | ✅ |

---

## 📝 Remaining TODOs (Future)

- [ ] Add subscription/payment system (Stripe)
- [ ] Add Google Analytics OAuth integration
- [ ] Add Google Search Console OAuth integration
- [ ] Add user metrics dashboard
- [ ] Add container resource graphs
- [ ] Multi-VPS support for scaling
