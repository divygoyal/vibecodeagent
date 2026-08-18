import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { isDemoRequest } from '@/lib/demoWorkspace';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

interface MovementRow {
    query: string;
    clicksCurrent: number;
    clicksPrevious: number;
    clicksDelta: number;
    clicksDeltaPct: number;
    positionCurrent: number;
    positionPrevious: number;
    positionDelta: number;
    impressionsCurrent: number;
}

interface WinnersLosersResponse {
    winners: MovementRow[];
    losers: MovementRow[];
    new: MovementRow[];
    lost: MovementRow[];
}

function generateDemoResponse(): WinnersLosersResponse {
    return {
        winners: [
            { query: 'seo automation', clicksCurrent: 320, clicksPrevious: 180, clicksDelta: 140, clicksDeltaPct: 77.8, positionCurrent: 4.2, positionPrevious: 7.1, positionDelta: -2.9, impressionsCurrent: 4200 },
            { query: 'ai content writer', clicksCurrent: 245, clicksPrevious: 130, clicksDelta: 115, clicksDeltaPct: 88.5, positionCurrent: 5.8, positionPrevious: 9.4, positionDelta: -3.6, impressionsCurrent: 3850 },
            { query: 'keyword research free', clicksCurrent: 198, clicksPrevious: 110, clicksDelta: 88, clicksDeltaPct: 80.0, positionCurrent: 6.1, positionPrevious: 8.9, positionDelta: -2.8, impressionsCurrent: 3120 },
        ],
        losers: [
            { query: 'analytics dashboard', clicksCurrent: 85, clicksPrevious: 220, clicksDelta: -135, clicksDeltaPct: -61.4, positionCurrent: 9.8, positionPrevious: 5.2, positionDelta: 4.6, impressionsCurrent: 2400 },
            { query: 'content decay', clicksCurrent: 56, clicksPrevious: 150, clicksDelta: -94, clicksDeltaPct: -62.7, positionCurrent: 11.2, positionPrevious: 6.4, positionDelta: 4.8, impressionsCurrent: 1980 },
        ],
        new: [
            { query: 'gemini seo', clicksCurrent: 95, clicksPrevious: 0, clicksDelta: 95, clicksDeltaPct: 0, positionCurrent: 7.4, positionPrevious: 0, positionDelta: 0, impressionsCurrent: 1450 },
        ],
        lost: [
            { query: 'old ranking term', clicksCurrent: 0, clicksPrevious: 67, clicksDelta: -67, clicksDeltaPct: -100, positionCurrent: 0, positionPrevious: 8.2, positionDelta: 0, impressionsCurrent: 0 },
        ],
    };
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const siteUrl = req.nextUrl.searchParams.get('siteUrl');
    const timeframe = req.nextUrl.searchParams.get('timeframe') || '28d';
    const demoMode = isDemoRequest(req.nextUrl.searchParams);
    if (!siteUrl) {
        return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 });
    }

    if (demoMode) {
        return NextResponse.json(generateDemoResponse());
    }

    try {
        // @ts-expect-error - id added in callbacks
        const userId = session.user.id;
        const jwt = await getToken({ req: req as never }) as { googleAccessToken?: string; googleRefreshToken?: string } | null;
        let googleAccess = jwt?.googleAccessToken;
        let googleRefresh = jwt?.googleRefreshToken;

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

        const token = await getValidAccessToken(googleAccess, googleRefresh);

        const days = timeframe === '7d' ? 7 : timeframe === '28d' ? 28 : timeframe === '3m' ? 90 : 180;
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        const compEndDate = new Date(startDate);
        compEndDate.setDate(compEndDate.getDate() - 1);
        const compStartDate = new Date(compEndDate);
        compStartDate.setDate(compStartDate.getDate() - days);
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        const queryGSC = async (start: Date, end: Date) => {
            const res = await fetch(
                `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        startDate: fmt(start),
                        endDate: fmt(end),
                        dimensions: ['query'],
                        rowLimit: 1000,
                        type: 'web',
                    }),
                }
            );
            if (!res.ok) throw new Error(`GSC API error: ${res.status}`);
            const data = await res.json();
            return (data.rows || []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
        };

        const [currentRows, prevRows] = await Promise.all([
            queryGSC(startDate, endDate),
            queryGSC(compStartDate, compEndDate),
        ]);

        const currentMap = new Map(currentRows.map(r => [r.keys[0], r]));
        const prevMap = new Map(prevRows.map(r => [r.keys[0], r]));

        const winners: MovementRow[] = [];
        const losers: MovementRow[] = [];
        const newQueries: MovementRow[] = [];
        const lostQueries: MovementRow[] = [];

        // Existing or new queries (current period has data)
        for (const [query, cur] of currentMap) {
            const prev = prevMap.get(query);
            const prevClicks = prev?.clicks || 0;
            const prevPos = prev?.position || 0;
            const curClicks = cur.clicks || 0;
            const curPos = cur.position || 0;
            const curImp = cur.impressions || 0;

            const clicksDelta = curClicks - prevClicks;
            const clicksDeltaPct = prevClicks > 0 ? +((clicksDelta / prevClicks) * 100).toFixed(1) : 0;
            const positionDelta = prev ? +(curPos - prevPos).toFixed(1) : 0;

            const row: MovementRow = {
                query,
                clicksCurrent: curClicks,
                clicksPrevious: prevClicks,
                clicksDelta,
                clicksDeltaPct,
                positionCurrent: +curPos.toFixed(1),
                positionPrevious: +prevPos.toFixed(1),
                positionDelta,
                impressionsCurrent: curImp,
            };

            if (!prev && curClicks >= 5) {
                newQueries.push(row);
            } else if (prev) {
                if (clicksDelta >= 5 && clicksDeltaPct >= 20) winners.push(row);
                else if (clicksDelta <= -5 && clicksDeltaPct <= -20) losers.push(row);
            }
        }

        // Lost queries (in prev but not in current)
        for (const [query, prev] of prevMap) {
            if (currentMap.has(query)) continue;
            const prevClicks = prev.clicks || 0;
            if (prevClicks < 5) continue;
            lostQueries.push({
                query,
                clicksCurrent: 0,
                clicksPrevious: prevClicks,
                clicksDelta: -prevClicks,
                clicksDeltaPct: -100,
                positionCurrent: 0,
                positionPrevious: +(prev.position || 0).toFixed(1),
                positionDelta: 0,
                impressionsCurrent: 0,
            });
        }

        winners.sort((a, b) => b.clicksDelta - a.clicksDelta);
        losers.sort((a, b) => a.clicksDelta - b.clicksDelta);
        newQueries.sort((a, b) => b.clicksCurrent - a.clicksCurrent);
        lostQueries.sort((a, b) => b.clicksPrevious - a.clicksPrevious);

        return NextResponse.json({
            winners: winners.slice(0, 15),
            losers: losers.slice(0, 15),
            new: newQueries.slice(0, 10),
            lost: lostQueries.slice(0, 10),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch winners-losers data';
        console.error('[winners-losers] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
