# Portfolio notes (tc/portfolio, worktree tc-portfolio, dev ports 3104/8104, instance `portfolio`)

Specs: /root/projects/tc-redesign-research/{PRODUCT.md §1, DESIGN.md §3.25 §5.1 §5.2}. Shots go to
/root/projects/tc-redesign-research/shots/portfolio/.

## Done
- Merged work/live (slot lock, greenlet). Cherry-picked fetchInventory from tc/mcp (8145bd0).
- Admin snapshot store: migration 020_add_portfolio.sql + admin/portfolio_api.py (router at /api/portfolio,
  wired in main.py: schema at startup, router after get_user_runtime_identifier, delete_user hook).
  Tested standalone with a scratch FastAPI app (upsert/patch/status/metrics/snapshot/stale-users/delete).

## Next
- web/src/lib/portfolio (types, ranges, build, aggregate, adminStore, google, sync, auth, demo, csv)
- API routes: GET /api/portfolio, POST /api/portfolio/sync, PATCH /api/portfolio/assets/[id],
  GET /api/portfolio/export.csv, /api/cron/portfolio-sync
- UI at /dashboard (page.tsx) + components/portfolio/*; wait for tc/foundation ui+charts.
