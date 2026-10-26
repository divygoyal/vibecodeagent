# Builder v2 notes (tc/builder, worktree tc-builder, dev ports 3106/8106, instance `builder`)

Specs: /root/projects/tc-redesign-research/{BUILDER,PRODUCT,DESIGN}.md. Shots go to
/root/projects/tc-redesign-research/shots/builder/.

## Plan (order)
1. Admin: migration 022 (doc, rev, schema_version, share_settings, share_password_hash, thumbnail,
   custom_dashboard_versions), endpoints (expected_rev 409, share settings PUT, rotate, verify password).
2. lib/builder (isomorphic): types, catalog, dates, migrate (v1->v2), registry, compile, templates, publicDoc.
3. lib/builder/server: sources (fetchInventory + pairSites), limiter (lib/googleLimiter.ts), cache
   (L1 SWR, TTL by recency), engine (leaves, dedupe, coalesce, GA4 batch 5, GSC lag), store (admin client).
4. Routes: POST /api/dashboards/query, GET public/[token], GET public/[token]/query, POST unlock, copy,
   sites, options; CRUD extended (If-Match rev -> 412); share fix (user_identifier in query).
5. Tests: web/tests/builder/*.test.ts via `npx --offline tsx --test`.
6. UI after tc/foundation ships components/ui + charts: list, templates gallery, view, editor, share, public view.

## Done
- merged work/live, cherry-picked fetchInventory (8145bd0), merged tc/foundation (tokens, ui, charts, shell).
- 75deda7 admin: dashboards_v2.py router + migration 022 + startup ALTERs (smoke-tested with httpx).
- 5c9357a lib/builder data layer + engine + limiter + tests (web/tests/builder/query.test.ts, 11 pass:
  `cd web && npx --offline tsx --test tests/builder/query.test.ts`).
- 92051bf API routes (query, public, unlock, copy, sites, options, versions, share fix, v1 adapters).
- d4ef690 + 59c41f1 UI: widgets, canvas, controls, view, editor, share dialog, list, gallery, public view.
- v1 client POST /api/dashboards keeps the row v1 (lazy migration on read).
- node_modules: radix + foundation deps hard-linked from tc-foundation (new entries only); d3-geo,
  topojson-client, commander, @types/{d3-geo,topojson-client,topojson-specification} copied from a
  scratch install. public/geo/countries-110m.json copied from world-atlas 2.0.2 (ISC).

## Next
- bring up kit `builder 3106 8106` when a slot is free; run web/tests/builder/public-api.mjs 3106;
  screenshots to /root/projects/tc-redesign-research/shots/builder (list, gallery, editor per widget,
  properties, view mobile, public link; desktop+mobile, light+dark); fix what breaks.
- P1 left: cross-filter, calc metrics, pivot, widget date/filter override UI, CSV/PNG, versions UI,
  JSON import/export, TV mode, digest email, L2 Redis cache, snapshot store (portfolio) hook.
