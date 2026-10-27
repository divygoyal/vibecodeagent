import { NextResponse } from 'next/server';
import { checkUnlockKey, clientIp, rateLimited, unlockKeyFrom } from '@/lib/builder/server/access';
import { jsonError, ownerDeps } from '@/lib/builder/server/service';
import { getPublicRow, isShareToken, shareOf } from '@/lib/builder/server/store';
import { v1WidgetData } from '@/lib/builder/server/v1compat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/widget-data?range=30d (v1, deprecated): thin adapter over the
 * v2 engine for one release. Same token rule and rate limit as the v2 public query.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'Dashboard not found or not shared');
    if (rateLimited(`pubv1:${token}:${clientIp(req)}`, 60)) return jsonError(429, 'Too many requests. Please try again later.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row || !row.ownerIdentifier) return jsonError(404, 'Dashboard not found or not shared');
    if (shareOf(row).hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) return jsonError(401, 'Password required', { requiresPassword: true });
    const range = new URL(req.url).searchParams.get('range') ?? '30d';
    const data = await v1WidgetData(row, range, ownerDeps(row.ownerIdentifier, 'public'));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
