import { NextResponse } from 'next/server';
import { annotationMode, showsNotes, toPublicNotes, widgetRange, type PublicNote } from '@/lib/builder/chartMarks';
import { resolveRange, todayIn } from '@/lib/builder/dates';
import { publicControlsFromQuery } from '@/lib/builder/publicDoc';
import { checkUnlockKey, clientIp, rateLimited, unlockKeyFrom } from '@/lib/builder/server/access';
import { ownerNotes, noteScopesFor } from '@/lib/builder/server/notes';
import { directoryFor, jsonError, pageWidgets } from '@/lib/builder/server/service';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import type { SourceRef } from '@/lib/builder/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/notes?page=&range=&compare=&f.<controlId>=
 * The owner's chart notes on one page of a shared dashboard, by time series widget: { notes: { [widgetId]: [{ date, title }] } }.
 * Only when the owner switched "Show my chart notes" on (doc.settings.shareNotes); otherwise empty.
 * Dates follow the same viewer state rules as the data query (only what the owner allows), so a
 * viewer can never read notes outside the ranges the dashboard can show. No ids, scopes or descriptions.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!isShareToken(token)) return jsonError(404, 'This dashboard is no longer shared.');
    if (rateLimited(`pubn:${token}:${clientIp(req)}`, 120)) return jsonError(429, 'Too many requests. Please try again later.');
    const row = await getPublicRow(token, false).catch(() => null);
    if (!row || !row.ownerIdentifier) return jsonError(404, 'This dashboard is no longer shared.');
    const rec = toRecord(row);
    if (rec.share.hasPassword && !checkUnlockKey(token, unlockKeyFrom(req, token))) {
        return jsonError(401, 'This dashboard needs a password.', { requiresPassword: true });
    }
    const headers = {
        'Cache-Control': rec.share.hasPassword ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Robots-Tag': 'noindex',
    };
    const out: Record<string, PublicNote[]> = {};
    if (!rec.doc.settings.shareNotes) return NextResponse.json({ notes: out }, { headers });

    const controls = publicControlsFromQuery(new URL(req.url).searchParams, rec.doc, rec.share);
    const widgets = pageWidgets(rec.doc, controls.pageId).map((x) => x.widget)
        .filter((w) => w.type === 'timeseries' && showsNotes(annotationMode(w.config.annotations)));
    if (!widgets.length) return NextResponse.json({ notes: out }, { headers });
    try {
        const owner = row.ownerIdentifier;
        const dir = await directoryFor(owner);
        const today = todayIn(rec.doc.settings.timezone);
        const resolved = { range: resolveRange(controls.date.range, today), today };
        const cache = new Map<string, Promise<PublicNote[]>>();
        await Promise.all(widgets.map(async (w) => {
            const src = (w.source?.type === 'default' || !w.source ? rec.doc.defaultSource : w.source) as Exclude<SourceRef, { type: 'default' }>;
            const { scopes } = noteScopesFor(src, dir);
            const range = widgetRange(w, resolved);
            const key = `${scopes.join('|')}@${range.start}..${range.end}`;
            if (!cache.has(key)) cache.set(key, ownerNotes(owner, scopes, range).then(toPublicNotes));
            out[w.id] = await cache.get(key)!;
        }));
        return NextResponse.json({ notes: out }, { headers });
    } catch (err) {
        console.error('[dashboards] public notes failed', err);
        return jsonError(502, 'Notes are temporarily unavailable.');
    }
}
