import { NextResponse } from 'next/server';
import { rateLimited, sessionUserId } from '@/lib/builder/server/access';
import { ownerNotes, noteScopesFor } from '@/lib/builder/server/notes';
import { directoryFor, jsonError } from '@/lib/builder/server/service';
import { sourceRefSchema } from '@/lib/builder/schema';
import type { SourceRef } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/dashboards/notes?src=<SourceRef JSON>&start=&end=
 * The signed-in user's chart notes (the site pages' notes) for a widget source, for builder time
 * series. Also returns the scope a new note for that source is saved under, so the dashboard can
 * add one through the existing POST /api/annotations. Owner only; share links use
 * /api/dashboards/public/[token]/notes.
 */
export async function GET(req: Request) {
    const userId = await sessionUserId();
    if (!userId) return jsonError(401, 'Unauthorized');
    if (rateLimited(`dnotes:${userId}`, 240)) return jsonError(429, 'Too many requests. Slow down a little.');
    const q = new URL(req.url).searchParams;
    const start = q.get('start') ?? '';
    const end = q.get('end') ?? '';
    if (!ISO.test(start) || !ISO.test(end) || start > end) return jsonError(422, 'start and end are required');
    let raw: unknown;
    try {
        raw = JSON.parse(q.get('src') ?? '');
    } catch {
        return jsonError(422, 'src is invalid');
    }
    const src = sourceRefSchema.safeParse(raw);
    if (!src.success || src.data.type === 'default') return jsonError(422, 'src is invalid');
    try {
        const dir = await directoryFor(userId);
        const { scope, scopes } = noteScopesFor(src.data as Exclude<SourceRef, { type: 'default' }>, dir);
        const notes = await ownerNotes(userId, scopes, { start, end });
        return NextResponse.json({
            scope,
            notes: notes.map((n) => ({ id: n.id, date: n.date, title: n.title, description: n.description ?? null })),
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
        console.error('[dashboards] notes failed', err);
        return jsonError(502, 'Notes are temporarily unavailable.');
    }
}
