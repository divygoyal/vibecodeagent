# Dev kit – status notes (paused 2026-10-26 ~12:50 UTC)

## Done (committed on work/live)
- `web/src/lib/demo/` demo data generator (catalog, series, entities, ga4, gsc, gaAdmin, pagespeed, fetchShim, index) + `web/src/instrumentation.ts` (installs the fetch shim only when TC_DEMO_DATA=1 and NODE_ENV!=production; the shim is an accessor on globalThis.fetch so it survives Next dev's fetch reset on recompiles).
- `web/next.config.ts`: env-gated `experimental.turbopackMemoryLimit` (TC_TURBOPACK_MEMORY_LIMIT_MB, only set by up.sh).
- `scripts/dev/`: lib.sh, up.sh, down.sh, status.sh, login.mjs (demo/demo2/admin + seeding), pw.mjs, shot.mjs, crawl.mjs, README.md.
- Verified: `up.sh kit 3101 8101`, login for all 3 users, /api/analytics, /api/seo, /api/analytics/properties, /api/seo/sites, /api/leaderboard return demo data; tsc passed (before the next.config.ts change); eslint clean on lib/demo.

## Left to do
1. `scripts/dev/up.sh kit 3101 8101`, then full `node scripts/dev/crawl.mjs 3101 <out>` (demo user) and `--user admin --only /admin,/superadmin`; triage report.md (first 11 routes all 200; per-route "problems" counts still to read).
2. Fix route errors caused by missing demo data/env; list pre-existing bugs.
3. Re-run `npx tsc --noEmit` in web/.
4. Copy a few screenshots to /root/projects/tc-redesign-research/kit-shots/.
5. Watch next-server memory during the crawl (~2.1 GB after 11 routes with the 1 GB Turbopack target; 3.4 GB without it).
6. `scripts/dev/down.sh kit`; final report. Note: do not `pkill -f <pattern>` from a tool shell – the pattern matches the shell itself.

## Pre-existing bugs found so far (not fixed)
- admin/requirements.txt lacks `greenlet`; SQLAlchemy >= 2.1 no longer installs it, so a fresh `pip install -r` gives an admin that crashes on import (the dev venv installs greenlet explicitly).
- POST /api/dashboards/[id]/share sends `user_identifier` in the JSON body but admin `/api/custom-dashboards/{id}/share` reads it as a query param → 422 "Failed to generate share link".
- Marketing home iframes https://trafficclaw.com/, blocked by the app's own CSP frame-src (console error in dev).
