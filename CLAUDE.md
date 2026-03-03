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
npx tsc --noEmit     # TypeScript type check (no eslint equivalent for types)
```

Full stack (from project root):
```bash
docker compose up --build     # All services: admin-api, web, watchdog, nginx
docker compose up web          # Web only
```

## Architecture

### Multi-Service Layout

```
vibecodeagent/
├── web/           # Next.js 16 dashboard (primary codebase)
├── admin/         # FastAPI admin API (Python, port 8000) — user CRUD, Docker mgmt, SQLite
├── clawbot/       # Custom OpenClaw container image
├── nginx/         # Reverse proxy config
├── scripts/       # Deployment scripts
└── docker-compose.yml
```

### Web App Structure (`web/src/`)

**App Router** with route groups:
- `app/(marketing)/` — Landing pages, public routes
- `app/(dashboard)/dashboard/` — Authenticated dashboard (analytics, seo, intelligence, audit, bot, settings)
- `app/api/` — API routes

**Key API routes:**
- `api/ai-chat` — AI chatbot with SSE streaming + Gemini function calling (the most complex route)
- `api/analytics` — GA4 data fetching
- `api/seo` — Google Search Console data
- `api/seo-tools` — AI-powered SEO tool generation (schema, blog, keywords, linking)
- `api/insights` — Auto-generated insights
- `api/credits` — Message credit system

**Code organization:**
- `services/` — Business logic: `aiChatTools.ts` (tool declarations + execution for Gemini), `siteAudit.ts`
- `lib/` — Shared utilities: `auth.ts` (NextAuth), `googleApi.ts` (OAuth tokens, GSC/GA4 APIs), `apiCache.ts` (in-memory TTL cache), `useDashboardData.ts` (SWR hook)
- `stores/` — Zustand stores: `analyticsFilterStore.ts` (dashboard filters)
- `components/` — React components: `AIChatbot.tsx` (chat UI with streaming)

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

### Communication Between Services

- Web → Admin API: REST calls using `ADMIN_API_URL` + `ADMIN_API_KEY` headers
- Web → Google APIs: Direct calls using user's OAuth tokens
- Web → Gemini: `@google/genai` SDK with `GEMINI_API_KEY`
- Admin API manages Docker containers for per-user ClawBot instances

## Tech Stack

- Next.js 16, React 19, TypeScript 5
- Tailwind CSS 4 (dark theme default, emerald/cyan accent colors)
- Zustand for client state, SWR for data fetching
- `@google/genai` SDK for Gemini API
- Framer Motion for animations, Recharts for charts, Lucide for icons

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

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
