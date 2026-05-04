/**
 * Phase B-5 — chat interrupt endpoint.
 *
 * The actual cancellation works client-side: the AIChatbot component holds
 * an AbortController for the in-flight fetch, and the Stop button calls
 * controller.abort(). The server-side ai-chat route already listens to
 * req.signal.aborted at every chunk boundary and bails out gracefully.
 *
 * THIS endpoint exists for two reasons:
 *   1. Telemetry — log when users interrupt so we can spot tools that
 *      consistently take long enough to be aborted (a quality signal).
 *   2. Future-proofing — when we move to a server-side-stateful planner
 *      (B2-full), the orchestrator needs a way to cancel an in-flight
 *      tool execution. This endpoint is the hook.
 *
 * For now it just logs and returns 200.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let body: { threadId?: string; directive?: string } = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    // @ts-expect-error - id added in callbacks
    const userId = String(session.user.id || '');
    console.info('[ai-chat:interrupt]', JSON.stringify({
        user: userId.slice(0, 8) + '…',
        thread: body.threadId,
        directive: body.directive?.slice(0, 100),
        ts: new Date().toISOString(),
    }));
    return NextResponse.json({ ok: true });
}
