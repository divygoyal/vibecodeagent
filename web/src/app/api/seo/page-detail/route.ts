import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken, fetchGoogleTokensFromDb } from '@/lib/googleApi';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const siteUrl = req.nextUrl.searchParams.get('siteUrl');
  const pageUrl = req.nextUrl.searchParams.get('pageUrl');

  if (!siteUrl || !pageUrl) {
    return NextResponse.json({ error: 'Missing siteUrl or pageUrl' }, { status: 400 });
  }

  try {
    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    // Get Google tokens from JWT first, fall back to admin DB
    const jwt = await getToken({ req: req as any }) as any;
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

    const token = await getValidAccessToken(googleAccess, googleRefresh);

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 28);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const gscFetch = async (body: object) => {
      const res = await fetch(
        `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!res.ok) throw new Error(`GSC API error: ${res.status}`);
      return res.json();
    };

    // Query 1: All keywords ranking on this page
    // Query 2: Device breakdown for this page
    const [keywordsData, devicesData] = await Promise.all([
      gscFetch({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['page', 'query'],
        dimensionFilterGroups: [{
          filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
        }],
        rowLimit: 100,
        type: 'web',
      }),
      gscFetch({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['page', 'device'],
        dimensionFilterGroups: [{
          filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
        }],
        rowLimit: 10,
        type: 'web',
      }),
    ]);

    const keywords = (keywordsData.rows || []).map((r: any) => ({
      query: r.keys[1],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(1),
      position: +(r.position || 0).toFixed(1),
    }));

    const devices = (devicesData.rows || []).map((r: any) => ({
      device: r.keys[1],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(1),
      position: +(r.position || 0).toFixed(1),
    }));

    return NextResponse.json({ keywords, devices });
  } catch (error: any) {
    console.error('[page-detail] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch page detail data' },
      { status: 500 }
    );
  }
}
