import { NextResponse } from 'next/server';

/**
 * One server-log line per error-boundary hit in a browser (see
 * components/app/ErrorScreen.tsx), carrying the digest Next.js also logs for
 * the server side of the same error. Public and write-only: small bodies, a
 * per-IP limit, nothing stored.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { n: number; t: number }>();

const clean = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max) : undefined;

export async function POST(req: Request) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
    const now = Date.now();
    const h = hits.get(ip);
    if (h && now - h.t < WINDOW_MS) {
        if (++h.n > MAX_PER_WINDOW) return NextResponse.json({ error: 'Too many reports' }, { status: 429 });
    } else {
        if (hits.size > 5_000) hits.clear();
        hits.set(ip, { n: 1, t: now });
    }

    let body: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse((await req.text()).slice(0, 4_000));
        body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    console.error(
        `[client-error] scope=${clean(body.scope, 20) ?? '-'} digest=${clean(body.digest, 40) ?? '-'} path=${clean(body.path, 200) ?? '-'} message=${JSON.stringify(clean(body.message, 300) ?? '')}`,
    );
    return new NextResponse(null, { status: 204 });
}
