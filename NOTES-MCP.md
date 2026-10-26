# tc/mcp work notes (resume file)

Spec: /root/projects/tc-redesign-research/MCP.md + PRODUCT.md section 4. Design: DESIGN.md (same folder).

## Coordinator routing (binding)
- MCP endpoint: app/mcp/route.ts at /mcp. Browser GET with Accept text/html -> 302 to /ai.
- Marketing page: app/(marketing)/ai/page.tsx (NOT /mcp).
- In-app page: /dashboard/connect-ai. UI components under components/connect-ai/ (not components/ui or components/shell).
- Pairing: reuse web/src/lib/sites/pairing.ts (from work/live, don't change signatures).
  Add web/src/lib/sites/fetchInventory.ts (generic: token -> {properties: Ga4PropertyInput[], sites: GscSiteInput[]}, cached, demo aware).
- Dev kit (scripts/dev, TC_DEMO_DATA=1 fetch shim in web/src/lib/demo) is on work/live: merge when committed there.
  Use ports web 3102 / admin 8102, instance name `mcp`.

## Decisions
- SDK @modelcontextprotocol/server 2.4.0 + zod 4 (committed). createMcpHandler legacy 'stateless'. Smoke-tested both eras OK.
- Demo grants: scoped fetch via demoGoogleFetch(input, init, original) + demoAccessToken() from '@/lib/demo' (never network).
- Anonymous demo grants (consent "Use demo data" without sign-in) use user_id 0.
- Grants carry exclude_queries (per-connection option to hide search queries) and site_filter.
- Consent: /oauth/authorize (route) validates, sets CSRF cookie, 302 -> /oauth/consent?txn=<signed>; form POST -> /oauth/authorize/decision.

## Done (committed unless noted)
- admin/mcp_api.py + migrations/019_add_mcp_oauth.sql + main.py wiring (include_router, ensure_mcp_schema, delete-user cascade). Not yet run.
- web/src/lib/mcp/{config,adminStore,rateLimit,session}.ts
- web/src/lib/oauth/{primitives,ssrf,clients,txn,metadata,authorize}.ts
- routes: .well-known PRM (+/mcp) and AS metadata, /oauth/register, /oauth/authorize, /oauth/authorize/decision

## Next
1. /oauth/token, /oauth/revoke routes; lib/mcp/auth.ts (bearer lookup cache 15s, 401/403 challenges, origin check, CORS, evictTokenHashes)
2. app/mcp/route.ts (createMcpHandler; GET html -> 302 /ai; GET/DELETE 405)
3. lib/sites/fetchInventory.ts, lib/mcp/{google,siteResolver,dates,format,audit,server}.ts and 13 tools + 3 prompts (MCP.md 7-8)
4. API keys + /api/ai-connections/* session routes
5. UI: /oauth/consent page, /dashboard/connect-ai, (marketing)/ai page
6. tests web/tests/mcp (node:test flow script + README with Inspector commands); verify with kit; tsc + lint
7. Report: nav item "Connect AI" -> /dashboard/connect-ai; env vars TC_MCP_ENABLED, TC_MCP_ISSUER, TC_MCP_TXN_SECRET, TC_MCP_DEMO, TC_MCP_ACCESS_TTL
