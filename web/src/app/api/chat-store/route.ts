/**
 * Phase B-1 — server-side chat memory proxy.
 *
 * Thin pass-through to the admin API for ChatThread + ChatMessage CRUD.
 * Uses session.user.id as the user_identifier so the admin can resolve to
 * the canonical DB User. The web client never talks to admin directly.
 *
 * Routes:
 *   GET    /api/chat-store?action=list_threads               → admin GET /api/chat/threads
 *   POST   /api/chat-store?action=create_thread     body=…   → admin POST /api/chat/threads
 *   PATCH  /api/chat-store?action=update_thread&id=… body=…  → admin PATCH /api/chat/threads/{id}
 *   DELETE /api/chat-store?action=delete_thread&id=…&hard=…  → admin DELETE /api/chat/threads/{id}
 *   GET    /api/chat-store?action=list_messages&thread=…     → admin GET /api/chat/threads/{id}/messages
 *   POST   /api/chat-store?action=append_message&thread=…    → admin POST /api/chat/threads/{id}/messages
 *
 * Single ?action= router keeps the surface easy for the client and avoids
 * a per-resource route file forest.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

async function proxy(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
    const init: RequestInit = {
        method,
        headers: {
            'X-API-Key': ADMIN_API_KEY,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
    };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(`${ADMIN_API_URL}${path}`, init);
    const text = await res.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: res.status, data };
}

async function requireUserId(): Promise<string | NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ADMIN_API_KEY) {
        return NextResponse.json({ error: 'Admin API not configured' }, { status: 503 });
    }
    // @ts-expect-error - id added in callbacks
    return String(session.user.id);
}

export async function GET(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'list_threads') {
        const includeArchived = searchParams.get('include_archived') === 'true';
        const limit = searchParams.get('limit') || '50';
        const { status, data } = await proxy('GET',
            `/api/chat/threads?user_identifier=${encodeURIComponent(userId)}&include_archived=${includeArchived}&limit=${limit}`);
        return NextResponse.json(data, { status });
    }
    if (action === 'list_messages') {
        const thread = searchParams.get('thread');
        if (!thread) return NextResponse.json({ error: 'thread required' }, { status: 400 });
        const limit = searchParams.get('limit') || '50';
        const { status, data } = await proxy('GET',
            `/api/chat/threads/${encodeURIComponent(thread)}/messages?user_identifier=${encodeURIComponent(userId)}&limit=${limit}`);
        return NextResponse.json(data, { status });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    if (action === 'create_thread') {
        const { status, data } = await proxy('POST', `/api/chat/threads`, {
            user_identifier: userId,
            id: body.id,
            title: body.title,
            persona: body.persona,
            site_url: body.site_url,
            repo: body.repo,
        });
        return NextResponse.json(data, { status });
    }
    if (action === 'append_message') {
        const thread = searchParams.get('thread');
        if (!thread) return NextResponse.json({ error: 'thread required' }, { status: 400 });
        const { status, data } = await proxy('POST',
            `/api/chat/threads/${encodeURIComponent(thread)}/messages`, {
                user_identifier: userId,
                role: body.role,
                content: body.content,
                tools_json: body.tools_json,
                model: body.model,
                intent: body.intent,
                input_tokens: body.input_tokens,
                output_tokens: body.output_tokens,
                latency_ms: body.latency_ms,
            });
        return NextResponse.json(data, { status });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    if (action === 'update_thread') {
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { status, data } = await proxy('PATCH',
            `/api/chat/threads/${encodeURIComponent(id)}?user_identifier=${encodeURIComponent(userId)}`, body);
        return NextResponse.json(data, { status });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
    const userId = await requireUserId();
    if (typeof userId !== 'string') return userId;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    if (action === 'delete_thread') {
        const id = searchParams.get('id');
        const hard = searchParams.get('hard') === 'true';
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
        const { status, data } = await proxy('DELETE',
            `/api/chat/threads/${encodeURIComponent(id)}?user_identifier=${encodeURIComponent(userId)}&hard=${hard}`);
        return NextResponse.json(data, { status });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
