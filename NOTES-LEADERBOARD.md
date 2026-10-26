# Leaderboard notes (tc/leaderboard, worktree tc-leaderboard, dev instance `leaderboard` 3105/8105)

Specs: /root/projects/tc-redesign-research/{PRODUCT,DESIGN}.md (PRODUCT 3, DESIGN 5.12/5.18/5.19).
Screenshots go to /root/projects/tc-redesign-research/shots/leaderboard/.

## Decisions (keep)
- Migration number 021 (019 mcp, 020 portfolio). Four new tables only: leaderboard_profiles
  (verification level/detail/checked_at, privacy_json, open_to_json, is_paused, gsc_site_url),
  leaderboard_daily, leaderboard_range_stats, leaderboard_inquiries. No change to leaderboard_entries,
  ad_slots, ad_slot_requests. Models in admin/models.py (bottom), SQL in admin/migrations/021_leaderboard_v3.sql,
  idempotent DDL in admin/leaderboard_v3.py `ensure_schema` called from init_db().
- Pure logic (privacy, bands, ranking rules) in admin/leaderboard_core.py with unit tests
  (`python -m unittest admin.tests.test_leaderboard_core` from the repo root, kit venv).
- New API is /api/lb/* in admin/leaderboard_v3.py (admin key only; web is the only caller). Legacy admin endpoints
  (/api/leaderboard list + detail, /api/sponsor-inventory) now apply the same privacy + ranking rules.
- Verification: level owner (GSC siteOwner/siteFullUser covering the host via siteCoversHost) | ga4 | none.
  Only `owner` ranks. Legacy GA4-verified entries with no v3 check yet stay ranked ("grace") until their first check.
  Manual superadmin verify = level owner + manual flag (auto checks never downgrade it).
- Privacy: per metric exact|range|hidden (visitors, clicks, pageviews, impressions, engagement), section toggles
  (countries, channels, devices, pages, queries), live opt-in. New listings: visitors+clicks exact, rest hidden.
  Entries with no profile row keep today's visibility (LEGACY_PRIVACY) until the owner saves settings.
- Pending/unverified entries are never in lists; their direct profile URL shows a "Pending verification" shell without numbers.
  Paused entries are 404.

## Done
- Admin: models, migration 021, leaderboard_core + tests, leaderboard_v3 router, legacy endpoint privacy.

## Next
- Web lib (verify, refresh, server fetchers), API routes, cron, demo seed, then UI after tc/foundation is merged.
