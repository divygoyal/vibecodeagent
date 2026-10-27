import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/googleApi';
import { getGoogleCredentialsForRequest } from '@/lib/serverAuth';

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const siteUrl = req.nextUrl.searchParams.get('siteUrl');
  const keyword = req.nextUrl.searchParams.get('keyword');

  if (!siteUrl || !keyword) {
    return NextResponse.json({ error: 'Missing siteUrl or keyword' }, { status: 400 });
  }

  try {
    // @ts-expect-error - id added in callbacks
    const userId = session.user.id;

    // Server-only: Google tokens from the session JWT, then the admin DB (lib/serverAuth.ts).
    const { accessToken: googleAccess, refreshToken: googleRefresh } = await getGoogleCredentialsForRequest(req, String(userId));

    if (!googleAccess && !googleRefresh) {
      return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
    }

    const token = await getValidAccessToken(googleAccess, googleRefresh);

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 28);
    const trendStart = new Date(endDate);
    trendStart.setDate(trendStart.getDate() - 7);

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

    // Query 1: Pages ranking for this keyword (last 28 days)
    // Query 2: Daily trend for this keyword (last 7 days)
    const [pagesData, trendData] = await Promise.all([
      gscFetch({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['query', 'page'],
        dimensionFilterGroups: [{
          filters: [{ dimension: 'query', operator: 'equals', expression: keyword }],
        }],
        rowLimit: 100,
        type: 'web',
      }),
      gscFetch({
        startDate: formatDate(trendStart),
        endDate: formatDate(endDate),
        dimensions: ['query', 'date'],
        dimensionFilterGroups: [{
          filters: [{ dimension: 'query', operator: 'equals', expression: keyword }],
        }],
        rowLimit: 100,
        type: 'web',
      }),
    ]);

    const pages = (pagesData.rows || []).map((r: any) => ({
      page: r.keys[1],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(1),
      position: +(r.position || 0).toFixed(1),
    }));

    const trend = (trendData.rows || []).map((r: any) => ({
      date: r.keys[1],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: +((r.ctr || 0) * 100).toFixed(1),
      position: +(r.position || 0).toFixed(1),
    })).sort((a: any, b: any) => a.date.localeCompare(b.date));

    return NextResponse.json({ pages, trend });
  } catch (error: any) {
    console.error('[keyword-detail] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch keyword detail data' },
      { status: 500 }
    );
  }
}
