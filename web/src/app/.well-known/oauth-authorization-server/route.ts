import { mcpEnabled, notFoundResponse } from '@/lib/mcp/config';
import { authorizationServerMetadata, metadataResponse, publicPreflight } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** RFC 8414 authorization server metadata. No OIDC document on purpose (no ID tokens). */
export function GET() {
    if (!mcpEnabled()) return notFoundResponse();
    return metadataResponse(authorizationServerMetadata());
}

export const OPTIONS = publicPreflight;
