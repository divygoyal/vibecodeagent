# MCP server tests

The hosted MCP server (`/mcp`), its OAuth 2.1 authorization server (`/oauth/*`,
`/.well-known/*`) and the Connect AI APIs (`/api/ai-connections/*`).

## 1. Unit tests (no server)

```bash
cd web
npx -y tsx --tsconfig tsconfig.json --test tests/mcp/unit.test.ts
```

PKCE (RFC 7636 vector), redirect-URI rules, resource normalisation, scopes,
SSRF address guard, CIMD document validation, signed consent transaction,
date presets and clamps, the output sanitiser and budget, site pairing ids and
resolution with grant filters, rate limits.

## 2. End-to-end flow against a dev instance

Start the dev kit with demo data (see `scripts/dev/README.md`). The MCP flag
and the dev-only loopback CIMD switch go in `web/.env.development.local`
(gitignored), because `up.sh` starts Next with a clean environment:

```bash
cat > web/.env.development.local <<'ENV'
TC_MCP_ENABLED=1
TC_MCP_DEV_CIMD_LOOPBACK=1
TC_MCP_DCR_LIMIT=1000
ENV
scripts/dev/up.sh mcp 3102 8102
node scripts/dev/login.mjs 3102 --no-seed

MCP_BASE=http://localhost:3102 MCP_STATE=/root/.trafficclaw-dev/mcp/state.json \
  node --test --test-timeout=300000 web/tests/mcp/flow.test.mjs
```

`flow.test.mjs` covers discovery, the 401 challenge, DCR, CIMD (a loopback
metadata document served by the test), PKCE, the consent page and decision
with CSRF, token exchange, refresh rotation and reuse detection (set
`MCP_SLOW=0` to skip the 11-second reuse wait), RFC 7009 revocation, anonymous
demo grants, per-connection site filter and query hiding, API keys, both
protocol eras (2026-07-28 stateless and 2025-11-25 `initialize`),
`server/discover`, every one of the 13 tools on demo data, and the negative
cases from MCP.md 12.2 (bad Origin, GET/DELETE 405, wrong content type, header
mismatch, unsupported version, unregistered redirect, `plain` PKCE, foreign
resource, unknown scope, reused code, wrong verifier).

Every tool declares an `outputSchema`, and clients such as Claude then read
`structuredContent` and ignore the text content. So `structuredContent` carries
the data itself: `table` (the same compact TSV as the text) for table output,
`columns` + `rows` for `format: "json"`, `text` for `trafficclaw_help`, with the
metadata (period, counts, warnings, truncated) beside it. The test
"structuredContent carries the data" reads every tool's result the way Claude
does (structuredContent first) and fails if it holds only metadata; the unit
test checks the output schemas and the sanitiser on the structured rows.

### Real-browser consent test

`flow.test.mjs` posts the consent form with `fetch()`, so it cannot see form bugs that only a browser has (a
disabled button is left out of the form data, which once gave "Bad request: Unknown action"). `browser-consent.mjs`
clicks the real buttons in Chromium on a dev instance: signed out "Use demo data instead", signed in "Allow" and
"Cancel", then checks code + `iss`, the token exchange, `tools/list` and a tool call, and `error=access_denied`.
On worker1: `scripts/dev/worker1.sh check <name> mcp` (needs `up`; not part of `all`). By hand, with the dev kit's
`TC_PLAYWRIGHT_DIR`/`TC_CHROME` set and `login.mjs` run: `node web/tests/mcp/browser-consent.mjs <webPort> [--out dir]`.

## 3. MCP Inspector (CLI)

Use a personal API key (or an OAuth access token from the flow above):

```bash
KEY=$(node web/tests/mcp/mint-key.mjs http://localhost:3102 /root/.trafficclaw-dev/mcp/state.json)
URL=http://localhost:3102/mcp

npx -y @modelcontextprotocol/inspector@2.12.0 --cli --server-url $URL --transport http \
  --header "Authorization: Bearer $KEY" --protocol-era modern --method tools/list
npx -y @modelcontextprotocol/inspector@2.12.0 --cli --server-url $URL --transport http \
  --header "Authorization: Bearer $KEY" --protocol-era legacy --method tools/call --tool-name list_sites
npx -y @modelcontextprotocol/inspector@2.12.0 --cli --server-url $URL --transport http \
  --header "Authorization: Bearer $KEY" --protocol-era auto --method tools/call --tool-name gsc_search_analytics \
  --tool-args-json '{"site":"acmeanalytics.example","dimensions":["query"],"limit":5}'
npx -y @modelcontextprotocol/inspector@2.12.0 --cli --server-url $URL --transport http \
  --header "Authorization: Bearer $KEY" --protocol-era modern --method tools/list --strict
npx -y @modelcontextprotocol/inspector@2.12.0 --cli --server-url $URL --transport http \
  --header "Authorization: Bearer $KEY" --protocol-era modern --method prompts/list
```

Interactive OAuth with the web UI: `npx @modelcontextprotocol/inspector`, choose
Streamable HTTP, URL `http://localhost:3102/mcp`, run the auth flow (it uses DCR
and PKCE), approve on the consent screen, then list and call tools.

## Production smoke test (after deploy, with `TC_MCP_ENABLED=1`)

```bash
curl -si https://trafficclaw.com/mcp -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n '1,12p'   # 401 + WWW-Authenticate
curl -s https://trafficclaw.com/.well-known/oauth-protected-resource/mcp
curl -s https://trafficclaw.com/.well-known/oauth-authorization-server
```
