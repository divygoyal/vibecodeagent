# Dev kit – status notes (2026-10-26 ~15:10 UTC): COMPLETE

All work is committed on work/live. Servers are down; this worktree's web/.next is deleted.

## Delivered
- Demo data mode: `web/src/lib/demo/*` + `web/src/instrumentation.ts` (TC_DEMO_DATA=1, never in production).
- `web/next.config.ts`: env-gated `turbopackMemoryLimit` (TC_TURBOPACK_MEMORY_LIMIT_MB, only set by up.sh).
- `scripts/dev/`: up.sh, down.sh, status.sh, lib.sh, login.mjs, pw.mjs, shot.mjs, crawl.mjs, README.md.
  Guards: max 2 next dev servers (flock slots), up.sh refuses below 2.5 GB RAM or 3 GB disk,
  down.sh deletes web/.next below 8 GB free disk, crawl stops below 1.8 GB RAM; crawl in parts (--part k/n).
- Fixes: admin/requirements.txt pins greenlet; admin docker_manager.get_all_containers() returns [] in Docker stub mode.

## Verification
- Crawl of all 67 routes (64 pages + robots/sitemap/llms) as demo: every route 200; admin pages as admin user: 0 problems.
- `npx tsc --noEmit` in web/ passes; eslint clean on lib/demo.
- Screenshots + crawl report: /root/projects/tc-redesign-research/kit-shots/.

## Pre-existing bugs (not fixed)
- POST /api/dashboards/[id]/share sends user_identifier in the body; the admin reads a query param → 422.
- Hydration mismatches: /dashboard/settings (invite link uses window.location), /globe and /embed/[siteId] (relative "x minutes ago" text rendered at different times).
- /leaderboard/[id] requests `leaderboard/<slug>/api/badges/<id>` (relative URL, missing leading slash) → 404.
- Dashboard layout race: on a cold/slow load `isDemoWorkspace` can turn true while the site/property lists are still empty, so /dashboard/seo renders the static antigravity.codes demo and its panels call /api/seo/* with siteUrl=https://antigravity.codes (500s). Seen once in the crawl; not reproducible on a warm server.
- Marketing home iframes https://trafficclaw.com/, blocked by the app's own CSP frame-src.
