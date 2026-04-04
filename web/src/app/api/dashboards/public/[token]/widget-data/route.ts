import { NextResponse } from 'next/server';
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

// ── Simple in-memory rate limiter (per token, 60 req/min) ───

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  if (entry.count > 60) return true;
  return false;
}

// Periodically clean up stale entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

/**
 * GET /api/dashboards/public/[token]/widget-data?range=30d
 *
 * Public endpoint (no auth). Fetches live GA4 + GSC data using
 * the dashboard owner's stored Google tokens, rate-limited.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ── Validate token
  if (!token || typeof token !== 'string' || token.length < 8) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // ── Rate limiting
  if (isRateLimited(token)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  // ── Read optional range parameter
  const allowedRanges = ['7d', '14d', '30d', '90d'];
  const rangeParam = new URL(req.url).searchParams.get('range') || '30d';
  const range = allowedRanges.includes(rangeParam) ? rangeParam : '30d';

  try {
    // 1. Fetch dashboard config from admin API (public endpoint returns ownerIdentifier)
    const dashRes = await fetch(
      `${ADMIN_API_URL}/api/custom-dashboards/public/${token}`,
      { headers: { 'X-API-Key': ADMIN_API_KEY } },
    );

    if (!dashRes.ok) {
      if (dashRes.status === 404) {
        return NextResponse.json({ error: 'Dashboard not found or not shared' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: dashRes.status });
    }

    const dashboard = await dashRes.json();
    const widgets: WidgetConfig[] = dashboard.widgets || [];
    const propertyId: string = dashboard.propertyId || '';
    const siteUrl: string = dashboard.siteUrl || '';
    const ownerIdentifier: string = dashboard.ownerIdentifier || '';

    if (!ownerIdentifier) {
      return NextResponse.json(
        { error: 'Dashboard owner could not be resolved' },
        { status: 503 },
      );
    }

    // If no widgets, return empty data
    if (!widgets.length) {
      return NextResponse.json({ widgetData: {}, fetchedAt: new Date().toISOString() });
    }

    // 2. Get dashboard owner's Google OAuth tokens
    const tokens = await fetchGoogleTokensFromDb(ownerIdentifier);
    if (!tokens) {
      return NextResponse.json(
        { error: 'Analytics data is temporarily unavailable' },
        { status: 503 },
      );
    }

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(tokens.accessToken, tokens.refreshToken);
    } catch {
      return NextResponse.json(
        { error: 'Analytics data is temporarily unavailable' },
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
            console.error('Public widget data — GA4 fetch error:', err);
            return null;
          })
        : Promise.resolve(null),
      needsGSC && siteUrl
        ? fetchSeoDashboard(accessToken, siteUrl).catch((err) => {
            console.error('Public widget data — GSC fetch error:', err);
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
    console.error('Public widget data error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
