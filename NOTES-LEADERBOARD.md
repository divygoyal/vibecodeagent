# Leaderboard notes (tc/leaderboard, worktree tc-leaderboard, dev instance `leaderboard` 3105/8105)

Specs: /root/projects/tc-redesign-research/{PRODUCT,DESIGN}.md (PRODUCT 3, DESIGN 5.12/5.18/5.19).
Screenshots go to /root/projects/tc-redesign-research/shots/leaderboard/.

## Decisions (keep)
- Migration 021 (019 mcp, 020 portfolio). Four new tables only: leaderboard_profiles (verification level/detail/
  checked_at, privacy_json, open_to_json, is_paused, gsc_site_url), leaderboard_daily, leaderboard_range_stats,
  leaderboard_inquiries. No change to leaderboard_entries, ad_slots, ad_slot_requests. Models at the bottom of
  admin/models.py, SQL in admin/migrations/021_leaderboard_v3.sql, idempotent DDL in admin/leaderboard_v3.py
  `ensure_schema` (called from init_db()).
- admin/leaderboard_core.py = pure privacy/ranking rules (unit tests: `python -m unittest admin.tests.test_leaderboard_core`
  from the repo root, kit venv). admin/leaderboard_v3.py = the /api/lb/* router (admin key only; web is the only caller),
  tested in admin/tests/test_leaderboard_v3_api.py (TestClient, throwaway SQLite).
- Legacy admin endpoints (/api/leaderboard list + detail, /api/sponsor-inventory) apply the same rules; ga_property_id and
  contact_email are never returned publicly any more.
- Verification: level owner (GSC siteOwner/siteFullUser covering the host via siteCoversHost) | ga4 | none. Only `owner`
  ranks. Legacy GA4-verified entries with no v3 check yet stay ranked ("grace") until their first check (daily cron).
  Superadmin verify = level owner + manual flag (auto checks never downgrade it). A check that cannot run (token, quota)
  never changes the level (transient_error).
- Privacy: per metric exact|range|hidden (visitors, clicks, pageviews, impressions, engagement), section toggles
  (countries, channels, devices, pages, queries), live opt-in. New listings: visitors+clicks exact, rest hidden/off.
  Entries with no profile row keep today's visibility (LEGACY_PRIVACY) until the owner saves settings; the in-app page
  shows a "review your privacy settings" banner for them. Range mode: band label only, charts are shape-only (0-100).
- Pending/unverified entries are never in lists; their direct URL shows a "Pending verification" shell with no numbers.
  Paused entries are 404. New listings from /dashboard/leaderboard start paused (draft) and go live on Publish.
- Offers: public contact form -> /api/leaderboard/[id]/inquiry (honeypot `website`, 5/h per IP, 30/day per site, admin caps
  20/day per site and 3/day per sender). Slot asks also create an ad_slot_request (mirrored once in the inbox).
- Sponsored strip/rows on the board = open ad slots from the existing inventory (labelled Sponsored, never ranked).

## Where things are
- Web libs: web/src/lib/leaderboard/* (types, constants, admin client, server fetchers, refresh, live, notify, owner helpers,
  ownership rules, badgeSvg, format), lib/leaderboardVerify.ts (checkOwnership), lib/sites/fetchInventory.ts (cherry-picked).
- API: /api/leaderboard (board), /api/leaderboard/[id] (profile), /[id]/live, /[id]/inquiry, /api/badges/[id],
  /api/leaderboard/me/* (owner), /api/cron/leaderboard-refresh, old /api/leaderboard/join kept (verifies the new way).
- Pages: (marketing)/leaderboard (+ [id], join, advertise), /sponsor -> /leaderboard/advertise, embed/leaderboard/[id],
  (dashboard)/dashboard/leaderboard, components/leaderboard/*, components/leaderboard/app/*.
- Dev: scripts/dev/seed-leaderboard.mjs (called by login.mjs), check_leaderboard_privacy.py, web/tests/leaderboard.test.mjs.

- Absolute URLs: badge/widget snippets, share links and copy-link always use SITE_ORIGIN (NEXTAUTH_URL, read on the server and
  passed to client components as `origin`; client bundles cannot read it). The on-page badge preview uses a same-origin path.
  (The old /leaderboard/[id] built a relative badge URL: fixed by the rewrite.)

## Done
Everything above is built and committed. Verified: tsc, eslint, node tests (npm test), python unit + API tests, privacy audit
script (21k assertions, no leaks) against the seeded demo board.

## Left / for the coordinator
- Screenshots + visual pass of every page (needs a free dev slot).
- Redirects wanted from the foundation agent: /dashboard/settings?tab=leaderboard -> /dashboard/leaderboard; then delete
  settings/LeaderboardOptIn.tsx, AdSlotsEditor.tsx, AdSlotRequestsInbox.tsx (obsolete).
- Marketing navbar is still dark: (marketing)/leaderboard/layout.tsx has a TEMP dark strip behind it; delete it when light.
