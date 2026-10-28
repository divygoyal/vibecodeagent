import { NextResponse } from 'next/server';

import { cachedFetch, invalidateCache } from '@/lib/apiCache';
import { getDemoAuditReport } from '@/lib/demoWorkspaceData';
import { demoDataAllowed } from '@/lib/demo/gate';
import { getDemoSites } from '@/lib/demo/catalog';
import { DEMO_HEADER, DEMO_READONLY_MESSAGE, DEMO_USER_ID, publicDemoEnabled } from '@/lib/publicDemo/config';
import { normalizeHost } from '@/lib/sites/pairing';
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

const isExampleHost = (url: string) => new URL(url).hostname.endsWith('.example');

/** Hosts of the demo catalogue (lib/demo/catalog.ts), without www. */
const CATALOGUE_HOSTS = new Set(getDemoSites().map((site) => normalizeHost(site.host)));

/**
 * The public demo user audits catalogue sites only, always at the site root (the sample report is the same for
 * every page): the server never fetches anything for an anonymous visitor, and there is one cache entry per
 * sample site, not one per URL variant. null = refused.
 */
function demoUserUrl(url: string): string | null {
    const u = new URL(url);
    if (!CATALOGUE_HOSTS.has(normalizeHost(u.hostname))) return null;
    return `${u.origin}/`;
}

/**
 * The sample report for *.example pages (no real page to fetch): for the public demo user, and for everyone on a
 * dev / test server with demo data (TC_DEMO_DATA). Real users in production never get it.
 */
function demoReport(userId: string, url: string): AuditReport | null {
    if (!isExampleHost(url)) return null;
    if (!(userId === DEMO_USER_ID && publicDemoEnabled()) && !demoDataAllowed()) return null;
    const host = new URL(url).hostname;
    const base = getDemoAuditReport(url);
    const label = host.replace(/^www\./, '');
    return {
        ...base,
        fetchedAt: new Date().toISOString(),
        // The shared demo report carries another site's title; use this site's host instead.
        meta: { ...base.meta, title: `${label} – home`, description: `Demo audit of ${label} (sample data).`, canonical: url },
    };
}

function demoRefusal(): NextResponse {
    return NextResponse.json({ error: DEMO_READONLY_MESSAGE, demo: true }, { status: 403, headers: { ...NO_STORE, [DEMO_HEADER]: 'readonly' } });
}

/** The URL to audit for this user, or a refusal for the demo user outside the catalogue. */
function auditTarget(userId: string, url: string): { url: string } | { refused: NextResponse } {
    if (userId !== DEMO_USER_ID) return { url };
    const safe = demoUserUrl(url);
    return safe ? { url: safe } : { refused: demoRefusal() };
}

async function audit(userId: string, url: string): Promise<{ report: AuditReport } | { error: string }> {
    return cachedFetch(`site-audit:${userId}:${url}`, TTL_MS, async () => {
        const demo = demoReport(userId, url);
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
    const target = auditTarget(userId, url);
    if ('refused' in target) return target.refused;
    const out = await audit(userId, target.url);
    if ('error' in out) return jsonError(out.error, 422);
    return NextResponse.json(out.report, { headers: NO_STORE });
}

export async function POST(req: Request) {
    const userId = await getSessionUserId();
    if (!userId) return jsonError('Unauthorized', 401);
    const body = await req.json().catch(() => null) as { url?: string } | null;
    const url = normalize(body?.url);
    if (!url) return jsonError('Enter a full URL, like https://example.com.', 400);
    const target = auditTarget(userId, url);
    if ('refused' in target) return target.refused;
    invalidateCache(`site-audit:${userId}:${target.url}`);
    const out = await audit(userId, target.url);
    if ('error' in out) return jsonError(out.error, 422);
    return NextResponse.json(out.report, { headers: NO_STORE });
}
