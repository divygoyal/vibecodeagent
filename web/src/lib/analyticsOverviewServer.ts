import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { cachedFetch } from '@/lib/apiCache';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { DEMO_PROPERTY_ID, isDemoRequest } from '@/lib/demoWorkspace';
import { parseOverviewRequest, SHARE_OVERVIEW_CACHE_TTL } from '@/lib/shareOverviewServer';

const ANALYTICS_OVERVIEW_CONTEXT_TTL = 15_000;

function serializeCachePart(part: unknown) {
    if (part === undefined || part === null) {
        return '';
    }
    if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') {
        return String(part);
    }
    return JSON.stringify(part);
}

export { parseOverviewRequest, SHARE_OVERVIEW_CACHE_TTL };

export function createAnalyticsOverviewError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export function buildAnalyticsOverviewCacheKey(
    kind: keyof typeof SHARE_OVERVIEW_CACHE_TTL | string,
    userId: string,
    propertyId: string,
    parts: unknown[] = [],
) {
    return ['analytics-overview', kind, userId, propertyId, ...parts.map(serializeCachePart)].join(':');
}

export async function getAnalyticsOverviewContext(req: Request): Promise<{
    userId: string | null;
    propertyId: string | null;
    accessToken: string | null;
    isDemoWorkspace: boolean;
    error?: NextResponse;
}> {
    const searchParams = new URL(req.url).searchParams;
    const demoMode = isDemoRequest(searchParams);
    const propertyId = searchParams.get('propertyId');

    if (!demoMode && !propertyId) {
        return {
            userId: null,
            propertyId: null,
            accessToken: null,
            isDemoWorkspace: false,
            error: createAnalyticsOverviewError('propertyId parameter required', 400),
        };
    }

    type GoogleJwt = Awaited<ReturnType<typeof getToken>> & {
        googleAccessToken?: string;
        googleRefreshToken?: string;
    };

    const cookieHeader = req.headers.get('cookie') || 'no-cookie';

    return cachedFetch(
        `analytics-overview:context:${demoMode ? DEMO_PROPERTY_ID : propertyId}:${cookieHeader}`,
        ANALYTICS_OVERVIEW_CONTEXT_TTL,
        async () => {
            const [session, jwt] = await Promise.all([
                getServerSession(authOptions),
                getToken({ req: req as unknown as Parameters<typeof getToken>[0]['req'] }) as Promise<GoogleJwt>,
            ]);

            const userId = (session?.user as { id?: string } | undefined)?.id || null;
            if (!userId) {
                return {
                    userId: null,
                    propertyId: demoMode ? DEMO_PROPERTY_ID : propertyId,
                    accessToken: null,
                    isDemoWorkspace: false,
                    error: createAnalyticsOverviewError('Unauthorized', 401),
                };
            }

            if (demoMode) {
                return {
                    userId,
                    propertyId: DEMO_PROPERTY_ID,
                    accessToken: 'demo-mode',
                    isDemoWorkspace: true,
                };
            }

            let googleAccess = jwt?.googleAccessToken as string | undefined;
            let googleRefresh = jwt?.googleRefreshToken as string | undefined;

            if (!googleAccess && !googleRefresh) {
                const dbTokens = await fetchGoogleTokensFromDb(userId);
                if (dbTokens) {
                    googleAccess = dbTokens.accessToken;
                    googleRefresh = dbTokens.refreshToken;
                }
            }

            if (!googleAccess && !googleRefresh) {
                return {
                    userId,
                    propertyId,
                    accessToken: null,
                    isDemoWorkspace: false,
                    error: createAnalyticsOverviewError('Google not connected', 400),
                };
            }

            try {
                const accessToken = await getValidAccessToken(googleAccess, googleRefresh);
                return {
                    userId,
                    propertyId,
                    accessToken,
                    isDemoWorkspace: false,
                };
            } catch {
                return {
                    userId,
                    propertyId,
                    accessToken: null,
                    isDemoWorkspace: false,
                    error: createAnalyticsOverviewError('Analytics data is temporarily unavailable', 503),
                };
            }
        },
    );
}
