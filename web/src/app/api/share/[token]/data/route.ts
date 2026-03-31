import { NextResponse } from 'next/server';
import { getShareData } from '@/app/api/share/route';
import {
    fetchGoogleTokensFromDb,
    getValidAccessToken,
    fetchAnalyticsDashboard,
    fetchSeoDashboard,
} from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

/* ─── Simple in-memory rate limiter (per token, 60 req/min) ─── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(token: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(token);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(token, { count: 1, resetAt: now + 60_000 });
        return false;
    }

    entry.count++;
    if (entry.count > 60) return true;
    return false;
}

// Periodically clean up stale entries to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(key);
    }
}, 5 * 60_000);

/**
 * GET /api/share/[token]/data
 *
 * Public endpoint (no auth required). Fetches real GA4 analytics data
 * for a valid share token. Only returns sections enabled in the share config.
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    /* ─── Read optional range parameter ─── */
    const allowedRanges = ['7d', '14d', '30d', '90d'];
    const rangeParam = new URL(req.url).searchParams.get('range') || '30d';
    const range = allowedRanges.includes(rangeParam) ? rangeParam : '30d';

    /* ─── Rate limiting ─── */
    if (isRateLimited(token)) {
        return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            { status: 429 }
        );
    }

    /* ─── Validate share token ─── */
    const share = await getShareData(token);
    if (!share) {
        return NextResponse.json(
            { error: 'Share not found or revoked' },
            { status: 404 }
        );
    }

    /* ─── Fetch the share owner's Google tokens ─── */
    const tokens = await fetchGoogleTokensFromDb(share.userId);
    if (!tokens) {
        return NextResponse.json(
            { error: 'Analytics data is temporarily unavailable' },
            { status: 503 }
        );
    }

    let accessToken: string;
    try {
        accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch {
        return NextResponse.json(
            { error: 'Analytics data is temporarily unavailable' },
            { status: 503 }
        );
    }

    /* ─── Fetch GA4 analytics data ─── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};

    if (share.config.traffic || share.config.sources || share.config.pages || share.config.geo) {
        try {
            const dashboard = await fetchAnalyticsDashboard(accessToken, share.propertyId, range);

            if (share.config.traffic) {
                result.kpis = dashboard.kpis;
                result.traffic = dashboard.traffic;
            }

            if (share.config.sources) {
                result.sources = (dashboard.sources || []).slice(0, 15);
            }

            if (share.config.pages) {
                result.pages = (dashboard.pages || []).slice(0, 15);
            }

            if (share.config.geo) {
                result.countries = (dashboard.countries || []).slice(0, 15);
            }
        } catch (err) {
            console.error('Share data — GA4 fetch error:', err);
            return NextResponse.json(
                { error: 'Analytics data is temporarily unavailable' },
                { status: 503 }
            );
        }
    }

    /* ─── Fetch SEO data (if enabled and siteUrl is available) ─── */
    if (share.config.seo && share.siteUrl) {
        try {
            const seoDashboard = await fetchSeoDashboard(accessToken, share.siteUrl);
            result.seo = seoDashboard;
        } catch (err) {
            console.error('Share data — GSC fetch error:', err);
            // SEO data is optional — return what we have with a flag
            result.seo = null;
            result.seoError = 'SEO data requires a Google Search Console connection';
        }
    } else if (share.config.seo) {
        result.seo = null;
        result.seoError = 'SEO data requires a Google Search Console connection';
    }

    return NextResponse.json(result);
}
