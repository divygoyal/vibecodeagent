import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const siteUrl = req.nextUrl.searchParams.get('siteUrl');
  const timeframe = req.nextUrl.searchParams.get('timeframe') || '28d';
  if (!siteUrl) {
    return NextResponse.json({ error: 'Missing siteUrl' }, { status: 400 });
  }

  try {
    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    // Get Google tokens from JWT first, fall back to admin DB
    const jwt = await getToken({ req: req as any }) as any;
    let googleAccess = jwt?.googleAccessToken as string | undefined;
    let googleRefresh = jwt?.googleRefreshToken as string | undefined;

    // Fallback: fetch from admin DB (handles case where user signed in with GitHub)
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

    // Calculate date ranges based on timeframe
    const now = new Date();
    const days = timeframe === '7d' ? 7 : timeframe === '28d' ? 28 : timeframe === '3m' ? 90 : 180;
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    const compEndDate = new Date(startDate);
    compEndDate.setDate(compEndDate.getDate() - 1);
    const compStartDate = new Date(compEndDate);
    compStartDate.setDate(compStartDate.getDate() - days);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const fetchQueries = async (start: Date, end: Date) => {
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: formatDate(start),
            endDate: formatDate(end),
            dimensions: ['query'],
            rowLimit: 500,
            type: 'web',
          }),
        }
      );
      if (!res.ok) throw new Error(`GSC API error: ${res.status}`);
      const data = await res.json();
      return (data.rows || []).map((r: any) => ({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));
    };

    const fetchPages = async (start: Date, end: Date) => {
      const res = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: formatDate(start),
            endDate: formatDate(end),
            dimensions: ['query', 'page'],
            rowLimit: 1000,
            type: 'web',
          }),
        }
      );
      if (!res.ok) throw new Error(`GSC API error: ${res.status}`);
      const data = await res.json();
      return (data.rows || []).map((r: any) => ({
        query: r.keys[0],
        page: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }));
    };

    const [queries, comparisonQueries, queryPages] = await Promise.all([
      fetchQueries(startDate, endDate),
      fetchQueries(compStartDate, compEndDate),
      fetchPages(startDate, endDate),
    ]);

    return NextResponse.json({ queries, comparisonQueries, queryPages });
  } catch (error: any) {
    console.error('[opportunities] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch opportunities data' },
      { status: 500 }
    );
  }
}
