import { NextResponse } from 'next/server';
import { getShareData } from '@/app/api/share/route';
import { cachedFetch } from '@/lib/apiCache';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { parseShareOverviewEventNames, parseShareOverviewFilters } from '@/lib/shareOverviewFilters';
import type { ShareData } from '@/lib/shareTypes';

const shareRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const SHARE_RATE_WINDOW = 60_000;
const SHARE_RATE_LIMIT = 180;
const SHARE_OVERVIEW_CONTEXT_TTL = 15_000;
const MISSING_SHARE_SENTINEL = { __isError: true } as const;

export const SHARE_OVERVIEW_CACHE_TTL = {
    journey: 120_000,
    live: 5_000,
    liveVisitors: 5_000,
    map: 60_000,
    stats: 45_000,
    topConversions: 45_000,
    topEvents: 45_000,
    topGeneric: 45_000,
    topGenericSeries: 90_000,
    topLinkOut: 45_000,
    topPages: 45_000,
} as const;

function enforceRateLimit(token: string): boolean {
    const now = Date.now();
    const entry = shareRateLimitMap.get(token);

    if (!entry || now > entry.resetAt) {
        shareRateLimitMap.set(token, { count: 1, resetAt: now + SHARE_RATE_WINDOW });
        return false;
    }

    entry.count++;
    return entry.count > SHARE_RATE_LIMIT;
}

function cleanupRateLimits() {
    const now = Date.now();
    for (const [key, entry] of shareRateLimitMap) {
        if (now > entry.resetAt) {
            shareRateLimitMap.delete(key);
        }
    }
}

export function createShareError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

function serializeCachePart(part: unknown) {
    if (part === undefined || part === null) {
        return '';
    }
    if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') {
        return String(part);
    }
    return JSON.stringify(part);
}

export function buildShareOverviewCacheKey(
    kind: keyof typeof SHARE_OVERVIEW_CACHE_TTL | string,
    token: string,
    propertyId: string,
    parts: unknown[] = [],
) {
    return ['share-overview', kind, token, propertyId, ...parts.map(serializeCachePart)].join(':');
}

export function parseOverviewRequest(req: Request) {
    const searchParams = new URL(req.url).searchParams;
    const filtersParam = searchParams.get('f') || searchParams.get('filters');
    const intervalParam = searchParams.get('overrideInterval') || searchParams.get('interval');

    return {
        range: searchParams.get('range') || '30d',
        interval: intervalParam || 'day',
        startDate: searchParams.get('start'),
        endDate: searchParams.get('end'),
        column: searchParams.get('column'),
        mode: searchParams.get('mode'),
        steps: searchParams.get('steps'),
        limit: searchParams.get('limit'),
        showHeader: searchParams.get('header'),
        showDomain: searchParams.get('d'),
        filters: parseShareOverviewFilters(filtersParam),
        events: parseShareOverviewEventNames(searchParams.get('events')),
    };
}

async function getShareMeta(token: string): Promise<ShareData | null> {
    const result = await cachedFetch<ShareData | typeof MISSING_SHARE_SENTINEL>(
        `share-meta:${token}`,
        60_000,
        async () => {
            const share = await getShareData(token, { incrementView: false });
            return share ?? MISSING_SHARE_SENTINEL;
        },
    );

    return '__isError' in result ? null : result;
}

export async function getShareOverviewContext(token: string): Promise<{
    share: ShareData | null;
    accessToken: string | null;
    error?: NextResponse;
}> {
    return getShareOverviewContextWithOptions(token);
}

export async function getShareOverviewContextWithOptions(
    token: string,
    options?: { requireGoogle?: boolean }
): Promise<{
    share: ShareData | null;
    accessToken: string | null;
    error?: NextResponse;
}> {
    const requireGoogle = options?.requireGoogle ?? true;

    cleanupRateLimits();
    if (enforceRateLimit(token)) {
        return {
            share: null,
            accessToken: null,
            error: createShareError('Too many requests. Please try again later.', 429),
        };
    }

    return cachedFetch(
        `share-overview:context:${token}:${requireGoogle ? 'google' : 'optional'}`,
        SHARE_OVERVIEW_CONTEXT_TTL,
        async () => {
            const share = await getShareMeta(token);
            if (!share) {
                return {
                    share: null,
                    accessToken: null,
                    error: createShareError('Share not found or revoked', 404),
                };
            }

            const tokens = await fetchGoogleTokensFromDb(share.userId);
            if (!tokens) {
                if (!requireGoogle) {
                    return {
                        share,
                        accessToken: null,
                    };
                }

                return {
                    share,
                    accessToken: null,
                    error: createShareError('Analytics data is temporarily unavailable', 503),
                };
            }

            try {
                const accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
                return { share, accessToken };
            } catch {
                if (!requireGoogle) {
                    return {
                        share,
                        accessToken: null,
                    };
                }

                return {
                    share,
                    accessToken: null,
                    error: createShareError('Analytics data is temporarily unavailable', 503),
                };
            }
        },
    );
}
