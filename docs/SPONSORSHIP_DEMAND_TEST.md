# Sponsorship demand test — 30 days

Companion to `MARKETPLACE_PLAN.md` (which is unchanged). That document plans the
whole marketplace; this one covers only what was built for the demand test, how
the numbers are derived, and how to run the first ten deals by hand.

**The gate: 3 paid sponsorships within 30 days, at any price.** Nothing further
gets built until that passes. Read it from
`GET /api/sponsorship/funnel?token=<superadmin>` → `paid_sponsorships`.

---

## 1. Why booking rather than an ad network

Kept here so it does not get relitigated.

TinyAdz already built the open ad network for small sites: 640 publisher
websites, ~350,000 ad views delivered lifetime — about **547 views per publisher,
ever**. Publishers joined in volume because joining is free and riskless.
Advertisers never arrived. Demand is the constrained side.

An ad network is *fragile* to low demand: empty slots make the publisher pull
the tag, supply shrinks, the network looks worse to buyers, demand falls
further. A booking marketplace is *robust* to it: an unsold listing just sits
there, and there is no tag to remove. Low demand is near-certain at the start,
so booking wins — at roughly a tenth of the engineering.

Verified GA4 data is also worth **more** in a booking marketplace, because a
buyer choosing one specific site is exactly the person who needs to trust that
site's numbers.

Market context: Paved takes 30% on bookings / 40% on network fill, lets
publishers set their own rates, and carries 2,000+ newsletters. Carbon Ads
requires 10,000 pageviews, pays only 60%, and forbids backfill. EthicalAds
requires 50,000 pageviews and grosses ~$60K/month across ~130 publishers.
Raptive dropped to 25,000 pageviews; Ezoic *raised* to 250,000 monthly users in
Feb 2026; Mediavine Journey is the lowest real bar at 1,000 sessions but demands
exclusivity.

---

## 2. The pricing formula

Source of truth: `web/src/lib/sponsorshipPricing.ts`. Pure, no I/O.

```
impressions   = monthly_pageviews × 0.85
qualityMult   = engagementMult × bounceMult × durationMult
effectiveCpm  = clamp(baseCpm(category) × qualityMult × geoMult, $2.00, $8.00)
grossMonthly  = (impressions / 1000) × effectiveCpm
suggested     = roundToBand(max(grossMonthly, $25))
```

| Input | Bands |
|---|---|
| `baseCpm` by category | Tool $4.50 · SaaS $4.00 · Agency $3.50 · E-commerce $3.00 · Blog $2.50 · other $3.00 |
| `engagement_rate` | ≥60% → 1.20 · 45–60% → 1.10 · 30–45% → 1.00 · 15–30% → 0.85 · <15% → 0.70 |
| `bounce_rate` | ≤30% → 1.10 · 30–55% → 1.00 · 55–75% → 0.90 · >75% → 0.80 |
| `avg_session_duration` | ≥3m → 1.15 · 90s–3m → 1.05 · 30–90s → 1.00 · <30s → 0.85 |
| `primary_country` | tier 1 → 1.25 · tier 2 → 1.05 · tier 3 → 0.70 · unclassified → 0.90 |
| `verification_status` | not `verified` → not sellable, no price shown |

**Why $2–8.** EthicalAds reports a real publisher CPM of ~$2.50 against a gross
of ~$6 — the closest analogue with actual transactions. $2.00 is what a weak
content site really earns per thousand impressions; $8.00 is a defensible
premium for a verified, engaged, tier-1 developer audience bought direct.
Outside that band the number is not defensible to a buyer, so the clamp stops
the multipliers compounding into fiction. When the clamp bites, `cpmClamped` is
set and the UI shows the pre-clamp figure.

**Floors.** $25 minimum per 30 days (below that the invoice costs more than the
deal) and no inventory under 1,000 monthly pageviews. When the floor sets the
price, `floorApplied` is true and the UI labels the listing as floor-priced,
because its implied CPM sits above the band.

**Splits.** TrafficClaw takes 15%, deliberately half of Paved's 30%. Founding
rate is 60% of list (a 40% discount), applied at render, never inside the
formula. Not lower: below ~0.6 the publisher's 85% share drops under the ~$2.50
EthicalAds actually pays.

**Publisher override.** `sponsorship_listings` row wins over the computed price.
A missing row means "use the computed price" — that is the steady state, and no
row should ever be inserted just to mirror a suggestion.

Verify the formula with `npm run check:pricing` in `web/` (58 assertions,
including a sweep proving the CPM band holds across 1,890 input combinations).

---

## 3. Budget allocation

Source of truth: `web/src/lib/sponsorshipAllocation.ts`. Pure and deterministic.

A sponsorship is one whole 30-day slot on one site at one price — a human places
one creative, so you cannot buy 40% of it. Allocation is therefore a **selection**
(0/1 knapsack), not a proportional split. Proportional weighting would produce
quotes nobody can fulfil.

1. Drop excluded, unpriced and paused candidates; each keeps a stated reason.
2. Take pinned (user-added) sites first, in strategy order, while they fit.
3. Greedy pass in strategy order while each fits and `maxSites` allows.
   - `reach` (default) sorts by impressions-per-dollar.
   - `spread` sorts by cheapest first, maximising distinct placements.
4. Top-up pass: fill leftover budget with the largest still-affordable site.

Exact knapsack is avoided on purpose — the buyer has to edit the plan, so the
ordering has to be explainable in one sentence per row. Ties break down to
`entryId` so the plan never reshuffles under the cursor.

**Reach is an upper bound.** Per-site impressions and visitors are summed and
never deduplicated; these audiences overlap and there is no cross-site identity
to dedupe with. Every surface says so.

---

## 4. Manual fulfilment runbook

There is no payment code. Do this by hand for the first ten deals.

1. **Request lands.** Advertiser, publisher and operator all get an email. Row
   is in `sponsorship_request_items` with `status = 'new'` and `notified_at` set.
2. **Reply within a day.** Speed is the only edge a two-person marketplace has.
3. **Publisher accepts, declines or counters** by email, directly with the
   advertiser. Record it:
   ```
   PATCH /api/sponsorship/funnel?token=<superadmin>
   { "itemId": 12, "status": "accepted" }
   ```
4. **Invoice the advertiser by hand** — Dodo payment link, Stripe invoice, bank
   transfer, whatever clears fastest.
5. **Money arrives.** This is the only event the gate counts:
   ```
   PATCH /api/sponsorship/funnel?token=<superadmin>
   { "itemId": 12, "status": "paid", "paidAmountCents": 4500 }
   ```
   `paid_at` is stamped server-side from the status. It cannot be set by writing
   a date, which is what keeps the gate honest.
6. **Publisher places the creative themselves.** No tag, no snippet, no embed.
   Then `{ "itemId": 12, "status": "live" }`.
7. **Pay the publisher 85% manually.** At ten deals a spreadsheet beats a
   payouts system.
8. **Day 30: read the gate.** `GET /api/sponsorship/funnel?token=...&requests=1`.
   Believe `paid_sponsorships`.

Valid item statuses: `new`, `contacted`, `accepted`, `declined`, `paid`, `live`,
`completed`, `lost`. The parent request's status is rolled up from its items on
every write (`new` → `contacted` → `partially_won` / `won` / `lost`).

### Environment

| Variable | Needed for |
|---|---|
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Both-party notification emails (already used elsewhere) |
| `SPONSORSHIP_OPERATOR_EMAIL` | Optional. Your copy of every request; falls back to `BREVO_SENDER_EMAIL` |
| `ADMIN_API_URL`, `ADMIN_API_KEY` | Already required |
| `NEXTAUTH_SECRET` | Already required; signs the superadmin token used by the funnel route |

---

## 5. Deliberately not built

No ad server, no tag, no real-time decisioning, no impression tracking, no fraud
pipeline, no payments, no escrow, no payouts, no auctions, no CPC pricing, no
advertiser accounts, no additional analytics providers, and no new per-site
route. `users.credits` is the AI chat counter and is untouched — when real money
arrives it gets its own append-only ledger where any balance is
`SUM(amount_cents)`.

Nothing existing was removed, renamed or redirected. `/leaderboard/*` is
unchanged and remains the one canonical page per site; `/advertise` is a new
index with its own canonical and no per-site children, so no duplicate-content
surface was created.
