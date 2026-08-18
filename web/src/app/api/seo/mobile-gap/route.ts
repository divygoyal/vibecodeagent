import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const siteUrl = req.nextUrl.searchParams.get('siteUrl');
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

    // Last 28 days
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 28);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Query GSC with query + device dimensions
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query', 'device'],
          rowLimit: 500,
          type: 'web',
        }),
      }
    );

    if (!res.ok) throw new Error(`GSC API error: ${res.status}`);
    const gscData = await res.json();
    const rows = gscData.rows || [];

    // Group rows by query
    const queryMap = new Map<string, { mobile?: any; desktop?: any }>();

    for (const row of rows) {
      const query = row.keys[0];
      const device = row.keys[1]; // MOBILE, DESKTOP, TABLET

      if (device !== 'MOBILE' && device !== 'DESKTOP') continue;

      if (!queryMap.has(query)) {
        queryMap.set(query, {});
      }

      const entry = queryMap.get(query)!;
      const metrics = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      };

      if (device === 'MOBILE') {
        entry.mobile = metrics;
      } else {
        entry.desktop = metrics;
      }
    }

    // Build results: only queries with BOTH mobile and desktop data
    const data: any[] = [];

    for (const [query, devices] of queryMap) {
      if (!devices.mobile || !devices.desktop) continue;

      const gap = devices.desktop.position - devices.mobile.position; // negative = mobile worse
      const impact = devices.mobile.impressions * Math.abs(gap);

      data.push({
        query,
        page: '', // GSC query+device doesn't return page
        mobilePosition: Math.round(devices.mobile.position * 10) / 10,
        desktopPosition: Math.round(devices.desktop.position * 10) / 10,
        mobileCtr: Math.round(devices.mobile.ctr * 10000) / 10000,
        desktopCtr: Math.round(devices.desktop.ctr * 10000) / 10000,
        mobileClicks: devices.mobile.clicks,
        desktopClicks: devices.desktop.clicks,
        mobileImpressions: devices.mobile.impressions,
        desktopImpressions: devices.desktop.impressions,
        gap: Math.round(gap * 10) / 10,
        impact: Math.round(impact),
      });
    }

    // Sort by impact descending
    data.sort((a, b) => b.impact - a.impact);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('[mobile-gap] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch mobile gap data' },
      { status: 500 }
    );
  }
}
