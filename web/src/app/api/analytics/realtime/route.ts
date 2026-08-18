import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { isDemoRequest } from '@/lib/demoWorkspace';
import { getDemoRealtimeData } from '@/lib/demoWorkspaceData';
import { getValidAccessToken, fetchGoogleTokensFromDb, fetchRealtimeVisitors } from '@/lib/googleApi';
import { cachedFetch } from '@/lib/apiCache';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const [session, jwt] = await Promise.all([
            getServerSession(authOptions),
            getToken({ req: req as any }) as Promise<any>,
        ]);

        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const propertyId = searchParams.get('property');
        const demoMode = isDemoRequest(searchParams);
        const realtimePropertyId = propertyId ?? undefined;

        if (!realtimePropertyId && !demoMode) {
            return NextResponse.json({ error: 'property parameter required' }, { status: 400 });
        }

        if (demoMode) {
            return NextResponse.json(getDemoRealtimeData(), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
        }

        const isProduction = !!ADMIN_API_KEY;

        if (isProduction) {
            // @ts-expect-error - id added in callbacks
            const userId = session.user.id;
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
                return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
            }

            let token: string;
            try {
                token = await getValidAccessToken(googleAccess, googleRefresh);
            } catch {
                return NextResponse.json({ error: 'Google authentication failed. Please re-sign in.' }, { status: 401 });
            }

            // Shared cache: same key as embed API so dashboard + embed don't double-fetch
            const data = await cachedFetch(
                `realtime:${realtimePropertyId}`,
                15_000, // 15s TTL for dashboard (more frequent than embed's 60s)
                () => fetchRealtimeVisitors(token, realtimePropertyId as string)
            );

            return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
        }

        // Dev mode: return mock realtime data
        return NextResponse.json({ activeUsers: Math.floor(Math.random() * 50) + 5 }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    } catch (err: any) {
        console.error('Realtime API error:', err);
        return NextResponse.json({ error: err.message || 'Failed to fetch realtime data' }, { status: 500 });
    }
}
