import { adminStore } from '@/lib/mcp/adminStore';
import { json, requireUser } from '@/lib/mcp/dashboardApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Recent tool calls (no arguments or results), newest first. */
export async function GET(req: Request) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const limit = Math.max(1, Math.min(200, Number(new URL(req.url).searchParams.get('limit')) || 50));
    const { rows } = await adminStore.listAudit(auth.user.id, limit).catch(() => ({ rows: [] }));
    return json({ rows });
}
