# MEMORY.md

## Project Context
- **Project:** VibeCode Agent - Token-optimized AI Personal Assistant SaaS
- **Owner:** Divy Goyal
- **Domain:** `agent.divygoyal.in`
- **Repo:** `https://github.com/divygoyal/vibecodeagent`
- **Engine:** OpenClaw (https://github.com/openclaw/openclaw)

## Technical Stack
- **Backend:** OpenClaw in Docker containers (per-user isolation)
- **Frontend:** Next.js 16 with NextAuth.js
- **LLM:** Gemini API (1M TPM tier)
- **Interface:** Telegram (BYOB - Bring Your Own Bot)
- **Deployment:** Ubuntu VPS with Nginx reverse proxy

## Token Optimization (Critical)
Applied optimizations to stay within API limits:
- ✅ Heartbeat disabled (saves ~10K tokens/hour)
- ✅ Context limited to 32K tokens
- ✅ Aggressive session compaction
- ✅ Tool output truncation at 5K chars
- ✅ Model routing (fast/balanced/smart)
- ✅ GitHub Ghost plugin with 5-min cache
- ✅ Thinking/reasoning mode disabled

## Key Files
- `config/openclaw.json` - Token limits and model routing
- `scripts/provision_user.py` - User container provisioning
- `scripts/maintenance.sh` - Session cleanup cron job
- `plugins/github-ghost/index.js` - Cached GitHub integration

## History
- **2026-02-11:** Migration to new VPS, previous data lost
- **2026-02-12:** Token optimization overhaul completed
  - Reduced estimated daily usage by ~70%
  - Added self-deployment scripts for VPS
