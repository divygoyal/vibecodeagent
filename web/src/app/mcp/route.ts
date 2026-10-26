import { createMcpHandler } from '@modelcontextprotocol/server';
import { authenticate, challengeResponse, checkOrigin, toAuthInfo, withMcpCors, type McpPrincipal } from '@/lib/mcp/auth';
import { mcpEnabled, notFoundResponse } from '@/lib/mcp/config';
import { clientIp, hitLimit, ipPrefix } from '@/lib/mcp/rateLimit';
import { buildServer } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BODY = 256 * 1024;

const handler = createMcpHandler((ctx) => {
    const principal = (ctx.authInfo?.extra as { principal?: McpPrincipal } | undefined)?.principal;
    if (!principal) throw new Error('unauthenticated request reached the MCP factory');
    const prefix = ctx.requestInfo ? ipPrefix(clientIp(ctx.requestInfo)) : null;
    return buildServer(principal, prefix);
}, {
    legacy: 'stateless',
    responseMode: 'auto',
    maxRequestBodySize: MAX_BODY,
    onerror: (err) => console.warn('[mcp] handler:', err.message),
});

/**
 * Streamable HTTP MCP endpoint (MCP.md 3.1): Origin check, bearer auth (401
 * with the RFC 9728 challenge), abuse limit, then the SDK serves both the
 * 2026-07-28 stateless protocol and 2025-era clients.
 */
export async function POST(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const bad = checkOrigin(req);
    if (bad) return bad;
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
        return withMcpCors(req, new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Content-Type must be application/json' } }), { status: 415, headers: { 'content-type': 'application/json' } }));
    }
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_BODY) return withMcpCors(req, new Response(null, { status: 413 }));

    const auth = await authenticate(req);
    if (!auth.ok) {
        const flood = hitLimit(`mcp-unauth:${clientIp(req)}`, 120, 60_000);
        if (!flood.ok) return withMcpCors(req, new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(flood.retryAfterS) } }));
        return challengeResponse(req, auth);
    }
    const perToken = hitLimit(`mcp-token:${auth.principal.tokenRef}`, 600, 60_000);
    if (!perToken.ok) return withMcpCors(req, new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(perToken.retryAfterS) } }));

    const res = await handler.fetch(req, { authInfo: toAuthInfo(auth.principal) });
    const out = new Response(res.body, { status: res.status, headers: res.headers });
    out.headers.set('cache-control', 'no-store');
    if ((out.headers.get('content-type') || '').includes('text/event-stream')) out.headers.set('x-accel-buffering', 'no');
    return withMcpCors(req, out);
}

/** Browsers that open the URL get the explainer page; SSE GETs and DELETE are not used (stateless). */
export function GET(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const accept = req.headers.get('accept') || '';
    if (/text\/html/.test(accept) && !/text\/event-stream/.test(accept)) {
        return new Response(null, { status: 302, headers: { location: '/ai', 'cache-control': 'no-store' } });
    }
    return withMcpCors(req, new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }), { status: 405, headers: { allow: 'POST, OPTIONS', 'content-type': 'application/json' } }));
}

export function DELETE(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    return withMcpCors(req, new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }), { status: 405, headers: { allow: 'POST, OPTIONS', 'content-type': 'application/json' } }));
}

export function OPTIONS(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    const bad = checkOrigin(req);
    if (bad) return bad;
    return withMcpCors(req, new Response(null, { status: 204 }));
}
