/**
 * Demo-mode fetch shim. When TC_DEMO_DATA=1 (dev only), instrumentation.ts
 * wraps globalThis.fetch so every server-side request to a Google data API
 * is answered by the demo generator instead of the network:
 *
 *   oauth2.googleapis.com/token             → a demo access token
 *   analyticsadmin.googleapis.com           → accountSummaries, properties, dataStreams
 *   analyticsdata.googleapis.com            → runReport, batchRunReports, runRealtimeReport, metadata
 *   www.googleapis.com/webmasters/v3        → sites, searchAnalytics.query, sitemaps
 *   searchconsole.googleapis.com            → the same, plus urlInspection
 *   pagespeedonline / chromeuxreport        → PageSpeed Insights and CrUX
 *   ${ADMIN_API_URL}/api/users/:id/exec     → GA4 / GSC list commands of the admin plugins
 *
 * Patching fetch (rather than each caller) means lib/googleApi.ts and the ~20
 * routes that call Google directly all work unchanged. Requests carrying a
 * non-demo bearer token are refused, so a real token can never leave the box
 * from a demo server.
 *
 * Faults (403, 429, 500, 502, timeout, latency, flaky, empty, revoked, huge) can be injected with
 * TC_DEMO_FAULTS, the tc_demo_faults cookie or a `~spec` suffix on a demo
 * token; see faults.ts.
 */

import { accountCanReadProperty, accountCanReadSite, accountKeyFromToken, demoAccessToken, findSiteByPropertyId, findSiteBySiteUrl, getDemoAccount, type DemoGoogleAccount } from './catalog';
import { demoAccountSummaries, demoDataStreams, demoProperty, demoPropertyList } from './gaAdmin';
import { DemoApiError, demoMetadata, demoRunRealtimeReport, demoRunReport } from './ga4';
import { demoGetSite, demoListSites, demoSearchAnalytics, demoSitemaps, demoUrlInspection } from './gsc';
import { demoCruxRecord, demoPagespeed } from './pagespeed';
import { DEMO_FAULT_COOKIE, demoFaultAfter, demoFaultBefore, parseDemoFaults, splitFaultToken, type DemoCallScope, type DemoFault } from './faults';

/* eslint-disable @typescript-eslint/no-explicit-any */

type FetchFn = typeof globalThis.fetch;

const GOOGLE_HOST = /(^|\.)googleapis\.com$/i;
const PASS_THROUGH_HOSTS = /^(generativelanguage|aiplatform|[a-z0-9-]+-aiplatform)\.googleapis\.com$/i;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'x-tc-demo-data': '1' },
    });
}

function errorResponse(err: unknown): Response {
    if (err instanceof DemoApiError) return json(err.toJSON(), err.status);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: { code: 500, message: `demo data generator failed: ${message}`, status: 'INTERNAL' } }, 500);
}

async function readRequest(input: RequestInfo | URL, init?: RequestInit): Promise<{ url: URL; method: string; headers: Headers; body: string; signal: AbortSignal | null }> {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const url = new URL(isRequest ? (input as Request).url : String(input));
    const method = (init?.method || (isRequest ? (input as Request).method : 'GET')).toUpperCase();
    const headers = new Headers(init?.headers ?? (isRequest ? (input as Request).headers : undefined));
    let body = '';
    const raw = init?.body;
    if (typeof raw === 'string') body = raw;
    else if (raw instanceof URLSearchParams) body = raw.toString();
    else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) body = new TextDecoder().decode(raw as ArrayBuffer);
    else if (raw != null) body = String(raw);
    else if (isRequest && method !== 'GET' && method !== 'HEAD') body = await (input as Request).clone().text();
    const signal = init?.signal ?? (isRequest ? (input as Request).signal : null) ?? null;
    return { url, method, headers, body, signal };
}

function parseJson(body: string): any {
    if (!body) return {};
    try { return JSON.parse(body); } catch { return {}; }
}

function bearer(headers: Headers): string | null {
    const auth = headers.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return m ? m[1].trim() : null;
}

function requireAccount(headers: Headers, url: URL): DemoGoogleAccount {
    const token = bearer(headers) || url.searchParams.get('access_token');
    const key = accountKeyFromToken(token);
    if (!key) {
        throw new DemoApiError(401, 'UNAUTHENTICATED', 'Demo mode only accepts demo tokens (demo-access:<account>). Real Google tokens are refused.');
    }
    return getDemoAccount(key);
}

function checkProperty(account: DemoGoogleAccount, propertyId: string): void {
    const site = findSiteByPropertyId(propertyId);
    if (!site || !accountCanReadProperty(account, site)) {
        throw new DemoApiError(403, 'PERMISSION_DENIED', `User does not have sufficient permissions for this property (${propertyId}).`);
    }
}

function checkSite(account: DemoGoogleAccount, siteUrl: string): void {
    const site = findSiteBySiteUrl(siteUrl);
    if (!site || !accountCanReadSite(account, site)) {
        throw new DemoApiError(403, 'PERMISSION_DENIED', `User does not have sufficient permission for site '${siteUrl}'.`);
    }
}

function handleGaData(path: string, method: string, body: any, account: DemoGoogleAccount): Response {
    // /v1beta/properties/123:runReport
    const m = /^\/v1(?:alpha|beta)\/(properties\/\d+)(?::([a-zA-Z]+)|\/(metadata))?$/.exec(path);
    if (!m) return json({ error: { code: 404, message: `demo: unsupported GA4 Data API path ${path}`, status: 'NOT_FOUND' } }, 404);
    const [, propertyId, action, sub] = m;
    checkProperty(account, propertyId);
    if (sub === 'metadata') return json(demoMetadata(propertyId));
    switch (action) {
        case 'runReport': return json(demoRunReport(propertyId, body));
        case 'runRealtimeReport': return json(demoRunRealtimeReport(propertyId, body));
        case 'batchRunReports': return json({ reports: (body.requests || []).map((r: any) => demoRunReport(propertyId, r)), kind: 'analyticsData#batchRunReports' });
        case 'checkCompatibility': return json({ dimensionCompatibilities: [], metricCompatibilities: [] });
        default:
            void method;
            return json({ error: { code: 501, message: `demo: GA4 Data API method ${action} is not simulated`, status: 'UNIMPLEMENTED' } }, 501);
    }
}

function handleGaAdmin(path: string, account: DemoGoogleAccount): Response {
    if (/^\/v1(alpha|beta)\/accountSummaries$/.test(path)) return json(demoAccountSummaries(account));
    let m = /^\/v1(?:alpha|beta)\/(properties\/\d+)\/dataStreams$/.exec(path);
    if (m) { checkProperty(account, m[1]); return json(demoDataStreams(m[1])); }
    m = /^\/v1(?:alpha|beta)\/(properties\/\d+)$/.exec(path);
    if (m) { checkProperty(account, m[1]); return json(demoProperty(m[1])); }
    if (/^\/v1(alpha|beta)\/accounts$/.test(path)) {
        return json({ accounts: account.gaAccounts.map(a => ({ name: a.account, displayName: a.displayName, regionCode: 'US' })) });
    }
    return json({ error: { code: 404, message: `demo: unsupported GA4 Admin API path ${path}`, status: 'NOT_FOUND' } }, 404);
}

function handleSearchConsole(path: string, body: any, account: DemoGoogleAccount): Response {
    // Both https://www.googleapis.com/webmasters/v3/... and https://searchconsole.googleapis.com/webmasters/v3/...
    const rel = path.replace(/^\/webmasters\/v3/, '');
    if (rel === '/sites') return json(demoListSites(account));
    if (path === '/v1/urlInspection/index:inspect') {
        checkSite(account, body.siteUrl || '');
        return json(demoUrlInspection(body));
    }
    const m = /^\/sites\/([^/]+)(\/searchAnalytics\/query|\/sitemaps(?:\/.*)?)?$/.exec(rel);
    if (m) {
        const siteUrl = decodeURIComponent(m[1]);
        checkSite(account, siteUrl);
        if (!m[2]) return json(demoGetSite(siteUrl));
        if (m[2] === '/searchAnalytics/query') return json(demoSearchAnalytics(siteUrl, body));
        if (m[2] === '/sitemaps') return json(demoSitemaps(siteUrl));
        const all = demoSitemaps(siteUrl).sitemap || [];
        return all.length ? json(all[0]) : json({ error: { code: 404, message: 'Sitemap not found', status: 'NOT_FOUND' } }, 404);
    }
    return json({ error: { code: 404, message: `demo: unsupported Search Console path ${path}`, status: 'NOT_FOUND' } }, 404);
}

/** Answers the admin plugin list commands that /api/analytics/properties and /api/seo/sites use. */
async function handleAdminExec(url: URL, headers: Headers, body: any, original: FetchFn, faults: DemoFault[], signal: AbortSignal | null): Promise<Response | null> {
    const plugin = body?.plugin;
    const command = body?.command;
    const isList = (plugin === 'google-analytics' && command === 'list-properties-json') || (plugin === 'google-search-console' && command === 'list-sites-json');
    if (!isList) return null;
    // Look the user's stored Google token up in the (dev) admin DB to pick the demo account.
    const userPath = url.pathname.replace(/\/exec$/, '/oauth/google');
    let token: string | null = null;
    try {
        const res = await original(new URL(userPath, url).toString(), { headers: { 'X-API-Key': headers.get('x-api-key') || '' }, cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            token = data?.access_token || data?.refresh_token || null;
        }
    } catch {
        token = null;
    }
    const key = accountKeyFromToken(token);
    if (!key) return json({ status: 'ok', data: { error: 'Google account not connected (demo mode)' }, stderr: '' });
    const all = [...faults, ...parseDemoFaults(splitFaultToken(token).spec)];
    const failed = await demoFaultBefore(all, 'list', signal);
    if (failed) {
        // The admin plugin reports Google errors inside a 200 envelope.
        const err = await failed.json().catch(() => ({}));
        return json({ status: 'ok', data: { error: err?.error?.message || err?.error_description || `Google API error ${failed.status}` }, stderr: '' });
    }
    const account = getDemoAccount(key);
    const data = plugin === 'google-analytics' ? demoPropertyList(account) : demoListSites(account).siteEntry ?? [];
    return demoFaultAfter(all, 'list', json({ status: 'ok', data, stderr: '' }));
}

/** Which kind of Google call this is, for fault scopes. */
function callScope(host: string, path: string): DemoCallScope {
    if (host === 'oauth2.googleapis.com') return 'token';
    if (host === 'analyticsadmin.googleapis.com') return /\/(accountSummaries|accounts)$/.test(path) ? 'list' : 'ga4';
    if (host === 'analyticsdata.googleapis.com') return 'ga4';
    if (host === 'pagespeedonline.googleapis.com' || host === 'chromeuxreport.googleapis.com' || path.startsWith('/pagespeedonline/')) return 'psi';
    if (/^\/webmasters\/v3\/sites$/.test(path)) return 'list';
    return 'gsc';
}

/** Faults from TC_DEMO_FAULTS and, inside a request, the tc_demo_faults cookie. */
async function ambientFaults(): Promise<DemoFault[]> {
    const specs = [process.env.TC_DEMO_FAULTS || ''];
    try {
        const { cookies } = await import('next/headers');
        const v = (await cookies()).get(DEMO_FAULT_COOKIE)?.value;
        if (v) specs.push(decodeURIComponent(v));
    } catch {
        // Outside a request (cron, background sync, instrumentation): env only.
    }
    return parseDemoFaults(specs.filter(Boolean).join(','));
}

/**
 * Returns a demo Response for Google data requests, or null to let the
 * request through unchanged.
 */
export async function demoGoogleFetch(input: RequestInfo | URL, init: RequestInit | undefined, original: FetchFn): Promise<Response | null> {
    let urlString: string;
    try {
        urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    } catch {
        return null;
    }
    if (!/^https?:\/\//i.test(urlString)) return null;
    const host = new URL(urlString).hostname;
    const adminBase = process.env.ADMIN_API_URL;
    const isAdminExec = !!adminBase && urlString.startsWith(adminBase) && /\/api\/users\/[^/]+\/exec$/.test(new URL(urlString).pathname);
    if (!isAdminExec && (!GOOGLE_HOST.test(host) || PASS_THROUGH_HOSTS.test(host))) return null;

    const req = await readRequest(input, init);
    const latency = Number(process.env.TC_DEMO_LATENCY_MS || 0);
    if (latency > 0) await new Promise(r => setTimeout(r, latency));
    const faults = await ambientFaults();
    try {
        if (isAdminExec) return await handleAdminExec(req.url, req.headers, parseJson(req.body), original, faults, req.signal);
        const path = req.url.pathname;
        const call = callScope(host, path);
        const presented = call === 'token'
            ? new URLSearchParams(req.body).get('refresh_token')
            : bearer(req.headers) || req.url.searchParams.get('access_token');
        const tokenSpec = splitFaultToken(presented).spec;
        if (tokenSpec) faults.push(...parseDemoFaults(tokenSpec));
        if (faults.length) {
            const failed = await demoFaultBefore(faults, call, req.signal, `${req.method} ${host}${path}${req.url.search}|${req.body.slice(0, 600)}`);
            if (failed) return failed;
            return demoFaultAfter(faults, call, await answer(req, host, path));
        }
        return await answer(req, host, path);
    } catch (err) {
        if (req.signal?.aborted) throw err; // the caller gave up (AbortSignal): behave like fetch
        if (!(err instanceof DemoApiError)) console.error('[demo-data] generator error', err);
        return errorResponse(err);
    }
}

async function answer(req: Awaited<ReturnType<typeof readRequest>>, host: string, path: string): Promise<Response> {
    try {
        switch (host) {
            case 'oauth2.googleapis.com': {
                if (path !== '/token') break;
                const form = new URLSearchParams(req.body);
                const { spec } = splitFaultToken(form.get('refresh_token'));
                const key = accountKeyFromToken(form.get('refresh_token'));
                if (!key) return json({ error: 'invalid_grant', error_description: 'Demo mode only refreshes demo tokens.' }, 400);
                // Keep the scenario's fault suffix on the fresh access token.
                return json({ access_token: `${demoAccessToken(key)}${spec ? `~${spec}` : ''}`, expires_in: 3599, scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly openid', token_type: 'Bearer' });
            }
            case 'analyticsdata.googleapis.com':
                return handleGaData(path, req.method, parseJson(req.body), requireAccount(req.headers, req.url));
            case 'analyticsadmin.googleapis.com':
                return handleGaAdmin(path, requireAccount(req.headers, req.url));
            case 'www.googleapis.com':
            case 'searchconsole.googleapis.com':
                if (path.startsWith('/pagespeedonline/')) {
                    return json(demoPagespeed(req.url.searchParams.get('url') || '', req.url.searchParams.get('strategy') || 'mobile', req.url.searchParams.getAll('category').length ? req.url.searchParams.getAll('category') : ['performance']));
                }
                if (path.startsWith('/webmasters/v3') || path.startsWith('/v1/urlInspection')) {
                    return handleSearchConsole(path, parseJson(req.body), requireAccount(req.headers, req.url));
                }
                break;
            case 'pagespeedonline.googleapis.com':
                return json(demoPagespeed(req.url.searchParams.get('url') || '', req.url.searchParams.get('strategy') || 'mobile', req.url.searchParams.getAll('category').length ? req.url.searchParams.getAll('category') : ['performance']));
            case 'chromeuxreport.googleapis.com':
                if (path.endsWith(':queryRecord')) return json(demoCruxRecord(parseJson(req.body)));
                if (path.endsWith(':queryHistoryRecord')) return json({ record: { key: parseJson(req.body), metrics: {} } });
                break;
        }
        console.warn(`[demo-data] unhandled Google request ${req.method} ${host}${path} – returning 501`);
        return json({ error: { code: 501, message: `demo: ${host}${path} is not simulated`, status: 'UNIMPLEMENTED' } }, 501);
    } catch (err) {
        if (!(err instanceof DemoApiError)) console.error('[demo-data] generator error', err);
        return errorResponse(err);
    }
}

const INSTALLED = Symbol.for('trafficclaw.demoFetchInstalled');

/**
 * Wraps globalThis.fetch once per process. Returns true when it installed the shim.
 *
 * globalThis.fetch becomes an accessor: whatever gets assigned to it later
 * (Next.js patches fetch, and in dev resets it to the original on every
 * recompile) is stored as the inner fetch, and reads always return the demo
 * wrapper around it. A plain assignment would be lost on the first reset.
 */
export function installDemoGoogleFetch(): boolean {
    const g = globalThis as any;
    if (g[INSTALLED]) return false;
    const network: FetchFn = globalThis.fetch.bind(globalThis);
    let inner: any = globalThis.fetch;
    const wrappers = new WeakMap<object, FetchFn>();
    const wrap = (fn: any): FetchFn => {
        let w = wrappers.get(fn);
        if (!w) {
            const wrapper: any = async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
                const demo = await demoGoogleFetch(input, init, network);
                return demo ?? fn(input, init);
            };
            // Keep markers other code (e.g. Next.js) attaches to fetch.
            for (const key of Object.keys(fn)) wrapper[key] = fn[key];
            w = wrapper as FetchFn;
            wrappers.set(fn, w);
        }
        return w;
    };
    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        enumerable: true,
        get: () => wrap(inner),
        set: (value: unknown) => { inner = value; },
    });
    g[INSTALLED] = true;
    console.log('[demo-data] TC_DEMO_DATA=1 – Google API calls are answered by web/src/lib/demo (no network).');
    return true;
}
