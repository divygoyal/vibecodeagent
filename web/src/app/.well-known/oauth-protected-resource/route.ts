import { mcpEnabled, notFoundResponse } from '@/lib/mcp/config';
import { metadataResponse, protectedResourceMetadata, publicPreflight } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** RFC 9728 protected resource metadata (root fallback location). */
export function GET(req: Request) {
    if (!mcpEnabled()) return notFoundResponse();
    return metadataResponse(protectedResourceMetadata(req));
}

export const OPTIONS = publicPreflight;
