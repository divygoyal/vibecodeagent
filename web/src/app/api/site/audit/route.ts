import { NextResponse } from 'next/server';

import { cachedFetch, invalidateCache } from '@/lib/apiCache';
import { getDemoAuditReport } from '@/lib/demoWorkspaceData';
import { demoDataAllowed } from '@/lib/demo/gate';
import { runSiteAudit, type AuditReport } from '@/lib/siteAudit';
import { isBlockedUrl } from '@/lib/urlValidation';
import { getSessionUserId, jsonError, NO_STORE } from '../_lib/context';

export const dynamic = 'force-dynamic';

const TTL_MS = 6 * 60 * 60_000;

function normalize(raw: string | null | undefined): string | null {
    let u = (raw ?? '').trim();
    if (!u || u.length > 2000) return null;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
        const parsed = new URL(u);
        if (!parsed.hostname.includes('.')) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

/** Demo data mode: the catalogue's *.example sites have no real pages to fetch. */
function demoReport(url: string): AuditReport | null {
    if (!demoDataAllowed()) return null;
    const host = new URL(url).hostname;
    if (!host.endsWith('.example')) return null;
    const base = getDemoAuditReport(url);
    const label = host.replace(/^www\./, '');
    return {
        ...base,
        fetchedAt: new Date().toISOString(),
        // The shared demo report carries another site's title; use this site's host instead.
        meta: { ...base.meta, title: `${label} – home`, description: `Demo audit of ${label} (dev kit data).`, canonical: url },
    };
}

async function audit(userId: string, url: string): Promise<{ report: AuditReport } | { error: string }> {
    return cachedFetch(`site-audit:${userId}:${url}`, TTL_MS, async () => {
        const demo = demoReport(url);
        if (demo) return { report: demo };
        if (isBlockedUrl(url)) return { error: 'Only public websites can be audited.' };
        try {
            return { report: await runSiteAudit(url) };
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            return { error: msg && msg.length < 160 ? `The audit couldn't load the page: ${msg}` : "The audit couldn't load the page. Check the site is up and public." };
        }
    });
}

/**
 * GET  /api/site/audit?url=https://acme.com/   cached audit of a page (runs it the first time; 6 h cache)
 * POST /api/site/audit { url }                  run a fresh audit
 *
 * Fetches the user's own public page (not Google). The report feeds the Audit
 * page and the "Audit issue" tasks on Actions.
 */
export async function GET(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) return jsonError('Unauthorized', 401);
    const url = normalize(new URL(req.url).searchParams.get('url'));
    if (!url) return jsonError('Enter a full URL, like https://example.com.', 400);
    const out = await audit(userId, url);
    if ('error' in out) return jsonError(out.error, 422);
    return NextResponse.json(out.report, { headers: NO_STORE });
}

export async function POST(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) return jsonError('Unauthorized', 401);
    const body = await req.json().catch(() => null) as { url?: string } | null;
    const url = normalize(body?.url);
    if (!url) return jsonError('Enter a full URL, like https://example.com.', 400);
    invalidateCache(`site-audit:${userId}:${url}`);
    const out = await audit(userId, url);
    if ('error' in out) return jsonError(out.error, 422);
    return NextResponse.json(out.report, { headers: NO_STORE });
}
