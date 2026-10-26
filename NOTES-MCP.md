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

## Dev setup
- web/.env.development.local (gitignored) sets TC_MCP_ENABLED=1 and TC_MCP_DEV_CIMD_LOOPBACK=1 (up.sh uses env -i).
- work/live kit merged (scripts/dev).

## Done (committed unless noted)
- web/src/lib/sites/fetchInventory.ts: own commits 8145bd0 + 9e1c0ed (globalThis cache) for cherry-pick by portfolio.
- admin/mcp_api.py + migrations/019_add_mcp_oauth.sql + main.py wiring (include_router, ensure_mcp_schema, delete-user cascade). Not yet run.
- web/src/lib/mcp/{config,adminStore,rateLimit,session}.ts
- web/src/lib/oauth/{primitives,ssrf,clients,txn,metadata,authorize}.ts
- routes: .well-known PRM (+/mcp) and AS metadata, /oauth/register, /oauth/authorize, /oauth/authorize/decision

## Status (latest)
- Backend complete: OAuth (discovery, DCR, CIMD, authorize/consent/decision, token, revoke), /mcp (both eras), 13 tools + 3 prompts, API keys, /api/ai-connections/*.
- Consent page /oauth/consent done. web/tests/mcp/flow.test.mjs: 28/28 pass against instance mcp (3102/8102).
- Cross-route state uses globalThis (lib/mcp/shared.ts) so revocation evicts everywhere.

## Next
1. /dashboard/connect-ai page (components/connect-ai/ConnectAiClient.tsx), (marketing)/ai page
2. README web/tests/mcp/README.md + Inspector runs; unit tests for primitives (tsx --test)
3. screenshots (desktop/mobile, light/dark), lint, stop server, rm -rf web/.next, report
