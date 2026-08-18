import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { isDemoRequest } from '@/lib/demoWorkspace';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

interface PageOnQuery {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface CannibalizedQuery {
    query: string;
    pages: PageOnQuery[];
    totalClicks: number;
    totalImpressions: number;
    bestPosition: number;
    severity: 'high' | 'medium' | 'low';
}

function classifySeverity(pages: PageOnQuery[]): 'high' | 'medium' | 'low' {
    const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
    const positions = pages.map(p => p.position).sort((a, b) => a - b);
    const positionSpread = positions.length > 1 ? positions[positions.length - 1] - positions[0] : 0;
    if (totalImpressions > 1000 && pages.length >= 3) return 'high';
    if (totalImpressions > 200 && positionSpread < 5) return 'high';
    if (totalImpressions > 50) return 'medium';
    return 'low';
}

function generateDemoResponse(): { cannibalized: CannibalizedQuery[] } {
    return {
        cannibalized: [
            {
                query: 'seo automation',
                pages: [
                    { page: '/blog/seo-automation', clicks: 145, impressions: 1820, ctr: 7.97, position: 4.2 },
                    { page: '/features', clicks: 78, impressions: 1240, ctr: 6.29, position: 6.8 },
                ],
                totalClicks: 223,
                totalImpressions: 3060,
                bestPosition: 4.2,
                severity: 'high',
            },
            {
                query: 'keyword research tool',
                pages: [
                    { page: '/blog/keyword-research', clicks: 89, impressions: 1450, ctr: 6.14, position: 5.8 },
                    { page: '/blog/keyword-research-guide', clicks: 56, impressions: 980, ctr: 5.71, position: 8.1 },
                ],
                totalClicks: 145,
                totalImpressions: 2430,
                bestPosition: 5.8,
                severity: 'medium',
            },
        ],
    };
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const siteUrl = req.nextUrl.searchParams.get('siteUrl');
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

        // 28-day window
        const now = new Date();
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 28);
        const fmt = (d: Date) => d.toISOString().split('T')[0];

        const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startDate: fmt(startDate),
                    endDate: fmt(endDate),
                    dimensions: ['query', 'page'],
                    rowLimit: 5000,
                    type: 'web',
                }),
            }
        );

        if (!res.ok) {
            return NextResponse.json({ error: `GSC API error: ${res.status}` }, { status: 502 });
        }

        const data = await res.json();
        const rows = (data.rows || []) as Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>;

        // Group by query
        const grouped = new Map<string, PageOnQuery[]>();
        for (const row of rows) {
            const query = row.keys[0];
            const page = row.keys[1];
            const entry: PageOnQuery = {
                page,
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: +((row.ctr || 0) * 100).toFixed(2),
                position: +(row.position || 0).toFixed(1),
            };
            if (!grouped.has(query)) grouped.set(query, []);
            grouped.get(query)!.push(entry);
        }

        // Filter: query must have ≥2 pages and at least one page with ≥10 impressions
        const cannibalized: CannibalizedQuery[] = [];
        for (const [query, pages] of grouped) {
            if (pages.length < 2) continue;
            const totalImpressions = pages.reduce((s, p) => s + p.impressions, 0);
            if (totalImpressions < 10) continue;
            // Skip if one page dominates (top page has >85% of impressions — not really cannibalization)
            const sortedPages = [...pages].sort((a, b) => b.impressions - a.impressions);
            if (sortedPages[0].impressions / totalImpressions > 0.85) continue;
            const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);
            const bestPosition = Math.min(...pages.map(p => p.position));
            cannibalized.push({
                query,
                pages: sortedPages,
                totalClicks,
                totalImpressions,
                bestPosition,
                severity: classifySeverity(pages),
            });
        }

        // Sort by severity then total impressions
        const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        cannibalized.sort((a, b) => {
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[b.severity] - severityOrder[a.severity];
            }
            return b.totalImpressions - a.totalImpressions;
        });

        return NextResponse.json({ cannibalized: cannibalized.slice(0, 50) });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch cannibalization data';
        console.error('[cannibalization] Error:', message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
