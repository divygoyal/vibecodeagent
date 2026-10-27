import { NextResponse } from 'next/server';

import { getSessionUserId, jsonError, NO_STORE } from '../../_lib/context';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const SITE_KEY = /^[a-z0-9.:-]{1,300}$/;
const ACTION_ID = /^[a-z_]{1,40}:[0-9a-f]{8}$/;
const STATUSES = new Set(['open', 'done', 'dismissed']);

/**
 * Done / dismissed state of the site Actions tasks, stored per user in the
 * admin DB (site_action_states, migration 023). This only writes TrafficClaw's
 * own data, never Google's.
 *
 * GET  /api/site/actions/state?site=<route host>
 * POST /api/site/actions/state { site, actionId, status: open|done|dismissed, title? }
 */
export async function GET(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) return jsonError('Unauthorized', 401);
    const site = new URL(req.url).searchParams.get('site') ?? '';
    if (!SITE_KEY.test(site)) return jsonError('Unknown site.', 400);
    if (!ADMIN_API_KEY) return NextResponse.json({ states: [], unavailable: true }, { headers: NO_STORE });
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/site-actions/states?user_identifier=${encodeURIComponent(userId)}&site_key=${encodeURIComponent(site)}`,
            { headers: { 'X-API-Key': ADMIN_API_KEY }, signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return NextResponse.json({ states: [], unavailable: true }, { headers: NO_STORE });
        return NextResponse.json(await res.json(), { headers: NO_STORE });
    } catch {
        return NextResponse.json({ states: [], unavailable: true }, { headers: NO_STORE });
    }
}

export async function POST(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) return jsonError('Unauthorized', 401);
    const body = await req.json().catch(() => null) as { site?: string; actionId?: string; status?: string; title?: string } | null;
    if (!body || !SITE_KEY.test(body.site ?? '') || !ACTION_ID.test(body.actionId ?? '') || !STATUSES.has(body.status ?? '')) {
        return jsonError('Invalid action state.', 400);
    }
    if (!ADMIN_API_KEY) return jsonError('Saving is unavailable right now.', 503);
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/site-actions/states`, {
            method: 'PUT',
            headers: { 'X-API-Key': ADMIN_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_identifier: userId,
                site_key: body.site,
                action_id: body.actionId,
                status: body.status,
                title: typeof body.title === 'string' ? body.title.slice(0, 300) : null,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return jsonError('Could not save. Try again.', 502);
        return NextResponse.json(await res.json(), { headers: NO_STORE });
    } catch {
        return jsonError('Could not save. Try again.', 502);
    }
}
