import { NextResponse } from 'next/server';
import { getValidAccessToken, fetchRealtimeForEmbed, fetchEmbedTokenCredentials } from '@/lib/googleApi';
import { cachedFetch } from '@/lib/apiCache';

export const dynamic = 'force-dynamic';

// ─── Rate limiting: 4 req/min per token ───
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 4;
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(token: string): boolean {
    const now = Date.now();
    const entry = rateLimits.get(token);
    if (!entry || now > entry.resetAt) {
        rateLimits.set(token, { count: 1, resetAt: now + RATE_WINDOW });
        return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
}

// Lazy cleanup of stale rate limit entries
function cleanupRateLimits() {
    if (rateLimits.size > 500) {
        const now = Date.now();
        for (const [k, v] of rateLimits) {
            if (now > v.resetAt) rateLimits.delete(k);
        }
    }
}

/**
 * Public embed realtime API — NO session required.
 * Authenticates via embed token, fetches GA4 data using owner's credentials.
 *
 * GET /api/embed/realtime?token={embedToken}
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get('token');

        if (!token) {
            return NextResponse.json({ error: 'token parameter required' }, { status: 400 });
        }

        // Rate limit check
        cleanupRateLimits();
        if (!checkRateLimit(token)) {
            return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
        }

        // Validate token + get owner's Google credentials (cached 5 minutes)
        const tokenData = await cachedFetch(
            `embed-token:${token}`,
            5 * 60 * 1000, // 5 min TTL
            () => fetchEmbedTokenCredentials(token)
        );

        if (!tokenData) {
            return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 403 });
        }

        // Optional: check Origin header against allowed_origins
        if (tokenData.allowedOrigins && tokenData.allowedOrigins.length > 0) {
            const origin = req.headers.get('origin') || req.headers.get('referer') || '';
            const originHost = origin ? new URL(origin).hostname : '';
            const allowed = tokenData.allowedOrigins.some(
                (o: string) => originHost === o || originHost.endsWith(`.${o}`)
            );
            if (!allowed && originHost) {
                return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
            }
        }

        // Get valid Google access token (uses existing refresh cache)
        const accessToken = await getValidAccessToken(tokenData.accessToken, tokenData.refreshToken);

        // Fetch GA4 realtime data (cached 60s, shared across all viewers of same property)
        const data = await cachedFetch(
            `realtime-embed:${tokenData.propertyId}`,
            60_000, // 60s TTL
            () => fetchRealtimeForEmbed(accessToken, tokenData.propertyId)
        );

        // Free users see "Powered by TrafficClaw" watermark; paid users can remove it
        const showBranding = tokenData.plan === 'free';

        return NextResponse.json({ ...data, showBranding }, {
            headers: {
                'Cache-Control': 'public, max-age=30',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err) {
        console.error('Embed realtime API error:', err);
        return NextResponse.json(
            { error: 'Failed to fetch realtime data' },
            { status: 500 }
        );
    }
}
