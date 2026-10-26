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

## Next
- Re-take shots after the WITHOUT ROWID restart (dev DB tables were dropped; resync happens on open).
- Remove web/.next, down.sh portfolio when finished.
