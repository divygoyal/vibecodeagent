import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { isDemoRequest } from '@/lib/demoWorkspace';
import { getDemoRealtimeData } from '@/lib/demoWorkspaceData';
import { getValidAccessToken, fetchRealtimeVisitors } from '@/lib/googleApi';
import { getGoogleCredentialsForAsset, getUserGoogleInventory } from '@/lib/serverAuth';
import { cachedFetch } from '@/lib/apiCache';
import { findSiteByPropertyId } from '@/lib/demo/catalog';
import { DEMO_USER_ID } from '@/lib/publicDemo/config';

const propDigits = (p: string) => /(\d+)/.exec(p)?.[1] ?? '';

/**
 * Can `userId` read this GA4 property? The public demo user: only the demo catalogue's properties. Everyone else:
 * it must be in their Google inventory (cached per user); when the inventory cannot be listed right now, Google's
 * own check on the caller's token decides (the cache below is per user, so nothing is ever served across users).
 */
async function canReadProperty(req: Request, userId: string, propertyId: string): Promise<boolean> {
    const digits = propDigits(propertyId);
    if (!digits) return false;
    if (userId === DEMO_USER_ID) return Boolean(findSiteByPropertyId(digits)?.ga);
    const inv = await getUserGoogleInventory(req, userId).catch(() => null);
    if (!inv || inv.properties.length === 0) return true;
    return inv.properties.some((p) => propDigits(p.property) === digits);
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

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
            // Server-only: Google tokens from the session JWT, then the admin DB (lib/serverAuth.ts).
            const { accessToken: googleAccess, refreshToken: googleRefresh } = await getGoogleCredentialsForAsset(req, String(userId), propertyId ? { kind: 'ga4', id: propertyId } : null);

            if (!googleAccess && !googleRefresh) {
                return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
            }
            if (!(await canReadProperty(req, String(userId), realtimePropertyId as string))) {
                return NextResponse.json({ error: 'Property not found' }, { status: 404 });
            }

            let token: string;
            try {
                token = await getValidAccessToken(googleAccess, googleRefresh);
            } catch {
                return NextResponse.json({ error: 'Google authentication failed. Please re-sign in.' }, { status: 401 });
            }

            // Per user and property (also the in-flight join): a property-only key served one user's realtime
            // visitors to anyone who asked for that property id while it was warm.
            const data = await cachedFetch(
                `realtime:${userId}:${propDigits(realtimePropertyId as string)}`,
                15_000, // 15s TTL for dashboard (more frequent than embed's 60s)
                () => fetchRealtimeVisitors(token, realtimePropertyId as string)
            );

            return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
        }

        // Dev mode: return mock realtime data
        return NextResponse.json({ activeUsers: Math.floor(Math.random() * 50) + 5 }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
    } catch (err: unknown) {
        console.error('Realtime API error:', err);
        return NextResponse.json({ error: (err instanceof Error && err.message) || 'Failed to fetch realtime data' }, { status: 500 });
    }
}
