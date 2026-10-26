import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { cleanOpenTo, cleanPrivacy, cleanProfileFields, parseEntryId, requireUser } from '@/lib/leaderboard/owner';
import type { BoardRow, ProfilePayload } from '@/lib/leaderboard/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leaderboard/me/[entryId]/preview: how the profile and its board row look
 * to the public with the given (unsaved) draft. Produced by the same server code that
 * serves the public pages, so the preview cannot show more or less than the real thing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const entryId = parseEntryId((await params).entryId);
    if (!entryId) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 });
    let body: Record<string, unknown> = {};
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }
    const fields = cleanProfileFields(body);
    if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
    const range = ['7d', '28d', '3m'].includes(String(body.range)) ? String(body.range) : '28d';
    const res = await lbAdmin<{ profile: ProfilePayload | null; row: BoardRow | null }>(`/api/lb/entry/${entryId}/preview`, {
        method: 'POST',
        query: { user_identifier: auth.user.userId },
        body: {
            ...fields.value,
            privacy: cleanPrivacy(body.privacy),
            open_to: cleanOpenTo(body.open_to),
            range,
        },
    });
    if (!res.ok || !res.data) return NextResponse.json({ error: res.error || 'Preview unavailable' }, { status: res.status >= 400 && res.status < 500 ? res.status : 502 });
    return NextResponse.json(res.data);
}
