# 01 - TrafficClaw: Current Feature Catalog

> **Purpose:** Complete inventory of what TrafficClaw already ships, organized by module. This serves as the baseline for gap analysis against competitors and user pain points.

---

## Platform Overview

TrafficClaw is a multi-service AI-powered SEO & Analytics platform built on:

- **Next.js 16** (React 19, TypeScript 5) web dashboard
- **FastAPI** admin API (Python, async SQLAlchemy 2.0 + SQLite)
- **Docker Compose** orchestration (6 services)
- **Coolify + Traefik** production deployment at `trafficclaw.com`

### Architecture at a Glance

| Component | Tech | Purpose |
|-----------|------|---------|
| `web/` | Next.js 16 | Primary dashboard & marketing site |
| `admin/` | FastAPI | User management, OAuth, container orchestration |
| `plugins/` | Node.js | Google Analytics, GSC, GitHub integrations |
| `clawbot/` | Docker | Per-user isolated AI bot containers |
| `picoclaw/` | Docker | Lightweight container variant |
| `nginx/` | Nginx | Reverse proxy (dev) |
| Nanobot | Docker | LLM fallback wrapper |

**Service startup order:** admin-api (healthcheck) -> watchdog + web -> nginx

---

## 1. Analytics Suite (10 Pages)

### 1.1 Main Analytics Dashboard
- **File:** `web/src/app/(dashboard)/dashboard/analytics/page.tsx`
- Overview metrics: sessions, users, pageviews, bounce rate, avg session duration
- Time-series charts with date range picker
- Traffic source breakdown
- Top pages table
- Device/browser/OS distribution
- Geographic distribution

### 1.2 Realtime Analytics + 3D Globe
- **Files:** `web/src/app/(dashboard)/dashboard/analytics/realtime/page.tsx`, `web/src/app/(dashboard)/dashboard/globe/page.tsx`
- Live active users count
- Real-time pageview stream
- Interactive 3D globe visualization (Cobe + Mapbox)
- Live activity feed with visitor locations
- Embeddable public realtime globe (authenticated via embed tokens)
- **API:** `api/analytics/realtime`, `api/embed/realtime`, `api/embed/tokens`

### 1.3 Events Tracking
- **File:** `web/src/app/(dashboard)/dashboard/analytics/events/page.tsx`
- GA4 event listing and filtering
- Event count trends over time
- Custom event parameter breakdown

### 1.4 Funnel Analysis
- **File:** `web/src/app/(dashboard)/dashboard/analytics/funnels/page.tsx`
- Multi-step funnel visualization
- Drop-off rates between steps
- Conversion rate calculation

### 1.5 Goals Tracking
- **File:** `web/src/app/(dashboard)/dashboard/analytics/goals/page.tsx`
- Goal completion tracking
- Goal value attribution
- Progress indicators

### 1.6 User Journeys
- **File:** `web/src/app/(dashboard)/dashboard/analytics/journeys/page.tsx`
- Path analysis / user flow visualization
- Entry and exit page identification
- Common navigation patterns

### 1.7 Pages Analytics
- **File:** `web/src/app/(dashboard)/dashboard/analytics/pages/page.tsx`
- Per-page metrics (views, time on page, bounce rate)
- Content performance ranking
- Landing page analysis

### 1.8 Performance (Core Web Vitals)
- **File:** `web/src/app/(dashboard)/dashboard/analytics/performance/page.tsx`
- LCP (Largest Contentful Paint)
- FID/INP (Interaction to Next Paint)
- CLS (Cumulative Layout Shift)
- TTFB (Time to First Byte)
- Per-page performance breakdown

### 1.9 Retention Cohorts
- **File:** `web/src/app/(dashboard)/dashboard/analytics/retention/page.tsx`
- Cohort analysis grid
- Week-over-week / month-over-month retention
- User return rate visualization

### 1.10 Sessions
- **File:** `web/src/app/(dashboard)/dashboard/analytics/sessions/page.tsx`
- Session-level analytics
- Session duration distribution
- Sessions by source/medium

---

## 2. SEO Intelligence

### 2.1 Main SEO Dashboard
- **File:** `web/src/app/(dashboard)/dashboard/seo/page.tsx`
- Google Search Console integration
- Keyword performance (clicks, impressions, CTR, position)
- Query-level data with filtering
- AI-powered SEO recommendations
- Zombie page monitor (identifies underperforming content)
- Mobile gap widget (mobile vs desktop performance)
- Search intent badges (informational, navigational, transactional, commercial)
- Annotation system for marking events

### 2.2 SEO Opportunities
- **File:** `web/src/app/(dashboard)/dashboard/opportunities/page.tsx`
- AI-identified optimization opportunities
- Quick wins and high-impact recommendations
- Priority scoring

---

## 3. SEO Robot Tools (AI-Powered)

**API:** `api/seo-tools`

| Tool | Description |
|------|-------------|
| **AI Blog Writer** | Generates SEO-optimized blog content |
| **Auto Keyword Research** | AI-powered keyword discovery and analysis |
| **AI Smart Linking** | Internal linking suggestions with AI |
| **Schema Generator** | Structured data for 8 schema types (Article, Product, FAQ, HowTo, LocalBusiness, Event, Recipe, Organization) |

---

## 4. Site Audit System

- **File:** `web/src/lib/siteAudit.ts`
- **API:** `api/audit`
- **55+ automated checks** across 14 categories:

| Category | Examples |
|----------|---------|
| Meta Tags | Title length, description, viewport, canonical |
| Headings | H1 presence, hierarchy, keyword usage |
| Content | Word count, keyword density, readability |
| Images | Alt text, dimensions, compression |
| Links | Broken links, nofollow audit, anchor text |
| Performance | Page size, request count, render-blocking resources |
| Mobile | Responsive meta, touch targets, font sizing |
| Security | HTTPS, mixed content, HSTS |
| Social | Open Graph, Twitter Cards |
| Structured Data | Schema.org validation |
| Accessibility | ARIA labels, color contrast, form labels |
| Technical | Robots.txt, sitemap, 404 handling |
| Core Web Vitals | LCP, CLS, INP thresholds |
| Indexability | Noindex, canonical conflicts, redirect chains |

- "Fix with Bot" integration: connects audit findings to ClawBot for automated fixes
- Severity levels: Critical, Warning, Info, Pass
- Per-check scoring and overall site health score

---

## 5. AI Chatbot (Gemini Function Calling)

- **Files:** `web/src/app/api/ai-chat/route.ts`, `web/src/services/aiChatTools.ts`, `web/src/components/AIChatbot.tsx`
- **Full-page mode:** `web/src/app/(dashboard)/dashboard/ai-chat/page.tsx`
- **SSE streaming** responses
- **12 function-calling tools:**

| Tool | Purpose |
|------|---------|
| `get_search_performance` | GSC query data (clicks, impressions, CTR, position) |
| `run_ga4_report` | Custom GA4 reports with dimensions/metrics |
| `run_realtime_report` | Live GA4 realtime data |
| `get_custom_dimensions` | GA4 custom dimension listing |
| `run_page_audit` | On-demand page audit via URL |
| `calculate_revenue_impact` | Revenue impact estimation from SEO changes |
| `generate_content_strategy` | AI content strategy based on data |
| `analyze_keyword_clusters` | Group keywords by topic clusters |
| `compare_time_periods` | Period-over-period performance comparison |
| `find_cannibalization` | Detect keyword cannibalization across pages |
| `suggest_internal_links` | AI-powered internal linking suggestions |
| `generate_meta_tags` | Generate optimized title/description |

- Dashboard data (GA4 + GSC) injected into system prompt as context
- Max 2 tool calls per conversation, max 3 loop iterations
- Message credit system tied to subscription tier

---

## 6. Alert & Anomaly System

- **File:** `web/src/lib/alertEngine.ts`
- **API:** `api/alerts`, `api/cron/daily-alerts`
- **9 alert types:**

| Alert Type | Trigger |
|------------|---------|
| Traffic Drop | Significant decrease in sessions/users |
| Traffic Spike | Unusual increase in traffic |
| Ranking Drop | Keyword position decline |
| Ranking Gain | Keyword position improvement |
| Crawl Error | New crawl errors detected |
| Indexing Issue | Pages dropped from index |
| Core Web Vitals | Performance threshold breached |
| Security | Security issues detected |
| Goal Completion | Goal metrics change significantly |

- Daily cron job for scheduled alert computation
- Push notification support (`web/src/lib/pushNotifications.ts`)

---

## 7. Telegram Bot (Per-User Containers)

- **Files:** `web/src/app/(dashboard)/dashboard/bot/page.tsx`, `admin/docker_manager.py`
- **API:** `api/container`, `api/setup-bot`, `api/provision`
- Per-user isolated Docker containers running OpenClaw agent
- Nanobot LLM fallback wrapper
- Container lifecycle management (create, start, stop, destroy)
- Watchdog health monitoring with auto-restart
- Telegram alerts for admin on container issues
- Resource limits per subscription tier (RAM, CPU)

---

## 8. Domain Overview

- **API:** `api/domain-overview`
- SEMrush-style domain analysis
- Domain authority metrics
- Backlink overview
- Organic keyword estimates
- Traffic estimates

---

## 9. Public / Marketing Features

### 9.1 5 Free SEO Tools
- Public-facing SEO tools (no login required)
- Lead generation / conversion funnel to paid product

### 9.2 Startup Leaderboard
- Community feature for startup visibility
- Ranking system

### 9.3 Landing Pages
- **Files:** `web/src/app/(marketing)/` route group
- Marketing site with feature descriptions
- Pricing page
- Contact form (`api/contact`)

---

## 10. Subscription & Billing

- **API:** `api/subscription`, `api/credits`, `api/webhooks/dodo`
- **Payment processor:** DodoPayments
- **Tiers:**

| Tier | Price | Key Limits |
|------|-------|------------|
| Free | $0 | Basic access, limited AI credits |
| Starter | $30/mo | Increased limits |
| Pro | $50/mo | Full access, highest limits |

- Message credit system for AI chatbot
- Referral system
- Webhook handling for payment events

---

## 11. Authentication & Multi-Provider OAuth

- **File:** `web/src/lib/auth.ts`
- **API:** `api/auth/register-provider`
- NextAuth.js with JWT strategy (30-day max age)
- **Providers:**

| Provider | Scopes | Purpose |
|----------|--------|---------|
| GitHub | `read:user user:email repo` | Primary login |
| Google | `analytics.readonly webmasters.readonly` | GA4 + GSC access |

- Multi-provider OAuth connections (`OAuthConnection` table)
- GitHub, Google, WordPress connections per user
- Token refresh via `getValidAccessToken()`
- No Next.js middleware; auth checked via `useSession()` and `getServerSession()`

---

## 12. Shared Dashboards & Embeds

- **API:** `api/embed/tokens`, `api/embed/realtime`
- Embeddable realtime globe widget
- Embed token CRUD (create, list, revoke)
- Public access without session (token-authenticated)

---

## 13. Admin & Superadmin

- **API:** `api/admin`, `api/superadmin`
- User management
- Container management
- OAuth connection management
- Usage logging
- Plugin execution (GA, GSC, GitHub plugins)

---

## 14. Infrastructure & DevOps

| Component | Details |
|-----------|---------|
| **Docker Compose** | 6 services on `clawbot-network` bridge |
| **Deployment** | Coolify + Traefik at `trafficclaw.com` |
| **Database** | SQLite via async SQLAlchemy + aiosqlite |
| **Caching** | In-memory TTL cache (`apiCache.ts`) |
| **State Management** | Zustand stores (analytics filters, chat) |
| **Data Fetching** | SWR with custom hooks (`useDashboardData`) |
| **Monitoring** | Watchdog service with Telegram alerts |
| **Scripts** | `deploy.sh`, `setup.sh`, `maintenance.sh`, `provision_user.py` |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Dashboard pages | 16 |
| API route files | 44 |
| AI chat tools | 12 |
| Audit checks | 55+ |
| Alert types | 9 |
| Schema types | 8 |
| Audit categories | 14 |
| OAuth providers | 2 (GitHub, Google) |
| Subscription tiers | 3 |
| Docker services | 6 |
| Node.js plugins | 3 |

---

*Last updated: April 2026*
*Source: Codebase analysis of `vibecodeagent/` repository*
