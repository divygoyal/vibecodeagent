-- Sponsorship booking marketplace — the 30-day demand test (MARKETPLACE_PLAN.md
-- appendix A). Purely additive: nothing existing is dropped, renamed or altered.
--
-- Three tables:
--   sponsorship_listings       publisher's own price / floor / availability
--   sponsorship_requests       one advertiser submission (may span many sites)
--   sponsorship_request_items  one site inside a submission, with its own status
--
-- The parent/child split exists because of the budget-allocation flow: an
-- advertiser enters one budget, the planner proposes N sites, and they submit a
-- single combined request. Conversion has to be tracked per site (site A says
-- yes, site B ghosts), so status lives on the item, not the request.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No money. No balance column, no credits, no escrow. `users.credits` is the AI
-- chat counter and must never be reused for sponsorship money. `paid_amount_cents`
-- below is a *record* of an invoice that was settled by hand outside the product,
-- written once when the operator confirms payment — it is not a balance and
-- nothing debits it. When real payments arrive they get their own append-only
-- ledger table where any balance is always SUM(amount_cents).
--
-- The Python models (admin/models.py: SponsorshipListing, SponsorshipRequest,
-- SponsorshipRequestItem) plus `Base.metadata.create_all` in init_db() will
-- create these automatically on boot, and init_db() also runs the same
-- CREATE TABLE IF NOT EXISTS statements explicitly. This file is the
-- source-of-truth recipe for documentation and fresh databases.


-- ============================================================================
-- 1. Publisher price override
-- ============================================================================
-- A MISSING ROW MEANS "use the computed auto price". That is the contract the
-- whole feature depends on: every verified entry is priced and bookable from
-- the first deploy without any publisher doing anything, and a publisher who
-- disagrees with the suggestion writes one row to override it.
--
-- price_cents  NULL -> inherit the computed suggestion.
-- floor_cents  advisory only. Shown to buyers as "will not go below"; nothing
--              in the code enforces it, because during manual fulfilment the
--              publisher is the one accepting or declining.
-- auto_price_cents_at_save  the suggestion at the moment the publisher saved,
--              so we can later tell whether publishers price above or below
--              our model. That single column is the answer to "is the formula
--              any good?" and it costs nothing to collect now.
CREATE TABLE IF NOT EXISTS sponsorship_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    price_cents INTEGER,                       -- NULL = use computed price
    floor_cents INTEGER,                       -- advisory minimum
    accepting_requests BOOLEAN NOT NULL DEFAULT 1,
    placement_note TEXT,                       -- "sidebar, above the fold"
    auto_price_cents_at_save INTEGER,          -- computed price when saved
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sponsorship_listing_entry UNIQUE (entry_id),
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sponsorship_listings_entry_id
    ON sponsorship_listings(entry_id);


-- ============================================================================
-- 2. Advertiser request (the parent)
-- ============================================================================
-- Pre-payment. This is a qualified lead with a price snapshot attached, not an
-- order. Snapshots matter: prices move when the daily GA4 refresh runs, and a
-- dispute six weeks later needs the number that was actually on screen.
CREATE TABLE IF NOT EXISTS sponsorship_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_email VARCHAR(255) NOT NULL,
    advertiser_name VARCHAR(120),
    advertiser_site VARCHAR(500),
    -- 'profile' = one site, submitted from /leaderboard/{id}
    -- 'budget'  = many sites, submitted from the /advertise planner
    source VARCHAR(20) NOT NULL DEFAULT 'profile',
    source_path VARCHAR(255),
    budget_cents INTEGER,                      -- what the advertiser said they had
    quoted_total_cents INTEGER NOT NULL DEFAULT 0,  -- sum of item snapshots
    site_count INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    -- new | contacted | partially_won | won | lost
    -- Rolled up from the items by the API; stored so the funnel query stays cheap.
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    ip_address VARCHAR(64),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_sponsorship_requests_created_at
    ON sponsorship_requests(created_at);
CREATE INDEX IF NOT EXISTS ix_sponsorship_requests_status
    ON sponsorship_requests(status);
CREATE INDEX IF NOT EXISTS ix_sponsorship_requests_email
    ON sponsorship_requests(advertiser_email);


-- ============================================================================
-- 3. One site inside a request (the child) — this is the conversion record
-- ============================================================================
-- The gate for the whole 30-day test is "3 paid sponsorships". This table is
-- where that is counted, so it carries the funnel timestamps from day one
-- rather than having them retro-fitted after the fact:
--
--   created_at    request arrived
--   notified_at   both parties emailed
--   responded_at  publisher first replied (accepted or declined)
--   paid_at       operator confirmed money received  <- THE GATE
--   live_at       creative actually visible on the publisher's site
--
-- price_cents_at_request is a snapshot, never recomputed.
CREATE TABLE IF NOT EXISTS sponsorship_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    entry_id INTEGER NOT NULL,
    -- Denormalised so an item still reads correctly if the entry is later
    -- renamed or deactivated. Manual fulfilment means humans read these rows.
    entry_name VARCHAR(150),
    entry_domain VARCHAR(255),
    price_cents_at_request INTEGER NOT NULL,
    -- 'publisher' (override row existed) | 'computed' (auto price)
    price_source VARCHAR(20) NOT NULL DEFAULT 'computed',
    estimated_impressions INTEGER,
    -- new | contacted | accepted | declined | paid | live | completed | lost
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    notified_at DATETIME,
    responded_at DATETIME,
    paid_at DATETIME,
    paid_amount_cents INTEGER,                 -- record of a manual invoice
    live_at DATETIME,
    operator_note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES sponsorship_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sponsorship_request_items_request_id
    ON sponsorship_request_items(request_id);
CREATE INDEX IF NOT EXISTS ix_sponsorship_request_items_entry_id
    ON sponsorship_request_items(entry_id);
CREATE INDEX IF NOT EXISTS ix_sponsorship_request_items_status
    ON sponsorship_request_items(status);
CREATE INDEX IF NOT EXISTS ix_sponsorship_request_items_paid_at
    ON sponsorship_request_items(paid_at);
