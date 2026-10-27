/**
 * Google access for MCP tools (MCP.md 8.3-8.4): GA4 Data API and Search
 * Console with a per-process cache, in-flight coalescing, per-property GA4
 * concurrency, GA4 quota tracking, circuit breakers and GSC rate buckets.
 *
 * Credentials stay server-side. Real grants use the user's stored Google
 * refresh token (lib/googleApi.ts); demo grants use the demo generator via
 * a scoped fetch that never reaches the network.
 */
import { createHash } from 'node:crypto';
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { accessForAsset, listLinkedGoogleConnections, type GoogleAssetRef } from '@/lib/googleAccounts';
import { createDemoGoogleFetch, demoGoogleAccessToken, type FetchLike } from '@/lib/sites/fetchInventory';
import type { McpPrincipal } from './auth';
import { ToolError } from './errors';
import { shared } from './shared';

const GA_DATA = 'https://analyticsdata.googleapis.com/v1beta';
const GSC = 'https://www.googleapis.com/webmasters/v3';
const GSC_V1 = 'https://searchconsole.googleapis.com/v1';
const CALL_TIMEOUT_MS = 15_000;

// ───────────── cache (LRU-ish, 500 entries / ~50 MB) ─────────────

interface CacheEntry { value: unknown; until: number; size: number }
const cache = shared('googleCache', () => new Map<string, CacheEntry>());
const bytes = shared('googleCacheBytes', () => ({ n: 0 }));
const CACHE_MAX_ENTRIES = 500;
const CACHE_MAX_BYTES = 50 * 1024 * 1024;
const inflight = shared('googleInflight', () => new Map<string, Promise<unknown>>());

function cacheGet(key: string): unknown | undefined {
    const e = cache.get(key);
    if (!e) return undefined;
    if (e.until <= Date.now()) {
        cache.delete(key);
        bytes.n -= e.size;
        return undefined;
    }
    cache.delete(key);
    cache.set(key, e); // refresh recency
    return e.value;
}

function cacheSet(key: string, value: unknown, ttlMs: number, size: number) {
    const old = cache.get(key);
    if (old) bytes.n -= old.size;
    cache.set(key, { value, until: Date.now() + ttlMs, size });
    bytes.n += size;
    while ((cache.size > CACHE_MAX_ENTRIES || bytes.n > CACHE_MAX_BYTES) && cache.size) {
        const [k, e] = cache.entries().next().value as [string, CacheEntry];
        cache.delete(k);
        bytes.n -= e.size;
    }
}

// ───────────── guards ─────────────

class Semaphore {
    private active = 0;
    private queue: (() => void)[] = [];
    constructor(private max: number) {}
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
        this.active++;
        try {
            return await fn();
        } finally {
            this.active--;
            this.queue.shift()?.();
        }
    }
}

const ga4Semaphores = shared('ga4Semaphores', () => new Map<string, Semaphore>());
function ga4Semaphore(property: string): Semaphore {
    let s = ga4Semaphores.get(property);
    if (!s) {
        s = new Semaphore(4);
        ga4Semaphores.set(property, s);
        if (ga4Semaphores.size > 5000) ga4Semaphores.clear();
    }
    return s;
}

const gscUserSemaphores = shared('gscSemaphores', () => new Map<string, Semaphore>());
function gscSemaphore(userKey: string): Semaphore {
    let s = gscUserSemaphores.get(userKey);
    if (!s) {
        s = new Semaphore(6);
        gscUserSemaphores.set(userKey, s);
        if (gscUserSemaphores.size > 5000) gscUserSemaphores.clear();
    }
    return s;
}

/** Circuit breakers: key -> open-until, plus recent 5xx timestamps. */
const circuits = shared('circuits', () => new Map<string, number>());
const serverErrors = shared('serverErrors', () => new Map<string, number[]>());
function circuitOpen(key: string): number {
    const until = circuits.get(key) ?? 0;
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}
function record5xx(key: string) {
    const now = Date.now();
    const list = (serverErrors.get(key) ?? []).filter((t) => t > now - 600_000);
    list.push(now);
    serverErrors.set(key, list);
    if (list.length >= 3) circuits.set(key, now + 600_000);
}

/** GA4 quota memory per property from returnPropertyQuota. */
const ga4Quota = shared('ga4Quota', () => new Map<string, { hourly: number; daily: number; projectHourly: number; at: number }>());
function quotaBlock(property: string, realtime: boolean): string | null {
    const q = ga4Quota.get(property);
    if (!q || q.at < Date.now() - 3600_000) return null;
    const lowest = Math.min(q.hourly, q.projectHourly);
    if (!realtime && lowest < 1000) return 'GA4 hourly quota for this property is almost used up';
    if (!realtime && (lowest < 3000 || q.daily < 20000)) return 'GA4 quota for this property is low';
    return null;
}
function rememberQuota(property: string, pq: Record<string, { remaining?: number }> | undefined) {
    if (!pq) return;
    ga4Quota.set(property, {
        hourly: pq.tokensPerHour?.remaining ?? Infinity,
        daily: pq.tokensPerDay?.remaining ?? Infinity,
        projectHourly: pq.tokensPerProjectPerHour?.remaining ?? Infinity,
        at: Date.now(),
    });
}

/** GSC token buckets: per site+user 600/min, global 20,000/min. */
const gscBuckets = shared('gscBuckets', () => new Map<string, { tokens: number; at: number }>());
function gscTake(key: string, perMinute: number): boolean {
    const now = Date.now();
    const b = gscBuckets.get(key) ?? { tokens: perMinute, at: now };
    const tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    if (tokens < 1) {
        gscBuckets.set(key, { tokens, at: now });
        return false;
    }
    gscBuckets.set(key, { tokens: tokens - 1, at: now });
    if (gscBuckets.size > 20000) gscBuckets.clear();
    return true;
}

// ───────────── client ─────────────

export interface CallStats {
    googleCalls: number;
    cacheHits: number;
    warnings: string[];
}

function bodyHash(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex').slice(0, 24);
}

function googleMessage(text: string): string {
    try {
        const parsed = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
        const msg = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error_description || parsed.error;
        if (msg) return String(msg).replace(/\s+/g, ' ').slice(0, 300);
    } catch {
        /* not JSON */
    }
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
}

/** The token for one asset when the user has extra Google accounts linked (lib/googleAccounts.ts). */
export type AssetTokenRouter = (asset: GoogleAssetRef) => Promise<string>;

export class GoogleClient {
    constructor(
        /** The primary connection's token (the inventory and assets it lists). */
        readonly token: string,
        private readonly fetchFn: FetchLike,
        readonly userKey: string,
        readonly demo: boolean,
        readonly stats: CallStats,
        private readonly signal?: AbortSignal,
        /** Set when linked Google accounts exist: each property or site is read with its own connection's token. */
        private readonly route?: AssetTokenRouter,
    ) {}

    private async request(url: string, body: unknown, method: 'GET' | 'POST', asset?: GoogleAssetRef): Promise<{ status: number; text: string }> {
        const token = asset && this.route ? await this.route(asset) : this.token;
        const signals = [AbortSignal.timeout(CALL_TIMEOUT_MS)];
        if (this.signal) signals.push(this.signal);
        try {
            const res = await this.fetchFn(url, {
                method,
                headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.any(signals),
            });
            this.stats.googleCalls += 1;
            return { status: res.status, text: await res.text() };
        } catch (err) {
            if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new ToolError('timeout', 'Google did not answer in time', 'Try a shorter date range or fewer dimensions.');
            throw new ToolError('upstream_error', 'Could not reach Google');
        }
    }

    private fail(api: 'GA4' | 'Search Console', status: number, text: string, circuitKey: string): never {
        const msg = googleMessage(text);
        if (status === 401) throw new ToolError('google_reauth_required', 'The Google connection expired or was revoked', 'Ask the user to open TrafficClaw > Connect AI and press "Re-connect Google".');
        if (status === 429) {
            throw new ToolError('quota_exhausted', `${api} quota is used up for now: ${msg}`, undefined, 60);
        }
        if (status === 403) throw new ToolError('upstream_error', `${api} refused access (403): ${msg}`, 'The Google account may have lost access to this property or site.');
        if (status === 400) throw new ToolError('invalid_argument', `${api} rejected the request: ${msg}`);
        if (status >= 500) record5xx(circuitKey);
        throw new ToolError('upstream_error', `${api} error ${status}: ${msg}`);
    }

    private async cached<T>(key: string, ttlMs: number, load: () => Promise<{ value: T; size: number }>): Promise<T> {
        const fullKey = `${this.demo ? 'demo' : this.userKey}|${key}`;
        const hit = cacheGet(fullKey);
        if (hit !== undefined) {
            this.stats.cacheHits += 1;
            return hit as T;
        }
        const pending = inflight.get(fullKey);
        if (pending) {
            this.stats.cacheHits += 1;
            return pending as Promise<T>;
        }
        const p = load().then(({ value, size }) => {
            cacheSet(fullKey, value, ttlMs, size);
            return value;
        }).finally(() => inflight.delete(fullKey));
        inflight.set(fullKey, p);
        return p;
    }

    private async ga4(kind: 'runReport' | 'runRealtimeReport', property: string, body: Record<string, unknown>, ttlMs: number): Promise<GaReport> {
        const realtime = kind === 'runRealtimeReport';
        const circuitKey = `ga4:${property}`;
        const open = circuitOpen(circuitKey);
        if (open) throw new ToolError('upstream_error', 'GA4 is failing for this property; paused for a few minutes', undefined, open);
        const reqBody = realtime ? body : { ...body, returnPropertyQuota: true };
        return this.cached(`ga4:${kind}:${property}:${bodyHash(reqBody)}`, ttlMs, async () => {
            const block = quotaBlock(property, realtime);
            if (block) throw new ToolError('quota_exhausted', block, 'Cached results are still served; try again later.', 600);
            return ga4Semaphore(property).run(async () => {
                for (let attempt = 0; ; attempt++) {
                    const { status, text } = await this.request(`${GA_DATA}/${property}:${kind}`, reqBody, 'POST', { kind: 'ga4', id: property });
                    if (status === 429 && attempt < 2) {
                        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    if (status !== 200) this.fail('GA4', status, text, circuitKey);
                    const json = JSON.parse(text) as GaReport;
                    rememberQuota(property, json.propertyQuota as Record<string, { remaining?: number }> | undefined);
                    return { value: json, size: text.length };
                }
            });
        });
    }

    ga4Report(property: string, body: Record<string, unknown>, opts: { includesToday?: boolean } = {}): Promise<GaReport> {
        return this.ga4('runReport', property, body, opts.includesToday ? 5 * 60_000 : 15 * 60_000);
    }

    ga4Realtime(property: string, body: Record<string, unknown>): Promise<GaReport> {
        return this.ga4('runRealtimeReport', property, body, 30_000);
    }

    ga4Metadata(property: string): Promise<GaMetadata> {
        return this.cached(`ga4:metadata:${property}`, 24 * 3600_000, async () => {
            const { status, text } = await this.request(`${GA_DATA}/${property}/metadata`, undefined, 'GET', { kind: 'ga4', id: property });
            if (status !== 200) this.fail('GA4', status, text, `ga4:${property}`);
            return { value: JSON.parse(text) as GaMetadata, size: text.length };
        });
    }

    private gscGuard(siteUrl: string) {
        const circuitKey = `gsc:${siteUrl}`;
        const open = circuitOpen(circuitKey);
        if (open) throw new ToolError('quota_exhausted', 'Search Console load quota was hit for this site; paused', undefined, open);
        if (!gscTake(`site:${this.userKey}:${siteUrl}`, 600) || !gscTake('global', 20000)) {
            throw new ToolError('rate_limited', 'Too many Search Console requests right now', undefined, 10);
        }
        return circuitKey;
    }

    gscQuery(siteUrl: string, body: Record<string, unknown>): Promise<GscResponse> {
        const ttl = body.dataState === 'all' ? 5 * 60_000 : 30 * 60_000;
        return this.cached(`gsc:query:${siteUrl}:${bodyHash(body)}`, ttl, () => gscSemaphore(this.userKey).run(async () => {
            const circuitKey = this.gscGuard(siteUrl);
            const { status, text } = await this.request(`${GSC}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, body, 'POST', { kind: 'gsc', id: siteUrl });
            if (status !== 200) {
                if (status === 429 || /load quota/i.test(text)) circuits.set(circuitKey, Date.now() + 15 * 60_000);
                this.fail('Search Console', status, text, circuitKey);
            }
            return { value: JSON.parse(text) as GscResponse, size: text.length };
        }));
    }

    gscSitemaps(siteUrl: string): Promise<{ sitemap?: GscSitemap[] }> {
        return this.cached(`gsc:sitemaps:${siteUrl}`, 30 * 60_000, () => gscSemaphore(this.userKey).run(async () => {
            const circuitKey = this.gscGuard(siteUrl);
            const { status, text } = await this.request(`${GSC}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, undefined, 'GET', { kind: 'gsc', id: siteUrl });
            if (status !== 200) this.fail('Search Console', status, text, circuitKey);
            return { value: JSON.parse(text) as { sitemap?: GscSitemap[] }, size: text.length };
        }));
    }

    gscInspect(siteUrl: string, inspectionUrl: string, languageCode: string): Promise<GscInspection> {
        return this.cached(`gsc:inspect:${siteUrl}:${inspectionUrl}:${languageCode}`, 10 * 60_000, () => gscSemaphore(this.userKey).run(async () => {
            const circuitKey = this.gscGuard(siteUrl);
            const { status, text } = await this.request(`${GSC_V1}/urlInspection/index:inspect`, { siteUrl, inspectionUrl, languageCode }, 'POST', { kind: 'gsc', id: siteUrl });
            if (status !== 200) this.fail('Search Console', status, text, circuitKey);
            return { value: JSON.parse(text) as GscInspection, size: text.length };
        }));
    }
}

// ───────────── response types and helpers ─────────────

export interface GaReport {
    dimensionHeaders?: { name: string }[];
    metricHeaders?: { name: string; type?: string }[];
    rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
    totals?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
    rowCount?: number;
    metadata?: { currencyCode?: string; timeZone?: string; subjectToThresholding?: boolean; samplingMetadatas?: unknown[]; dataLossFromOtherRow?: boolean };
    propertyQuota?: unknown;
}

export interface GaMetadata {
    dimensions?: { apiName: string; uiName?: string; description?: string; category?: string; customDefinition?: boolean }[];
    metrics?: { apiName: string; uiName?: string; description?: string; category?: string; type?: string; customDefinition?: boolean }[];
}

export interface GscRow { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }
export interface GscResponse { rows?: GscRow[]; responseAggregationType?: string }
export interface GscSitemap { path?: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string | number; warnings?: string | number; contents?: { type?: string; submitted?: string; indexed?: string }[] }
export interface GscInspection { inspectionResult?: Record<string, unknown> }

/** Parse GA4 rows into {dims, mets}; with several date ranges the last dim is the range name. */
export function gaRows(report: GaReport): { dims: string[]; mets: number[] }[] {
    return (report.rows || []).map((r) => ({
        dims: (r.dimensionValues || []).map((d) => d.value ?? ''),
        mets: (r.metricValues || []).map((m) => Number(m.value ?? 0)),
    }));
}

export function gaTotals(report: GaReport): number[][] {
    return (report.totals || []).map((t) => (t.metricValues || []).map((m) => Number(m.value ?? 0)));
}

// ───────────── credentials ─────────────

const credCache = shared('credCache', () => new Map<string, { access: string; refresh?: string; until: number }>());

export async function googleForPrincipal(p: McpPrincipal, stats: CallStats, signal?: AbortSignal): Promise<GoogleClient> {
    if (p.demo) return new GoogleClient(demoGoogleAccessToken(), createDemoGoogleFetch(), 'demo', true, stats, signal);
    const userKey = `u${p.userId}`;
    if (!p.userIdentifier) throw new ToolError('google_reauth_required', 'No Google account is connected', 'Ask the user to sign in to TrafficClaw with Google.');
    let creds = credCache.get(userKey);
    if (!creds || creds.until <= Date.now()) {
        const db = await fetchGoogleTokensFromDb(p.userIdentifier);
        if (!db || (!db.accessToken && !db.refreshToken)) {
            throw new ToolError('google_reauth_required', 'No Google account is connected', 'Ask the user to open TrafficClaw > Connect AI and press "Re-connect Google".');
        }
        creds = { access: db.accessToken, refresh: db.refreshToken, until: Date.now() + 5 * 60_000 };
        credCache.set(userKey, creds);
        if (credCache.size > 5000) credCache.clear();
    }
    let token: string;
    try {
        token = await getValidAccessToken(creds.access, creds.refresh);
    } catch {
        credCache.delete(userKey);
        throw new ToolError('google_reauth_required', 'The Google connection expired or was revoked', 'Ask the user to open TrafficClaw > Connect AI and press "Re-connect Google".');
    }
    // Extra Google accounts linked in Settings -> Google: route each property / site to its account's token.
    const identifier = p.userIdentifier;
    const primaryCreds = { accessToken: creds.access, refreshToken: creds.refresh };
    const linked = await listLinkedGoogleConnections(identifier);
    const route: AssetTokenRouter | undefined = linked.length === 0 ? undefined : async (asset) => {
        const a = await accessForAsset(identifier, asset, async () => primaryCreds);
        if (a.ok) return a.token;
        throw new ToolError('google_reauth_required', 'The Google account that can read this site needs to be reconnected', 'Ask the user to open TrafficClaw > Settings > Google and press "Reconnect" on that account.');
    };
    return new GoogleClient(token, (input, init) => fetch(input, init), userKey, false, stats, signal, route);
}
