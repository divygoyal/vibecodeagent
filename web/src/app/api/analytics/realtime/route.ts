import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb, fetchRealtimeVisitors } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session: any = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const propertyId = searchParams.get('property');

        if (!propertyId) {
            return NextResponse.json({ error: 'property parameter required' }, { status: 400 });
        }

        // Get Google token
        let accessToken = session.accessToken;
        let refreshToken = session.refreshToken;

        if (!accessToken) {
            const dbTokens = await fetchGoogleTokensFromDb(session.user.id);
            if (dbTokens) {
                accessToken = dbTokens.accessToken;
                refreshToken = dbTokens.refreshToken || refreshToken;
            }
        }

        const token = await getValidAccessToken(accessToken, refreshToken);
        const data = await fetchRealtimeVisitors(token, propertyId);

        return NextResponse.json(data);
    } catch (err: any) {
        console.error('Realtime API error:', err);
        return NextResponse.json({ error: err.message || 'Failed to fetch realtime data' }, { status: 500 });
    }
}
