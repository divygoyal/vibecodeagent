import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';
import { computeAlerts } from '@/lib/alertEngine';

export const dynamic = 'force-dynamic';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// In-memory alert cache per user (15-minute TTL), bounded to prevent memory leak
const ALERT_CACHE_MAX = 500;
const alertCache = new Map<string, { alerts: any[]; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

// Dismissed alerts per user session, bounded
const DISMISSED_MAX = 500;
const dismissedSets = new Map<string, Set<string>>();

function formatDate(d: Date) {
    return d.toISOString().split('T')[0];
}

async function fetchSeoDataForAlerts(token: string, siteUrl: string) {
    const today = new Date();
    const endDate = formatDate(new Date(today.getTime() - 2 * 86400000)); // 2 days ago (GSC lag)
    const startDate = formatDate(new Date(today.getTime() - 30 * 86400000));
    const prevStart = formatDate(new Date(today.getTime() - 60 * 86400000));
    const prevEnd = formatDate(new Date(today.getTime() - 31 * 86400000));

    const fetchGSC = async (start: string, end: string, dims: string[], limit = 100) => {
        const body = { startDate: start, endDate: end, dimensions: dims, rowLimit: limit, type: 'web' };
        const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return null;
        return res.json();
    };

    const [currentData, prevData, trendData] = await Promise.all([
        fetchGSC(startDate, endDate, ['query'], 200),
        fetchGSC(prevStart, prevEnd, ['query'], 50),
        fetchGSC(startDate, endDate, ['date'], 60),
    ]);

    const currentRows = currentData?.rows || [];
    const prevRows = prevData?.rows || [];

    // Build KPIs
    const totalClicks = currentRows.reduce((s: number, r: any) => s + r.clicks, 0);
    const totalImpressions = currentRows.reduce((s: number, r: any) => s + r.impressions, 0);
    const avgPosition = currentRows.length > 0 ? currentRows.reduce((s: number, r: any) => s + r.position, 0) / currentRows.length : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    const prevClicks = prevRows.reduce((s: number, r: any) => s + r.clicks, 0);
    const prevImpressions = prevRows.reduce((s: number, r: any) => s + r.impressions, 0);
    const prevPosition = prevRows.length > 0 ? prevRows.reduce((s: number, r: any) => s + r.position, 0) / prevRows.length : 0;

    const changeClicks = prevClicks > 0 ? Math.round(((totalClicks - prevClicks) / prevClicks) * 100) : 0;
    const changeImpressions = prevImpressions > 0 ? Math.round(((totalImpressions - prevImpressions) / prevImpressions) * 100) : 0;
    const changePosition = Math.round((avgPosition - prevPosition) * 10) / 10;

    const queries = currentRows.map((r: any) => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 10000) / 100,
        position: Math.round(r.position * 10) / 10,
    }));

    const trend = (trendData?.rows || []).map((r: any) => ({
        date: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
    }));

    return {
        kpis: { totalClicks, totalImpressions, avgCTR: Math.round(avgCTR * 100) / 100, avgPosition: Math.round(avgPosition * 10) / 10, changeClicks, changeImpressions, changePosition },
        queries,
        pages: [],
        trend,
    };
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = String(session.user.id);
        const siteUrl = req.nextUrl.searchParams.get('siteUrl');
        if (!siteUrl) {
            return NextResponse.json({ error: 'siteUrl required' }, { status: 400 });
        }

        // Check cache
        const cacheKey = `${userId}:${siteUrl}`;
        const cached = alertCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
            const dismissed = dismissedSets.get(userId) || new Set();
            const filtered = cached.alerts.filter(a => !dismissed.has(a.id));
            return NextResponse.json({ alerts: filtered, alertCount: filtered.length, fromCache: true });
        }

        // Get Google token
        const jwt = await getToken({ req: req as any }) as any;
        let accessToken = jwt?.googleAccessToken as string | undefined;
        let refreshToken = jwt?.googleRefreshToken as string | undefined;

        if (!accessToken && !refreshToken) {
            const dbTokens = await fetchGoogleTokensFromDb(userId);
            if (dbTokens) {
                accessToken = dbTokens.accessToken;
                refreshToken = dbTokens.refreshToken;
            }
        }

        if (!accessToken && !refreshToken) {
            return NextResponse.json({ alerts: [], alertCount: 0, error: 'No Google connection' });
        }

        const token = await getValidAccessToken(accessToken, refreshToken);
        const seoData = await fetchSeoDataForAlerts(token, siteUrl);
        const alerts = computeAlerts(seoData, null);

        // Cache the result (evict stale entries if at capacity)
        if (alertCache.size >= ALERT_CACHE_MAX) {
            const now = Date.now();
            for (const [k, v] of alertCache) {
                if (now - v.ts > CACHE_TTL) alertCache.delete(k);
            }
            if (alertCache.size >= ALERT_CACHE_MAX) {
                const oldest = alertCache.keys().next().value;
                if (oldest) alertCache.delete(oldest);
            }
        }
        alertCache.set(cacheKey, { alerts, ts: Date.now() });

        // Filter dismissed
        const dismissed = dismissedSets.get(userId) || new Set();
        const filtered = alerts.filter(a => !dismissed.has(a.id));

        return NextResponse.json({ alerts: filtered, alertCount: filtered.length });
    } catch (error: any) {
        console.error('[ALERTS]', error?.message);
        return NextResponse.json({ alerts: [], alertCount: 0, error: 'Failed to compute alerts' });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // @ts-expect-error - id added in callbacks
        const userId = String(session.user.id);
        const { alertId } = await req.json();

        if (!alertId) {
            return NextResponse.json({ error: 'alertId required' }, { status: 400 });
        }

        if (!dismissedSets.has(userId)) {
            if (dismissedSets.size >= DISMISSED_MAX) {
                const oldest = dismissedSets.keys().next().value;
                if (oldest) dismissedSets.delete(oldest);
            }
            dismissedSets.set(userId, new Set());
        }
        const userSet = dismissedSets.get(userId)!;
        // Cap per-user dismissed alerts to prevent unbounded growth
        if (userSet.size >= 200) {
            const first = userSet.values().next().value;
            if (first) userSet.delete(first);
        }
        userSet.add(alertId);

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Failed to dismiss alert' }, { status: 500 });
    }
}
