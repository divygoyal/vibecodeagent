# TrafficClaw Marketplace Plan

Turning the verified-traffic leaderboard into an advertising marketplace.

**Hard constraint: this plan is purely additive.** Nothing is deleted, no route is removed, no
column is dropped, no existing behaviour changes. The leaderboard stays exactly as it is and keeps
working. Every phase either adds a file, adds a table, adds a column, or adds a route.

---

## 1. Why this works

Every field needed to price an ad slot is already on `StartupProfileData` in
`web/src/app/(marketing)/leaderboard/[id]/StartupProfileClient.tsx`:

`monthly_visitors`, `monthly_pageviews`, `engagement_rate`, `bounce_rate`,
`avg_session_duration`, `visitor_trend`, `primary_country`, `category`, `verification_status`,
plus 30 days of `history[]`.

That means Phase 1 ships a priced, sellable rate card on every existing entry with **no migration,
no admin API change, and no cron change**. One pure function and one new page.

### What already exists and is reused untouched

| Asset | Location | Reused for |
|---|---|---|
| GA4 domain-match verification | `web/src/lib/leaderboardVerify.ts` | Trust tier |
| Google OAuth + refresh | `web/src/lib/googleApi.ts` | Unchanged |
| GA4 metric pull + 30d backfill | `web/src/app/api/cron/leaderboard-refresh/route.ts` | Pricing inputs |
| Umami provisioning + stats | `web/src/lib/umamiClient.ts` | Tier 3, later cross-verification |
| Tokenised analytics sharing | `web/src/app/api/share/[token]/umami/*` | Buyer-facing proof |
| Badge endpoint | `web/src/app/api/badges/[id]/route.ts` | Free deliverable |
| Generated OG images | `leaderboard/[id]/opengraph-image.tsx` | Model for `/sites` OG |
| Generic OAuth store | `oauth_connections` table (`provider`, `access_token`, …) | Phase 6 credentials |
| Payments | `dodopayments` | Phase 4 escrow |
| Redis | `@upstash/redis` | Rate limits, decision cache |

### Namespace check (done)

- `/sites` and `/advertise` are **free** under `web/src/app/(marketing)/`. Only `app/api/seo/sites`
  exists, which is an unrelated API route.
- Highest migration is `016_add_weekly_digests.sql`, so new migrations start at **017**.

---

## 2. Architecture decision: add `/sites/[domain]`, keep `/leaderboard/*`

Do **not** rename or redirect the leaderboard routes. Instead add a second, purpose-built route.

```
/leaderboard                      → unchanged (the ranking)
/leaderboard/[id]                 → unchanged (rank, trend, sparkline, history)
/sites/[domain]                   → NEW: audience + inventory + rate card
/advertise                        → NEW: buyer-facing index of available inventory
```

The two profile routes serve different intents, so they get different content:

- `/leaderboard/[slug]` answers *how is this site ranked and trending* — keep it as-is.
- `/sites/[domain]` answers *who visits this site and what does a slot cost* — the new surface.

**Duplicate-content handling, without removing anything.** `/sites/[domain]` is the canonical
profile. `/leaderboard/[slug]` keeps returning 200 and keeps its own layout, but its
`generateMetadata` gains `alternates.canonical` pointing at `/sites/[domain]`, plus a visible link
("See advertising rates →"). No 301, no removal, and ranking signals consolidate on the new URL.

Why the domain in the URL: nobody searches `antigravity-codes-a3f9b2`, but people search the bare
domain, and `advertise on <domain>` / `<domain> traffic` are the queries with buying intent.
Resolve the domain from `leaderboard_entries.website_url` via the existing `normalizeHost` helper
in `admin/main.py`.

---

## 3. Phase 1 — Auto rate card (no migrations)

**Goal:** every verified entry gets a priced rate card, generated algorithmically. No publisher has
to do anything, so the marketplace looks populated on the first deploy.

### 3.1 New file: `web/src/lib/rateCard.ts`

Pure module, no I/O, no imports beyond types. Fully unit-testable.

```
computeRateCard(entry: RateCardInput): RateCardSlot[]
```

**Formula**

```
impressions(format) = monthly_pageviews × share(format)
effectiveCpm        = baseCpm(category)
                    × engagementMult(engagement_rate)
                    × geoMult(primary_country)
                    × tierMult(verification_status)
price(format)       = (impressions / 1000) × effectiveCpm × positionMult(format)
```

**Format table**

| Format | `share` | `positionMult` | Notes |
|---|---|---|---|
| `header` | 1.00 | 1.15 | Site-wide strip, one per site |
| `sidebar` | 0.85 | 1.00 | Baseline unit |
| `content` | 0.55 | 1.35 | In-article native |
| `featured` | 0.30 | 1.60 | Directory / board rows only |
| `badge` | 1.00 | 0 | **Always free.** Zero-risk first deal |

**Multipliers**

| Input | Bands |
|---|---|
| `baseCpm` by category | AI/dev tools 5.0 · directory/launch 4.0 · design 3.5 · blog/tutorial 2.5 · novelty 1.5 |
| `engagementMult` | ≥60% → 1.25 · 40–60% → 1.00 · 25–40% → 0.80 · <25% → 0.60 |
| `geoMult` | US/UK/DE/CA/AU → 1.30 · EU other/JP/SG → 1.10 · IN/BR/ID/NG → 0.70 · other → 0.90 |
| `tierMult` | cross-verified → 1.15 · script-measured → 1.05 · single-source → 1.00 |

**Rounding and floors**

- Under $100 → nearest $5. At/above $100 → nearest $10.
- Hard floor $15 per paid slot; below that the transaction overhead exceeds the revenue.
- `badge` is always $0.
- If `verification_status !== 'verified'`, return the card with `available: false` and no prices.

**Launch discount.** Export `FOUNDING_RATE_MULTIPLIER = 0.4` and apply it at render time, not
inside the formula, with a visible end date. The median Outbid bid was $5 and roughly 75% of those
advertisers spent $10 or less — the formula yields a defensible ceiling, not a clearing price. A
slot that sells at $45 teaches more than one listed at $110 that never sells.

### 3.2 New route: `web/src/app/(marketing)/sites/[domain]/page.tsx`

Server component, mirrors the existing `leaderboard/[id]/page.tsx` shape:

- Reuse `fetchEntry()` logic but resolve by domain (Phase 1 can fetch the list endpoint and match
  on normalised host, avoiding any admin API change; Phase 2 adds a proper endpoint).
- `next: { revalidate: 300 }` — same 5-minute ISR as today.
- `generateMetadata`:
  - Title: `{startup_name} ({domain}) — advertising slots & rates · TrafficClaw`
  - Description: `{startup_name}: {visitors} verified monthly visits, {primary_country}, {category} audience. Slots from ${floor}/mo — money in escrow.`
  - `alternates.canonical` → `/sites/{domain}`
- JSON-LD: keep the existing `WebPage` + `Organization` nodes, and **add** an `Offer` node per
  available slot with `price`, `priceCurrency`, `availability`.

### 3.3 New components under `web/src/app/(marketing)/sites/[domain]/`

`StartupProfileClient.tsx` is already 638 lines — do not extend it. Build fresh, small components
and import the existing presentational helpers where they are exported (`VerificationBadge`,
`SectionLabel`, `DetailRow`, `formatNumber`, `formatDuration`); copy them into a shared
`web/src/components/sites/` module if they are currently file-local.

| Component | Job |
|---|---|
| `SiteIdentityCard.tsx` | Left column: screenshot/favicon, domain, verified visits, tier badge |
| `AudienceBlock.tsx` | "Who visits this site": country, device, referrer mix, engagement |
| `RateCard.tsx` | Sticky right column: format checkboxes, prices, running total, CTA |
| `TrustBullets.tsx` | Verified traffic · escrow · benchmarked · pro-rata refund |

**Rate card behaviour in Phase 1:** checkboxes and running total are fully interactive client-side,
but the CTA opens the intent form (Phase 2). No checkout, no cart persistence.

### 3.4 Additive edits to existing files

| File | Edit | Removal risk |
|---|---|---|
| `leaderboard/[id]/page.tsx` | Add `alternates.canonical` → `/sites/{domain}`; add `Offer` JSON-LD | None — additions only |
| `leaderboard/[id]/StartupProfileClient.tsx` | Add one "See advertising rates →" link | None |
| `leaderboard/page.tsx` | Add a `from $X/mo` column to the table | None — new column |
| `web/src/app/sitemap.ts` | Add `/sites/{domain}` entries | None |

### 3.5 Phase 1 acceptance

- Every verified entry renders a rate card with a floor ≥ $15 and a free badge row.
- `/sites/{domain}` returns 200; unknown or unverified domains return 404 (matching the current
  `/detail` behaviour, which deliberately 404s unverified entries).
- Lighthouse on `/sites/{domain}` is no worse than on `/leaderboard/{slug}`.
- `computeRateCard` has unit tests covering each multiplier band, the $15 floor, and the
  unverified path.

---

## 4. Phase 2 — Intent capture and the demand gate

**Goal:** find out whether anyone will pay, before building inventory management.

### 4.1 Migration `admin/migrations/017_add_advertise_intents.sql`

```sql
-- Buyer intent captured from the /sites/{domain} rate card. Pre-checkout:
-- no money moves, this is a qualified lead with a price snapshot attached.
CREATE TABLE IF NOT EXISTS advertise_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER,
    domain VARCHAR(255),
    advertiser_email VARCHAR(255) NOT NULL,
    advertiser_site VARCHAR(500),
    selected_formats TEXT,            -- JSON array of format ids
    quoted_total_cents INTEGER,       -- snapshot of the price shown, for audit
    budget_band VARCHAR(30),
    message TEXT,
    source_path VARCHAR(255),
    status VARCHAR(20) DEFAULT 'new', -- new | contacted | won | lost
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_advertise_intents_entry_id ON advertise_intents(entry_id);
CREATE INDEX IF NOT EXISTS idx_advertise_intents_created_at ON advertise_intents(created_at);
```

Add the equivalent idempotent `CREATE TABLE IF NOT EXISTS` to `admin/main.py:init_db()`, matching
the pattern used by migrations 010–016.

### 4.2 New endpoints

| Endpoint | Where | Notes |
|---|---|---|
| `POST /api/advertise-intent` | `web/src/app/api/advertise-intent/route.ts` | Rate-limit by IP via Upstash. Validate email. Forward to admin API |
| `POST /api/advertise-intents` | `admin/main.py` | Insert row, return id |
| `GET /api/advertise-intents` | `admin/main.py` | Superadmin list view |
| `GET /api/sites/{domain}/profile` | `admin/main.py` | Proper domain lookup, so Phase 1's list-matching shim can be dropped |

Surface the intent list in the existing `web/src/app/superadmin/page.tsx` as a new tab. Notify by
email using the existing welcome-email path, or a webhook.

### 4.3 Gate — honour this

Run Phase 2 for four weeks with no further building.

**Pass:** 30+ intents, or 5+ with a stated budget over $100.
**Fail:** stop. If nobody clicks on pages that already rank and cost nothing to serve, paid
inventory will not fix it. Revisit positioning, not plumbing.

---

## 5. Phase 3 — Publisher inventory override

Only build once Phase 2 passes.

### 5.1 Migration `018_add_site_inventory.sql`

```sql
-- Per-entry inventory. A missing row means "use the computed auto price".
CREATE TABLE IF NOT EXISTS site_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    format VARCHAR(30) NOT NULL,        -- header|sidebar|content|featured|newsletter|badge
    enabled BOOLEAN DEFAULT 1,
    price_cents INTEGER,                -- NULL = inherit auto price
    auto_price_cents INTEGER,           -- last computed suggestion, for diffing
    max_concurrent INTEGER DEFAULT 1,
    placement_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entry_id, format),
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_inventory_entry_id ON site_inventory(entry_id);
```

`rateCard.ts` gains an optional `overrides` argument. Resolution order: `price_cents` →
`auto_price_cents` → freshly computed. Nothing about Phase 1 breaks when the table is empty.

### 5.2 New dashboard surface

`web/src/app/(dashboard)/dashboard/settings/InventoryEditor.tsx`, mounted on the existing settings
page next to `LeaderboardOptIn.tsx`. Per format: enable toggle, price input pre-filled with the
suggestion, and a suggested range shown alongside — "sites your size charge $40–90". Publishers do
not know what to charge; telling them is the single highest-value thing this screen does.

**Gate:** 20+ publishers accept or set a rate card. If publishers will not price their own
inventory, that is a supply problem and checkout will not solve it.

---

## 6. Phase 4 — Orders, escrow, delivery verification

First irreversible step, because real money moves.

### 6.1 Datastore split

Keep SQLite as the system of record for the leaderboard and metrics — do not migrate it. **Add**
Postgres for money only: `orders`, `order_items`, `escrow_holds`, `ledger_entries`, `payouts`.
Clean boundary, additive, and the ledger gets real transactions and constraints.

### 6.2 Flow

1. **Book** — buyer selects slots, pays via Dodopayments into escrow. Nothing paid out.
2. **Install** — publisher pastes the creative, or the tag from Phase 5.
3. **Verify live** — a new cron (`app/api/cron/verify-placements/route.ts`) fetches the page with
   `cheerio` (already a dependency), asserts the creative is present, and screenshots it.
4. **Release** — escrow opens on first successful verification.
5. **Monitor** — daily re-crawl for the booked window; a missing creative pauses accrual.
6. **Settle** — payout at window end, after the fraud and composition sweep.

**Publish the dispute rule before taking the first payment:** under 80% of the promised window
delivered triggers an automatic pro-rata refund. Buyers will not send money to strangers without
knowing the failure case.

---

## 7. Phase 5 — Measurement tag

One tag, six jobs: render ads, measure traffic independently, prove delivery via
`IntersectionObserver`, profile the audience, score composition, and serve the badge.

**The important consequence:** `app/api/leaderboard/join/route.ts` currently hard-rejects any entry
without `ga_property_id` ("Pick a Google Analytics property — we need it to verify your traffic").
Once the tag exists, a publisher can install one line and be verified without connecting Google at
all. Relax that check to accept *any* verified source — additive, since GA4 keeps working exactly
as it does now and simply stops being mandatory.

**Budget, treated as hard limits.** Under 8KB gzipped, vanilla, `async`, zero CLS via reserved
`aspect-ratio` boxes, one batched decision request for all slots, events via `navigator.sendBeacon`,
cookieless with a daily-rotating salted hash for dedupe only.

**Endpoints** (Cloudflare Worker + KV, never a Next.js route — cold starts are visible on a
publisher's page):

| Route | Purpose |
|---|---|
| `GET /s/v1.js` | Thin loader; immutable versioned bundle behind it |
| `POST /d` | Decision: site id + declared slots → creatives + signed click tokens |
| `POST /e` | Batched events: pageview, viewable, dwell |
| `GET /c/{token}` | Single-use click redirect, appends `?ref=trafficclaw` |
| `GET /b/{siteId}.svg` | Badge |

Tag shape, modelled on the TinyAdz tag:

```html
<script src="https://cdn.trafficclaw.com/s/v1.js"
        data-site-id="6a9864e8a0df20b6bca2f97c"
        data-test-mode="false" async></script>
```

Slots are declared with `<div data-tc-slot="sidebar">`. Support `data-test-mode="true"` to render
demo creatives on localhost — it removes the biggest onboarding drop-off, since a publisher can
integrate and see it work before any approval.

**Ship measurement before ad rendering.** A measurement-only tag needs no advertisers, no escrow
and no creative pipeline, and it already makes every install a listable verified site.

---

## 8. Phase 6 — Additional analytics providers

Extend the existing `oauth_connections` table rather than creating a new one — it already has
`provider`, `provider_account_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, and the
`serialize_provider` / `has_connected_oauth_provider` helpers in `admin/main.py`. API-key providers
store the key in `access_token`.

Order by effort. After Google, every provider worth adding uses a plain API key, so there is no
consent-screen review to wait on:

| Provider | Auth | Effort | Note |
|---|---|---|---|
| GA4 | OAuth | done | Unchanged |
| Search Console | OAuth | done | Adds the query set for audience inference |
| Umami | provisioned | done | Already tier 3 via `umamiClient.ts` |
| Plausible | API key | ~0.5 day | Stats API returns the site domain |
| Cloudflare Web Analytics | API token | ~1 day | GraphQL; large free-tier install base |
| PostHog | project key | ~1–2 days | Strong with AI and dev-tool builders |
| Fathom | API token | ~0.5 day | Small, privacy-focused audience |
| Vercel Analytics | — | skip | No usable public read API |

**Every adapter must echo back a hostname** that is matched against the claimed domain, using the
same logic as `verifyPropertyDomain`. A pasted API key proves access to some project, not ownership
of this site.

### Verification tiers

Widen the existing `verification_status` into a tier plus a confidence score. Current values
(`verified | host_mismatch | no_web_stream | no_website_url | failed | pending`) already think in
gradations, so this is an extension rather than a rewrite. Add via `ALTER TABLE ADD COLUMN` —
`verification_tier INTEGER`, `confidence_score REAL` — leaving `verification_status` in place and
populated.

| Tier | Meaning |
|---|---|
| T2 | One provider, read-only, reported host matches |
| T3 | Independently measured by a script you provision |
| T4 | Two independent sources agreeing within tolerance |

T4 is the defensible one. GA4 undercounts because ad blockers strip it; first-party analytics
overcounts because bots are not filtered. Agreement between two sources is a stronger claim than
either alone, and disagreement beyond about 40% is itself a fraud signal.

---

## 9. Composition score — ship with Phase 1, not later

Verified is not the same as valuable. Someone buys $50 of junk traffic, GA4 reports it faithfully,
and the badge certifies it. Show a composition score beside every verified number from the first
deploy.

| Signal | Catches |
|---|---|
| Traffic source mix | 90%+ direct with no referrers is the bought-traffic signature |
| Bounce + session duration | Sub-2s sessions at 95% bounce means nobody read anything |
| Country concentration | One unexpected country dominating a niche B2B site |
| Returning visitor share | Real audiences come back; purchased traffic never does |
| Growth shape | Step-function jumps rather than a curve |
| Source disagreement | Two sources diverging by more than ~40% |

Bounce rate, session duration and `visitor_trend` are already in `leaderboard_stats_history`, so
most of this is computable today.

---

## 10. Sequence and gates

| Phase | Ships | Data cost | Gate to proceed |
|---|---|---|---|
| 1 | Auto rate card, `/sites/[domain]`, composition score | none | — |
| 2 | Intent capture, demand test | migration 017 | 30 intents, or 5 over $100 |
| 3 | Publisher price override | migration 018 | 20 publishers set a card |
| 4 | Escrow, orders, delivery cron | Postgres | 10 orders, no disputes |
| 5 | Measurement tag | Worker + KV | — |
| 6 | Plausible, Cloudflare, PostHog | extend `oauth_connections` | — |

Everything before Phase 4 is reversible and cheap to discard. Moving money is the first
irreversible commitment.

---

## 11. Explicitly not doing

- **Bidding or auctions.** With single-threaded demand an auction just means everyone pays the
  reserve. Publisher ask price *is* the mechanism. Revisit only when specific slots get
  oversubscribed, then second-price on those slots only.
- **Cost-per-click pricing.** At $0.80 per click paid to a publisher, self-clicking is instantly
  profitable, and CPC pays roughly $1.60–8 effective CPM against the $30 a direct sponsor pays.
  Flat slots remove the fraud surface entirely and pay publishers far better.
- **A second website.** The leaderboard pages already exist and already rank.
- **Removing or redirecting `/leaderboard/*`.** Canonical tags consolidate the ranking signal
  without touching the route.
- **Migrating the leaderboard off SQLite.** Only money tables go to Postgres.

---

## 12. Revenue expectation — read this before starting

The marketplace take is not the business. TrustMRR tracks 205 advertising platforms doing roughly
$114K over 30 days between them — about $556/month each. The median Outbid bid was $5, and 617 of
828 advertisers spent $10 or less. A 15% cut of a market that size will not pay well for years.

What is worth a lot: **nobody reaches the verified leaderboard without connecting analytics, which
is the same action the paid SEO product requires.** The leaderboard is the best-qualified top of
funnel in the product, and the marketplace is what makes publishers keep coming back to it.

This gives one test for every roadmap argument: *does this cause more analytics connections?*
Free badge — yes. Public site profiles — yes. Bidding engine — no. Optimise connections, not GMV.
