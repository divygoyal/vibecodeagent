import { NextResponse } from 'next/server';
import { sessionUserId } from '@/lib/builder/server/access';
import { jsonError } from '@/lib/builder/server/service';
import { getVersion, listVersions, StoreError } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

/** GET /api/dashboards/[id]/versions[?rev=N]: last 20 saved revisions, or one of them. Restore = PUT its doc. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    const { id } = await params;
    const rev = new URL(req.url).searchParams.get('rev');
    try {
        if (rev && /^\d+$/.test(rev)) return NextResponse.json(await getVersion(userId, id, Number(rev)));
        return NextResponse.json(await listVersions(userId, id));
    } catch (err) {
        return jsonError(err instanceof StoreError ? err.status : 500, 'Failed to load versions');
    }
}
