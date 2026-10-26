import { NextResponse } from 'next/server';
import { lbAdmin } from '@/lib/leaderboard/admin';
import { parseEntryId, requireUser } from '@/lib/leaderboard/owner';

export const dynamic = 'force-dynamic';

const INQUIRY_STATUSES = new Set(['new', 'read', 'replied', 'archived']);
const SLOT_STATUSES = new Set(['new', 'accepted', 'declined', 'paid', 'cancelled']);

/** PATCH /api/leaderboard/me/inbox/[source]/[id]  { status }: move an offer or slot request along. */
export async function PATCH(req: Request, { params }: { params: Promise<{ source: string; id: string }> }) {
    const auth = await requireUser();
    if ('error' in auth) return auth.error;
    const { source, id } = await params;
    const itemId = parseEntryId(id);
    if (!itemId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    let body: { status?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const status = String(body.status || '');

    if (source === 'inquiry') {
        if (!INQUIRY_STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        const res = await lbAdmin(`/api/lb/inquiries/${itemId}`, { method: 'PATCH', query: { user_identifier: auth.user.userId }, body: { status } });
        return res.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: res.error }, { status: res.status || 502 });
    }
    if (source === 'slot_request') {
        if (!SLOT_STATUSES.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        const res = await lbAdmin(`/api/ad-slot-requests/${itemId}`, { method: 'PATCH', query: { user_identifier: auth.user.userId }, body: { status } });
        return res.ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: res.error }, { status: res.status || 502 });
    }
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
}
