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
- merged work/live, cherry-picked fetchInventory (8145bd0), merged tc/foundation 176a55f (tokens, format,
  metrics, radix-ui linked into node_modules from tc-foundation).

## Next
- see plan
