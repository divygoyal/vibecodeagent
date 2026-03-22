# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawBot/TrafficClaw is a multi-service AI-powered SEO & Analytics platform. The primary development focus is the **`web/`** directory (Next.js dashboard). Other services (admin API, watchdog, nginx) are orchestrated via Docker Compose.

## Commands

All commands run from `web/`:

```bash
cd web
npm run dev          # Start Next.js dev server (port 3000)
npm run build        # Production build
npm run lint         # ESLint check
npx tsc --noEmit     # TypeScript type check
```

Full stack (from project root):
```bash
docker compose up --build     # All services: admin-api, web, watchdog, nginx
docker compose up web          # Web only
```

There is no test suite. No unit, integration, or E2E tests exist yet.

## Architecture

### Multi-Service Layout

```
vibecodeagent/
├── web/              # Next.js 16 dashboard (primary codebase)
├── admin/            # FastAPI admin API (Python, port 8000)
├── plugins/          # Node.js plugin packages (google-analytics, google-search-console, github-ghost)
├── clawbot/          # Custom OpenClaw container image
├── picoclaw/         # Picoclaw container image
├── nginx/            # Reverse proxy config
├── scripts/          # deploy.sh, setup.sh, maintenance.sh, provision_user.py
├── templates/        # OpenClaw config templates
├── config/           # Configuration files
├── docs/             # Documentation
├── Dockerfile.nanobot # Nanobot image build (LLM fallback wrapper)
└── docker-compose.yml
```

**Docker services:** admin-api, web, watchdog, nginx, `clawbot-image` (builder), `nanobot-image` (LLM fallback wrapper). Startup order: admin-api (must pass healthcheck) → watchdog + web → nginx. All services communicate over the `clawbot-network` bridge. Admin API mounts the Docker socket to manage per-user ClawBot containers.

**Production domain:** `trafficclaw.com` (deployed on Coolify with Traefik, NOT the nginx config in this repo)

### Web App Structure (`web/src/`)

**App Router** with route groups:
- `app/(marketing)/` — Landing pages, public routes
- `app/(dashboard)/dashboard/` — Authenticated dashboard (analytics, seo, intelligence, audit, bot, settings)
- `app/api/` — API routes

**Key API routes:**
- `api/ai-chat` — AI chatbot with SSE streaming + Gemini function calling (the most complex route)
- `api/analytics` — GA4 data fetching; `api/analytics/realtime` and `api/analytics/properties` sub-routes
- `api/seo` — Google Search Console data; `api/seo/sites` sub-route
- `api/seo-tools` — AI-powered SEO tool generation (schema, blog, keywords, linking)
- `api/admin` — Admin operations
- `api/alerts` — Anomaly alert system; `api/cron/daily-alerts` for scheduled runs
- `api/audit` — Site audit
- `api/contact` — Contact form
- `api/container` — User container management
- `api/credits` — Message credit system
- `api/domain-overview` — SEMrush-like domain overview
- `api/github` — GitHub integration
- `api/insights` — Auto-generated insights
- `api/provision` — User provisioning
- `api/setup-bot` — Bot setup
- `api/subscription` — Subscription management (cancel, etc.)
- `api/superadmin` — Superadmin operations
- `api/auth/register-provider` — Multi-provider OAuth registration
- `api/webhooks/dodo` — Payment webhook
- `api/embed/realtime` — Public (no session) embed realtime data, authenticated via embed token
- `api/embed/tokens` — Authenticated embed token CRUD (create, list, revoke)

**Code organization:**
- `services/` — Business logic: `aiChatTools.ts` (tool declarations + execution for Gemini)
- `lib/` — Shared utilities: `auth.ts` (NextAuth), `googleApi.ts` (OAuth tokens, GSC/GA4 APIs), `apiCache.ts` (in-memory TTL cache), `useDashboardData.ts` (SWR hook), `siteAudit.ts` (site audit logic), `chatUtils.ts`, `checkout.ts` (Dodo Payments checkout), `exportUtils.ts`, `github-auth.ts`, `pushNotifications.ts`, `urlValidation.ts`, `useKeyboardShortcuts.ts`, `alertEngine.ts`, `globeUtils.ts` (shared globe conversion: GA4 data → GlobeVisitor[] + activity feed)
- `stores/` — Zustand stores: `analyticsFilterStore.ts` (dashboard filters), `chatStore.ts` (chat state)
- `components/` — React components: `AIChatbot.tsx` (chat UI with streaming)
- `types/` — Types are colocated in their respective lib/service files, not centralized here

### Admin API (`admin/`)

FastAPI + Uvicorn with async SQLAlchemy 2.0 + aiosqlite (SQLite):
- `main.py` — All REST endpoints (user CRUD, OAuth connections, container management, plugin execution)
- `models.py` — SQLAlchemy models: `User`, `OAuthConnection`, `UsageLog`, `ContainerEvent`, `Alert`, `EmbedToken`
- `docker_manager.py` — Container lifecycle (create, start, stop, destroy per-user ClawBot instances)
- `watchdog.py` — Health monitoring service, auto-restarts unhealthy containers, Telegram alerts
- `alerts.py` — Alert engine
- `config.py` — Environment config

Database migrations are manual scripts in `admin/migrations/` (not Alembic).

### Plugin System (`plugins/`)

Self-contained Node.js packages that the admin API executes for complex operations:
- `google-analytics/` — GA4 data fetching
- `google-search-console/` — GSC data fetching
- `github-ghost/` — GitHub integration

Plugins follow a SKILL.md documentation format. They are pre-installed in the admin API Docker image.

### AI Chatbot Data Flow

The chatbot (`api/ai-chat`) is the most critical and complex route:

1. Dashboard data (GA4 + GSC) is injected into the system prompt as context
2. Gemini `generateContentStream` with function calling (5 tools: `get_search_performance`, `get_analytics_breakdown`, `run_page_audit`, `calculate_revenue_impact`, `generate_content_strategy`)
3. Streams responses via SSE (`data: {type, ...}\n\n`)
4. Tool calls are executed server-side, results sent back to Gemini for final response
5. Max 2 tool calls per conversation, max 3 loop iterations

**Critical**: When handling Gemini 3+ function calling, raw Part objects from `chunk.candidates[0].content.parts` must be preserved (including `thoughtSignature`). Never manually reconstruct function call parts — this strips the signature and causes 400 errors.

### Authentication

NextAuth.js with dual OAuth providers:
- **GitHub** — Primary login (`read:user user:email repo`)
- **Google** — Analytics/GSC access (`analytics.readonly webmasters.readonly`)
- JWT strategy with 30-day max age
- Google tokens stored in DB via admin API, refreshed via `getValidAccessToken()`
- Multi-provider OAuth: `OAuthConnection` table supports GitHub, Google, WordPress connections per user
- No Next.js middleware — auth is checked via `useSession()` client-side and `getServerSession()` in API routes

**CRITICAL — User Identity Mapping:**
- `session.user.id` (from `token.sub`) is the **OAuth provider ID** (GitHub ID string like `"12345678"`), NOT the database `User.id` (auto-increment integer like `1`, `2`, `3`)
- When calling admin API endpoints that need a user reference, always pass `session.user.id` as a **string identifier** and use `get_user_by_identifier()` on the admin side to resolve the actual DB user
- Never use `parseInt(session.user.id)` as a database user_id — it will silently create records with wrong foreign keys
- Pattern: Web sends GitHub ID string → Admin API resolves via `get_user_by_identifier(db, identifier)` → gets `User.id` for DB operations

### Communication Between Services

- Web → Admin API: REST calls using `ADMIN_API_URL` + `ADMIN_API_KEY` headers
- Web → Google APIs: Direct calls using user's OAuth tokens
- Web → Gemini: `@google/genai` SDK with `GEMINI_API_KEY`
- Admin API manages Docker containers for per-user ClawBot instances
- Admin API → Plugins: Executes Node.js plugin packages for data fetching

## Tech Stack

- Next.js 16, React 19, TypeScript 5
- Tailwind CSS 4 (dark theme default, emerald/cyan accent colors, CSS custom properties in `globals.css`)
- Zustand for client state, SWR for data fetching
- `@google/genai` SDK for Gemini API
- Framer Motion for animations, Recharts for charts, Lucide for icons
- `dodopayments` for payment processing, `cheerio` for HTML parsing (audits)
- `sonner` for toast notifications, `react-markdown` + `remark-gfm` for markdown rendering
- `mapbox-gl` for maps, `cobe` for globe visualization
- Admin: FastAPI, SQLAlchemy 2.0 (async), aiosqlite

## Subscription Tiers

- **Free** — Basic access with limited resources
- **Starter ($30/mo)** — Increased limits
- **Pro ($50/mo)** — Full access with highest resource limits

## Styling

Tailwind CSS 4 — no `tailwind.config.js` (uses CSS `@import` and `@theme` in `globals.css`). Dark theme is the default. Light theme is activated via `data-theme='light'` attribute. Color palette uses zinc-950 background with emerald/cyan accents. Font: Geist Sans/Mono.

## Environment Variables

Required for web development (in `web/.env.local`):
```
NEXTAUTH_SECRET=         # openssl rand -base64 32
NEXTAUTH_URL=            # http://localhost:3000
GOOGLE_CLIENT_ID=        # Google OAuth
GOOGLE_CLIENT_SECRET=
GITHUB_ID=               # GitHub OAuth
GITHUB_SECRET=
ADMIN_API_URL=           # http://localhost:8000
ADMIN_API_KEY=
GEMINI_API_KEY=          # from aistudio.google.com
```

Additional for production/Docker (in `.env`):
```
MAX_USERS=50
DEFAULT_RAM_LIMIT=256m
DEFAULT_CPU_LIMIT=0.25
DATA_DIR=/home/ubuntu/clawbot-data
ADMIN_TELEGRAM_BOT_TOKEN=    # Watchdog Telegram alerts
ADMIN_TELEGRAM_CHAT_ID=
HEALTH_CHECK_INTERVAL=60
MAX_RESTART_ATTEMPTS=3
```

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
