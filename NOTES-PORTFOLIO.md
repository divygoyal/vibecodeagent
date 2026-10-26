# Portfolio notes (tc/portfolio, worktree tc-portfolio, dev ports 3104/8104, instance `portfolio`)

Specs: /root/projects/tc-redesign-research/{PRODUCT.md §1, DESIGN.md §3.25 §5.1 §5.2}.
Shots: /root/projects/tc-redesign-research/shots/portfolio/.

## Done (all committed)
- Merged work/live, tc/foundation (tokens/ui/charts 7ea0a0b, shell d898cb6, font fix faa53c8, 9cef58d).
  Cherry-picked fetchInventory from tc/mcp (8145bd0).
- Admin store: migration 020_add_portfolio.sql + admin/portfolio_api.py (router /api/portfolio/*,
  wired in main.py: schema in lifespan after init_db, router after get_user_runtime_identifier,
  delete_user hook). site_daily_metrics is WITHOUT ROWID, PK (user, kind, date, asset).
  Endpoints: GET/PUT/PATCH users/{id}/assets, POST users/{id}/assets/status, POST users/{id}/metrics,
  POST users/{id}/snapshot (windows per kind, bucket_days, recent_days), GET stale-users, DELETE users/{id}.
- web/src/lib/portfolio: types, ranges, snapshot (+TS aggregator twin), rows (GA4/GSC request+parse),
  build (pure builder: totals/prev, series, combined + combinedPrev, alerts, slugs, variant chip),
  sync (inventory -> pairSites -> 1 report per asset chunk, 4 assets at a time, 200-day first chunk then
  the rest: GA4 760 days, GSC 486 days; refetch 3/5-day lookback; per-asset status), service, auth,
  adminStore, csv, view (filter/sort), demo (buildDemoPortfolio for /demo, pure).
- Routes: GET /api/portfolio(?range, ?demo=1), POST /api/portfolio/sync {force,wait},
  PATCH /api/portfolio/assets/[siteKey] {starred,hidden,ga4Property,gscSite,resetPairing},
  GET /api/portfolio/export.csv, GET|POST /api/cron/portfolio-sync (Bearer CRON_SECRET).
- UI: /dashboard page.tsx -> components/portfolio/PortfolioPage (SWR, polls while syncing, useDateRange)
  -> PortfolioView (pure, reusable on /demo with readOnly). SiteCard, TotalsStrip (KpiStrip + chart with
  previous period), AlertsPanel, SitesTable, PortfolioOnboarding (connect / no sites), PairingDialog, SiteMenu.
- lib/format: flat position delta shows "–" (coordinator request). globals.css: scoped revert of the
  legacy 44px button min-size inside .tc-root (foundation file; coordinator may move it).
- Verified: tsc, eslint on touched files, format tests; demo-mode call counts (first sync 10 inventory +
  16 GA4 + 20 GSC; forced resync 10 + 8 + 10; cron 0 + 8 + 10); progressive fill polled; 500-site admin
  snapshot 0.3-1.2 s, builder 67 ms, response ~1 MB.

## Verified (final)
- tsc clean, eslint clean on touched files, `npm test` 24/24, admin standalone tests + 500-site scale test.
- Real path (admin SQL + sync) and buildDemoPortfolio() give identical totals for 7d/28d/3m/12m.
- 23 shots in /root/projects/tc-redesign-research/shots/portfolio (desktop 1280 / mobile 390, light/dark:
  grid, table, empty, first-sync, mid-sync, no-sites, 7d alerts). Empty/first-sync/mid-sync use API
  responses captured from the real flow (mocked in the browser for a stable shot).
- Console: only third-party (tawk CORS, gtag) and /api/favicon 404s for .example hosts (foundation proxy).

## PAUSED (coordinator, usage 93%)
- Follow-ups (exact users per range, favicon letter-mark) are committed (246a663) and pass tsc, lint and npm test.
- Left: one verification round on the dev kit (both slots were busy): up.sh portfolio 3104 8104, login,
  open /dashboard, check the [portfolio-users] log line (expect 8 GA4 calls per range), and check that the
  favicons are 200 SVG and the console is clean. Retake the shots: desktop/mobile, light/dark, grid + table.
  Then down.sh and rm -rf web/.next.

## Open / for others
- Foundation: globals.css revert rule (commit "keep legacy 44px...") is
  theirs to keep or move. lib/format flat position delta now "–" (test added).
- Users are exact per range (follow-up 246a663): portfolio_range_totals, one runReport per GA4
  property for the viewed range (cur + prev, no date dimension), lazily after the daily sync, 6 h cache.
  Across sites the tile says "Users (sum of sites)" + tooltip in the chart header.
- /api/favicon returns a letter-mark SVG (categorical colour) instead of 404. Note DESIGN 2.8 says
  fallbacks should not be colourful; the coordinator asked for colour.
- mcp_site_links (tc/mcp) and portfolio_assets.pairing_override both store pairing overrides:
  reconcile into one when merging.
- /demo page (marketing) can render <PortfolioView data={buildDemoPortfolio({range})} readOnly
  className="tc-root ..." /> with its own range state.
