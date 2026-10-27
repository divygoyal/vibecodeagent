import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { rotateShare, StoreError } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

/** POST /api/dashboards/[id]/share/rotate: "Reset link". A new token; the old link stops working. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    try {
        const data = await rotateShare(userId, id);
        return NextResponse.json({ shareToken: data.shareToken, share: data.share, id });
    } catch (err) {
        console.error('[dashboards] rotate failed', err);
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to reset the link');
    }
}
