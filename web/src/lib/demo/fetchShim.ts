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
 *
 * Production has a second, narrow mode for the public live demo (lib/publicDemo): installDemoGoogleFetch('publicDemo').
 * It answers ONLY Google requests that belong to the demo (a demo-access:/demo-refresh: token, a *.example
 * PageSpeed/CrUX target, or any Google call made while serving a demo request) and passes every other request
 * through untouched, with the same arguments. Model hosts (Gemini, Vertex) are never answered by the demo and are
 * refused inside demo requests. No faults, no latency, no demo OAuth code exchange in that mode.
 */

import { accountCanReadProperty, accountCanReadSite, accountKeyFromToken, demoAccessToken, demoAccountSub, demoRefreshToken, findSiteByPropertyId, findSiteBySiteUrl, getDemoAccount, getDemoAccounts, type DemoGoogleAccount } from './catalog';
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
                if (form.get('grant_type') === 'authorization_code') return demoCodeExchange(form);
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

/**
 * The demo OAuth code exchange (the "Connect another Google account" flow in demo mode): a code
 * 'demo-code:<account>' becomes that demo account's tokens plus an id_token naming it. The
 * id_token is unsigned (alg none), which only a demo server accepts (lib/googleLink.ts).
 */
function demoCodeExchange(form: URLSearchParams): Response {
    const m = /^demo-code:([a-z0-9_-]+)$/i.exec(form.get('code') || '');
    const account = m ? getDemoAccounts().find((a) => a.key === m[1]) : undefined;
    if (!account || !form.get('code_verifier')) return json({ error: 'invalid_grant', error_description: 'Bad demo authorization code.' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const idToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        iss: 'https://accounts.google.com', aud: form.get('client_id') || '', sub: demoAccountSub(account.key),
        email: account.email, email_verified: true, name: account.name, iat: now, exp: now + 3600,
    })}.`;
    return json({
        access_token: demoAccessToken(account.key), refresh_token: demoRefreshToken(account.key), expires_in: 3599, token_type: 'Bearer', id_token: idToken,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly',
    });
}

// ─── Narrow production mode for the public live demo ───

/** Model APIs: never answered from demo data, and refused while serving a demo request (no AI spend). */
const MODEL_HOSTS = /^(generativelanguage|aiplatform|[a-z0-9-]+-aiplatform)\.googleapis\.com$|^api\.openai\.com$|^api\.anthropic\.com$/i;
/** Request header middleware sets on requests it serves as the demo user (and strips from every other request). */
export const DEMO_REQUEST_HEADER = 'x-tc-demo-request';
/** The public demo user's id (lib/publicDemo/config.ts DEMO_USER_ID; kept here so this module has no app imports). */
const PUBLIC_DEMO_USER_ID = 'tc-public-demo';

export interface PublicDemoDeps {
    /** True while the server is answering a demo request (middleware's x-tc-demo-request header). */
    isDemoRequest: () => Promise<boolean>;
    /** ADMIN_API_URL, for the demo user's plugin list commands. */
    adminBase?: string;
}

async function headerSaysDemo(): Promise<boolean> {
    try {
        const { headers } = await import('next/headers');
        return (await headers()).get(DEMO_REQUEST_HEADER) === '1';
    } catch {
        return false; // outside a request (schedulers, cron, instrumentation)
    }
}

function requestUrl(input: RequestInfo | URL): string | null {
    try {
        return typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    } catch {
        return null;
    }
}

/** The token a Google request presents, without consuming the caller's body. */
async function presentedToken(input: RequestInfo | URL, init: RequestInit | undefined, url: URL): Promise<string | null> {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const headers = new Headers(init?.headers ?? (isRequest ? (input as Request).headers : undefined));
    const fromHeader = bearer(headers) || url.searchParams.get('access_token') || url.searchParams.get('token');
    if (fromHeader) return fromHeader;
    if (url.hostname !== 'oauth2.googleapis.com') return null;
    // Token refresh / revoke: the token is in the form body. Only string-like bodies are read (a stream is left alone).
    const raw = init?.body;
    let body = '';
    if (typeof raw === 'string') body = raw;
    else if (raw instanceof URLSearchParams) body = raw.toString();
    else if (raw == null && isRequest && !(input as Request).bodyUsed) body = await (input as Request).clone().text().catch(() => '');
    else return null;
    const form = new URLSearchParams(body);
    return form.get('refresh_token') || form.get('token');
}

/** PageSpeed / CrUX request for a *.example page (reserved TLD: only the demo catalogue uses it). */
function exampleTarget(url: URL, init: RequestInit | undefined): boolean {
    const isExample = (u: string | null | undefined) => {
        if (!u) return false;
        try {
            return /\.example$/i.test(new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname);
        } catch {
            return false;
        }
    };
    if (url.hostname === 'chromeuxreport.googleapis.com') {
        const body = typeof init?.body === 'string' ? parseJson(init.body) : {};
        return isExample(body?.origin) || isExample(body?.url);
    }
    if (url.hostname === 'pagespeedonline.googleapis.com' || url.pathname.startsWith('/pagespeedonline/')) {
        return isExample(url.searchParams.get('url'));
    }
    return false;
}

/**
 * Public-demo routing: a demo Response for requests that belong to the demo, or null to pass the
 * request through unchanged. Exported for tests.
 */
export async function publicDemoGoogleFetch(input: RequestInfo | URL, init: RequestInit | undefined, network: FetchFn, deps: PublicDemoDeps): Promise<Response | null> {
    const urlString = requestUrl(input);
    if (!urlString || !/^https?:\/\//i.test(urlString)) return null;
    let url: URL;
    try {
        url = new URL(urlString);
    } catch {
        return null;
    }
    const host = url.hostname;

    // The demo user's admin plugin commands: answered here, never run in a container.
    if (deps.adminBase && urlString.startsWith(deps.adminBase) && url.pathname === `/api/users/${PUBLIC_DEMO_USER_ID}/exec`) {
        const req = await readRequest(input, init);
        const listed = await handleAdminExec(req.url, req.headers, parseJson(req.body), network, [], req.signal);
        return listed ?? json({ status: 'ok', data: { error: 'Not available in the demo' }, stderr: '' });
    }

    if (MODEL_HOSTS.test(host)) {
        if (await deps.isDemoRequest()) {
            console.warn(`[public-demo] refused a model call during a demo request: ${host}${url.pathname}`);
            return json({ error: { code: 403, message: 'AI is not available in the demo.', status: 'PERMISSION_DENIED' } }, 403);
        }
        return null;
    }
    if (!GOOGLE_HOST.test(host)) return null;

    const token = await presentedToken(input, init, url);
    const demo = /^demo-(access|refresh):/i.test(token ?? '')
        || exampleTarget(url, init)
        || (await deps.isDemoRequest());
    if (!demo) return null;

    const req = await readRequest(input, init);
    try {
        if (host === 'oauth2.googleapis.com') {
            if (url.pathname === '/revoke') return json({});
            const form = new URLSearchParams(req.body);
            // No demo code exchange in production: only refreshes of demo tokens.
            if (url.pathname === '/token' && form.get('grant_type') !== 'refresh_token') {
                return json({ error: 'invalid_grant', error_description: 'The demo only refreshes demo tokens.' }, 400);
            }
        }
        return await answer(req, host, url.pathname);
    } catch (err) {
        if (req.signal?.aborted) throw err;
        return errorResponse(err);
    }
}

const INSTALLED = Symbol.for('trafficclaw.demoFetchInstalled');

/**
 * Wraps globalThis.fetch once per process. Returns true when it installed the shim.
 *
 * mode 'full' (TC_DEMO_DATA=1, dev and the test machine): every Google data request is answered by the
 * demo generator and real tokens are refused. mode 'publicDemo' (production, the public live demo): only
 * requests that belong to the demo are answered (see publicDemoGoogleFetch); everything else goes to the
 * network exactly as the caller made it.
 *
 * globalThis.fetch becomes an accessor: whatever gets assigned to it later
 * (Next.js patches fetch, and in dev resets it to the original on every
 * recompile) is stored as the inner fetch, and reads always return the demo
 * wrapper around it. A plain assignment would be lost on the first reset.
 */
export function installDemoGoogleFetch(mode: 'full' | 'publicDemo' = 'full'): boolean {
    const g = globalThis as any;
    if (g[INSTALLED]) return false;
    const network: FetchFn = globalThis.fetch.bind(globalThis);
    let inner: any = globalThis.fetch;
    const deps: PublicDemoDeps = { isDemoRequest: headerSaysDemo, adminBase: process.env.ADMIN_API_URL };
    const wrappers = new WeakMap<object, FetchFn>();
    const wrap = (fn: any): FetchFn => {
        let w = wrappers.get(fn);
        if (!w) {
            const wrapper: any = mode === 'full'
                ? async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
                    const demo = await demoGoogleFetch(input, init, network);
                    return demo ?? fn(input, init);
                }
                : async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
                    const demo = await publicDemoGoogleFetch(input, init, network, deps);
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
    console.log(mode === 'full'
        ? '[demo-data] TC_DEMO_DATA=1 – Google API calls are answered by web/src/lib/demo (no network).'
        : '[public-demo] live demo on: Google calls of the demo user are answered by web/src/lib/demo; all other requests are untouched.');
    return true;
}
