# tc/mcp work notes (resume file)

Spec: /root/projects/tc-redesign-research/MCP.md + PRODUCT.md section 4.

## Decisions so far
- SDK: @modelcontextprotocol/server 2.4.0 + zod 4 (committed). createMcpHandler, legacy 'stateless'.
- `/mcp` is shared by the marketing page `app/(marketing)/mcp/page.tsx` and the MCP endpoint:
  middleware rewrites non-browser requests on /mcp to `app/api/mcp/route.ts`.
- Pairing: reuse web/src/lib/sites/pairing.ts (from work/live). Inventory fetch: web/src/lib/sites/fetchInventory.ts (new, generic).
- Demo: demo grants use `demoGoogleFetch` from web/src/lib/demo (dev kit, on work/live) with a scoped fetch, never the network.
- Admin: new router module admin/mcp_api.py + migration 019_add_mcp_oauth.sql; main.py only gets include + ensure_schema + delete-user cascade.
- Anonymous demo grants (consent "Use demo data", no sign-in) use user_id 0.

## Done
- deps committed; work/live merged (pairing.ts).

## Next
- admin storage, oauth lib, routes, tools, UI, tests (see MCP.md phases 1-2).
