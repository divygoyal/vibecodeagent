import { applyLink } from '@/lib/builder/email/runner';
import { AdminScheduleStore } from '@/lib/builder/email/store';
import { verifyToken } from '@/lib/builder/email/tokens';
import { esc } from '@/lib/builder/email/render';
import { BRAND_NAME } from '@/lib/brand';
import { clientIp, rateLimited } from '@/lib/builder/server/access';

export const dynamic = 'force-dynamic';

/**
 * The page behind the links in scheduled dashboard emails (round 9): "Yes, send me the report", "No" and
 * "Unsubscribe". A GET only SHOWS what the link would do (mail scanners and link previews open links, so a
 * GET never changes anything); the button, or a mail app's one-click List-Unsubscribe POST, does it.
 * The token is signed (lib/builder/email/tokens.ts); unsubscribe and "no" links never expire.
 */

const HEADERS = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
};

function page(title: string, body: string, status = 200): Response {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#f6f7f9;color:#171a20;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}main{max-width:460px;margin:12vh auto;padding:0 16px}.card{background:#fff;border:1px solid #e7eaee;border-radius:14px;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:8px 0;color:#4b5361}button{margin-top:14px;font:600 15px/1 inherit;background:#0d3a2c;color:#fff;border:0;border-radius:9px;padding:12px 20px;cursor:pointer}.brand{font:600 12px/1 inherit;letter-spacing:.04em;text-transform:uppercase;color:#0d3a2c;margin-bottom:10px}</style></head>
<body><main><div class="card"><div class="brand">${esc(BRAND_NAME)}</div>${body}</div></main></body></html>`;
    return new Response(html, { status, headers: HEADERS });
}

const COPY = {
    confirm: { h: 'Send this report to you?', p: (n: string, e: string) => `${esc(e)} would get the email report of <strong>${esc(n)}</strong>.`, b: 'Yes, send me the report' },
    decline: { h: 'Do not send this report?', p: (n: string, e: string) => `${esc(e)} will not get the email report of <strong>${esc(n)}</strong>, and we will not ask again.`, b: 'Confirm: do not send' },
    unsub: { h: 'Unsubscribe from this report?', p: (n: string, e: string) => `${esc(e)} will stop getting the email report of <strong>${esc(n)}</strong>.`, b: 'Unsubscribe' },
} as const;

const DONE = {
    confirm: (n: string) => ['You are confirmed', `You will get the email report of <strong>${esc(n)}</strong> on its schedule. Every email has an unsubscribe link.`],
    decline: (n: string) => ['Got it', `You will not get the email report of <strong>${esc(n)}</strong>. We will not ask again.`],
    unsub: (n: string) => ['You are unsubscribed', `You will not get any more emails of the report <strong>${esc(n)}</strong>.`],
} as const;

export async function GET(req: Request) {
    if (rateLimited(`email-respond:${clientIp(req)}`, 60)) return page('Too many requests', '<h1>Too many requests</h1><p>Please wait a minute and try again.</p>', 429);
    const token = new URL(req.url).searchParams.get('t');
    const p = verifyToken(token);
    if (!p || p.k === 'img') return page('Link not valid', '<h1>This link is not valid</h1><p>It may have expired or been changed. Confirmation links last 14 days; unsubscribe links never expire.</p>', 400);
    let name = 'this dashboard';
    try {
        const row = (await new AdminScheduleStore().listScheduled()).find((r) => r.dashboardId === p.d);
        if (!row) return page('Not found', '<h1>This report no longer exists</h1><p>Nothing more will be sent.</p>');
        name = row.name;
    } catch {
        return page('Try again', '<h1>Something went wrong</h1><p>Please try the link again in a minute.</p>', 502);
    }
    const c = COPY[p.k];
    return page(c.h, `<h1>${c.h}</h1><p>${c.p(name, p.e)}</p><form method="post" action="/api/email-schedule/respond?t=${encodeURIComponent(String(token))}"><button type="submit">${c.b}</button></form>`);
}

export async function POST(req: Request) {
    if (rateLimited(`email-respond:${clientIp(req)}`, 60)) return page('Too many requests', '<h1>Too many requests</h1><p>Please wait a minute and try again.</p>', 429);
    const token = new URL(req.url).searchParams.get('t');
    const p = verifyToken(token);
    if (!p || p.k === 'img') return page('Link not valid', '<h1>This link is not valid</h1><p>It may have expired or been changed.</p>', 400);
    try {
        const store = new AdminScheduleStore();
        const r = await applyLink(store, token, Date.now());
        if (!r.ok) return page('Not found', '<h1>This report no longer exists</h1><p>Nothing more will be sent.</p>');
        const row = (await store.listScheduled()).find((x) => x.dashboardId === r.dashboardId);
        const [h, text] = DONE[r.action](row?.name ?? 'this dashboard');
        return page(h, `<h1>${h}</h1><p>${text}</p>`);
    } catch (err) {
        console.error('[email-schedule] respond failed', err);
        return page('Try again', '<h1>Something went wrong</h1><p>Please try again in a minute.</p>', 502);
    }
}
