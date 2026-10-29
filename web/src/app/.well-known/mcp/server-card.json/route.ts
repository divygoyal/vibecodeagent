import * as z from 'zod';
import { mcpEnabled, notFoundResponse, SERVER_VERSION } from '@/lib/mcp/config';
import { PROMPTS, SERVER_INSTRUCTIONS, serverInfo, TOOLS } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Static server card (SEP-1649) for directories that cannot scan an OAuth-only
 * server, such as Smithery: `/.well-known/mcp/server-card.json`. Built from the
 * same tool and prompt definitions the live server registers, so it cannot drift.
 */
function inputSchema(input: z.ZodObject): unknown {
    try {
        return z.toJSONSchema(input, { io: 'input', unrepresentable: 'any' });
    } catch {
        return { type: 'object' };
    }
}

export function GET() {
    if (!mcpEnabled()) return notFoundResponse();
    const info = serverInfo();
    const card = {
        serverInfo: { ...info, version: SERVER_VERSION },
        description: 'Read-only Google Analytics 4 and Search Console for every site in your Google account. Hosted, OAuth 2.0, free.',
        instructions: SERVER_INSTRUCTIONS,
        authentication: { required: true, schemes: ['oauth2'] },
        tools: TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: inputSchema(t.input as z.ZodObject),
            annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
        resources: [],
        prompts: PROMPTS.map((p) => ({
            name: p.name,
            title: p.title,
            description: p.description,
            arguments: p.takesSite ? [{ name: 'site', description: 'Site id from list_sites, for example example.com', required: true }] : [],
        })),
    };
    return new Response(JSON.stringify(card), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
    });
}
