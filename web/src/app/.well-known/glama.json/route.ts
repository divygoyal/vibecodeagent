export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Glama connector ownership proof: GET /.well-known/glama.json. The claim
 * token (glama_claim_..., one per Glama account, shown by "Claim ownership"
 * on the connector page) comes from GLAMA_CLAIM_TOKEN in Coolify. Several
 * accounts may be listed, comma separated. 404 while unset.
 */
export function GET() {
    const tokens = (process.env.GLAMA_CLAIM_TOKEN || '').split(',').map((t) => t.trim()).filter((t) => /^glama_claim_[A-Za-z0-9_-]+$/.test(t));
    if (!tokens.length) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    const body = { $schema: 'https://glama.ai/mcp/schemas/connector.json', claim: tokens.length === 1 ? tokens[0] : tokens };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
}
