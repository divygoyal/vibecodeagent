import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  fetchGoogleTokensFromDb,
  getValidAccessToken,
  fetchAnalyticsDashboard,
  fetchSeoDashboard,
} from '@/lib/googleApi';
import { mapWidgetData } from '@/lib/widgetDataMapper';
import type { WidgetConfig } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Session = { user?: { id: string; [key: string]: any } } | null;

/**
 * GET /api/dashboards/[id]/widget-data?range=30d
 *
 * Authenticated endpoint. Fetches live GA4 + GSC data for the dashboard owner,
 * then maps it to per-widget data using the widget data mapper.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions) as Session;
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    // Read optional range parameter
    const allowedRanges = ['7d', '14d', '30d', '90d'];
    const rangeParam = new URL(req.url).searchParams.get('range') || '30d';
    const range = allowedRanges.includes(rangeParam) ? rangeParam : '30d';

    // 1. Fetch dashboard config from admin API
    const dashRes = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/${id}?user_identifier=${userId}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );

    if (!dashRes.ok) {
      if (dashRes.status === 404) {
        return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: dashRes.status });
    }

    const dashboard = await dashRes.json();
    const widgets: WidgetConfig[] = dashboard.widgets || [];
    const propertyId: string = dashboard.propertyId || '';
    const siteUrl: string = dashboard.siteUrl || '';

    // If no widgets, return empty data
    if (!widgets.length) {
      return NextResponse.json({ widgetData: {}, fetchedAt: new Date().toISOString() });
    }

    // 2. Get user's Google OAuth tokens
    const tokens = await fetchGoogleTokensFromDb(userId);
    if (!tokens) {
      return NextResponse.json(
        { error: 'Google account not connected. Please connect Google in Settings.' },
        { status: 503 },
      );
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch {
      return NextResponse.json(
        { error: 'Google authentication expired. Please reconnect in Settings.' },
        { status: 503 },
      );
    }

    // 3. Determine which data sources are needed
    const needsGA4 = widgets.some((w) => w.dataSource === 'ga4');
    const needsGSC = widgets.some((w) => w.dataSource === 'gsc' || w.type === 'seo-performance' || w.type === 'keywords-table');

    // 4. Fetch data in parallel
    const [ga4Data, gscData] = await Promise.all([
      needsGA4 && propertyId
        ? fetchAnalyticsDashboard(accessToken, propertyId, range).catch((err) => {
            console.error('Widget data — GA4 fetch error:', err);
            return null;
          })
        : Promise.resolve(null),
      needsGSC && siteUrl
        ? fetchSeoDashboard(accessToken, siteUrl).catch((err) => {
            console.error('Widget data — GSC fetch error:', err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    // 5. Map bulk data to per-widget data
    const widgetData = mapWidgetData(widgets, ga4Data, gscData);

    return NextResponse.json({
      widgetData,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Widget data error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
