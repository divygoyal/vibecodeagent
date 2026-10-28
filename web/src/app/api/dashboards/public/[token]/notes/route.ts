import { NextResponse } from 'next/server';
import { toPublicNotes, widgetRange, type PublicNote } from '@/lib/builder/chartMarks';
import { resolveRange, todayIn } from '@/lib/builder/dates';
import { checkUnlockKey, clientIp, rateLimited, unlockKeyFrom } from '@/lib/builder/server/access';
import { ownerNotes, noteScopesFor, publicNoteTargets } from '@/lib/builder/server/notes';
import { directoryFor, jsonError } from '@/lib/builder/server/service';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboards/public/[token]/notes?page=&range=&compare=&f.<controlId>=&s.<controlId>=
 * The owner's chart notes on one page of a shared dashboard, by time series widget: { notes: { [widgetId]: [{ date, title }] } }.
 * Only when the owner switched "Show my chart notes" on (doc.settings.shareNotes); otherwise empty.
 * Dates follow the same viewer state rules as the data query (only what the owner allows), so a
 * viewer can never read notes outside the ranges the dashboard can show, and a site switcher pick maps to
 * a site exactly as on the query route (opaque keys of allowed sites only, when viewers may switch), so
 * a viewer never reads notes of a site the share does not offer. No ids, scopes or descriptions.
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

    try {
        const owner = row.ownerIdentifier;
        const dir = await directoryFor(owner);
        const { controls, targets } = publicNoteTargets(rec.doc, rec.share, new URL(req.url).searchParams, dir, token);
        if (!targets.length) return NextResponse.json({ notes: out }, { headers });
        const today = todayIn(rec.doc.settings.timezone);
        const resolved = { range: resolveRange(controls.date.range, today), today };
        const cache = new Map<string, Promise<PublicNote[]>>();
        await Promise.all(targets.map(async ({ widget: w, src }) => {
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
