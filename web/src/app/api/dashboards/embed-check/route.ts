import { NextResponse } from 'next/server';
import { rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { appHostsFor, probeEmbeddableCached } from '@/lib/builder/server/embedProbe';
import { embedUrlProblem } from '@/lib/builder/embed';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/embed-check?url=https://...: can this page be shown in a frame? Signed-in owners only (the
 * editor and the owner's own view). The server reads the page's response headers once (SSRF guarded, see
 * server/embedProbe.ts) and the verdict is cached for an hour. Returns { status: 'ok' | 'blocked' | 'unknown', reason? }.
 */
export async function GET(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`embchk:${userId}`, 30)) return jsonError(429, 'Too many requests. Slow down a little.');
    const url = new URL(req.url).searchParams.get('url') ?? '';
    const problem = embedUrlProblem(url);
    if (problem) return NextResponse.json({ status: 'blocked', reason: problem }, { headers: { 'Cache-Control': 'no-store' } });
    const verdict = await probeEmbeddableCached(url, appHostsFor(req));
    return NextResponse.json(verdict, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
