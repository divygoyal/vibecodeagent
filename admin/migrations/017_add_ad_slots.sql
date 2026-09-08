-- Publisher-defined ad slots + buyer requests.
--
-- Design rule that this schema exists to enforce: THE PUBLISHER SETS THE PRICE.
-- There is deliberately no derived, suggested, estimated or "recommended" price
-- column anywhere here, and nothing in the application computes one. `price_cents`
-- is exactly the number the publisher typed, multiplied by 100. The GA4 traffic
-- columns on leaderboard_entries are context shown next to a slot, never an input
-- to it.
--
-- A site has MANY slots, each in the publisher's own words at its own price:
--   "Header banner"      $50  per month
--   "Sidebar"            $30  per month
--   "Newsletter mention" $100 per newsletter send
--   "Footer logo"        $20  per month
--
-- The Python models (admin/models.py: AdSlot, AdSlotRequest) plus
-- `Base.metadata.create_all` in init_db() create these automatically on boot;
-- init_db() also runs the same CREATE TABLE IF NOT EXISTS statements explicitly.
-- This file is the source-of-truth recipe for fresh databases + documentation.

CREATE TABLE IF NOT EXISTS ad_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,              -- leaderboard_entries.id this slot belongs to
    user_id INTEGER NOT NULL,               -- denormalized owner, for cheap ownership checks

    -- 1. Name / type: free text, publisher's own words. No enum of ad types.
    name VARCHAR(120) NOT NULL,

    -- 2. Price: the plain amount the publisher entered, in integer cents.
    --    NOT computed. NOT suggested. NOT derived from traffic.
    price_cents INTEGER NOT NULL DEFAULT 0,

    -- 3. Billing period: month | week | newsletter_send | one_off
    billing_period VARCHAR(20) NOT NULL DEFAULT 'month',

    -- 4. Availability: how many of this slot exist, and how many are taken now.
    --    open = quantity_total - quantity_taken (computed for display only).
    quantity_total INTEGER NOT NULL DEFAULT 1,
    quantity_taken INTEGER NOT NULL DEFAULT 0,

    -- 5. Preview: screenshot of the placement and/or where on the page it sits.
    preview_image_url VARCHAR(500),
    preview_note TEXT,

    -- Pause selling without deleting the slot or losing its request history.
    is_active BOOLEAN NOT NULL DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ad_slots_entry_id ON ad_slots(entry_id);
CREATE INDEX IF NOT EXISTS ix_ad_slots_user_id ON ad_slots(user_id);


-- One row per buyer asking for ONE specific slot.
--
-- The *_at_request columns snapshot how the slot was advertised at the moment
-- the buyer hit send, so later edits by the publisher can never retroactively
-- change what was agreed. Fulfilment is manual: no ad server, no tag, no
-- payments, no escrow. status is just a hand-moved pipeline the publisher walks
-- to 'paid' so real closed deals can be counted.
CREATE TABLE IF NOT EXISTS ad_slot_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL,               -- which specific slot was requested
    entry_id INTEGER NOT NULL,              -- denormalized: the site
    publisher_user_id INTEGER NOT NULL,     -- denormalized: who owns the inbox

    -- Buyer contact + pitch
    buyer_name VARCHAR(120),
    buyer_email VARCHAR(255) NOT NULL,
    message TEXT,

    -- Snapshot of the listing as shown to the buyer
    slot_name_at_request VARCHAR(120),
    price_cents_at_request INTEGER NOT NULL DEFAULT 0,
    billing_period_at_request VARCHAR(20),

    -- new -> accepted -> paid, or declined / cancelled
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    publisher_note TEXT,                    -- private reply/notes on the deal
    paid_at DATETIME,                       -- stamped once status becomes 'paid'

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slot_id) REFERENCES ad_slots(id) ON DELETE CASCADE,
    FOREIGN KEY (entry_id) REFERENCES leaderboard_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_ad_slot_requests_slot_id ON ad_slot_requests(slot_id);
CREATE INDEX IF NOT EXISTS ix_ad_slot_requests_entry_id ON ad_slot_requests(entry_id);
CREATE INDEX IF NOT EXISTS ix_ad_slot_requests_publisher ON ad_slot_requests(publisher_user_id, created_at);
