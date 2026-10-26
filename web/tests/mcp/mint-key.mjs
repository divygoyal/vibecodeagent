#!/usr/bin/env node
/**
 * Create a personal API key (tcak_...) for the signed-in dev user, for MCP
 * Inspector and curl runs against a dev instance. Prints only the key.
 *
 *   KEY=$(node web/tests/mcp/mint-key.mjs http://localhost:3102 /root/.trafficclaw-dev/mcp/state.json)
 */
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:3102').replace(/\/$/, '');
const statePath = process.argv[3] || '/root/.trafficclaw-dev/mcp/state.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const c = state.cookies.find((x) => x.name.endsWith('next-auth.session-token'));
if (!c) throw new Error(`no session cookie in ${statePath}`);
const res = await fetch(`${base}/api/ai-connections/keys`, {
    method: 'POST',
    headers: { cookie: `${c.name}=${c.value}`, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Inspector (dev)', expires_in_days: 1 }),
});
const body = await res.json();
if (!res.ok) {
    console.error(`create key failed: ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
}
process.stdout.write(`${body.key}\n`);
