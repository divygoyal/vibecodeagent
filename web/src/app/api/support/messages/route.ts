/**
 * Web proxy for the user's in-app support thread.
 *
 * GET   /api/support/messages   → fetch full thread (oldest first)
 * POST  /api/support/messages   → user posts a new message
 *
 * Mirrors the workspace-route pattern: inject session.user.id as the
 * identifier so the admin API can resolve the actual DB user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { MAX_INPUT_CHARS, ERR_MESSAGE_TOO_LONG } from '@/lib/chatLimits';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

async function requireUserId(): Promise<string | NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    }
    // @ts-expect-error - id added in NextAuth callbacks
    return String(session.user.id);
}

export async function GET() {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/support/messages`,
            {
                headers: { 'X-API-Key': ADMIN_API_KEY },
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            },
        );
        if (!res.ok) {
            return NextResponse.json({ messages: [], exists: false }, { status: 200 });
        }
        return NextResponse.json(await res.json());
    } catch {
        // Network errors are non-fatal — let the client show empty state.
        return NextResponse.json({ messages: [], exists: false, degraded: true }, { status: 200 });
    }
}

export async function POST(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;

    let body: { content?: unknown } = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const content = typeof body.content === 'string' ? body.content : '';
    if (!content.trim()) {
        return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
    }
    // Pre-flight cap so we don't roundtrip a 400 from the admin API for a known bad input.
    if (content.length > MAX_INPUT_CHARS) {
        return NextResponse.json(
            {
                error: `Message is ${content.length} characters; the limit is ${MAX_INPUT_CHARS}. Trim or split.`,
                code: ERR_MESSAGE_TOO_LONG,
                limit: MAX_INPUT_CHARS,
                length: content.length,
            },
            { status: 400 },
        );
    }

    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/support/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': ADMIN_API_KEY,
                },
                body: JSON.stringify({ content }),
                cache: 'no-store',
                signal: AbortSignal.timeout(8000),
            },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return NextResponse.json(
                { error: data.detail || 'Failed to send message' },
                { status: res.status },
            );
        }
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Network error sending message' },
            { status: 502 },
        );
    }
}
