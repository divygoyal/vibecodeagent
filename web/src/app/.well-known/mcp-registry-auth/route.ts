export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * HTTP proof for the official MCP Registry's domain namespace
 * (com.trafficclaw/...): GET /.well-known/mcp-registry-auth returns one line,
 * "v=MCPv1; k=ed25519; p=<base64 public key>". The line comes from the
 * MCP_REGISTRY_AUTH environment variable, so the public key is set in Coolify
 * and never lives in git. 404 while it is unset or malformed. Public key only:
 * the private key stays with the owner. The DNS TXT record is an equal
 * alternative (see round8/mcp/OWNER-STEPS.md).
 *
 * The registry fetches with `Accept: text/plain`, wants 200, no redirect, at
 * most 4096 bytes.
 */
export function GET() {
    const record = (process.env.MCP_REGISTRY_AUTH || '').trim();
    if (!/^v=MCPv1; k=(ed25519|ecdsap384); p=[A-Za-z0-9+/=]{40,200}$/.test(record)) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return new Response(`${record}\n`, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
