/**
 * Server-only portfolio sync for one user:
 *
 *   1. list the Google inventory (fetchInventory, cached 10 min) and pair it
 *      (pairSites + the user's overrides), store it in portfolio_assets;
 *   2. for each visible asset that is due, fetch only the missing or stale
 *      days with ONE report per chunk (GA4 runReport by date / GSC
 *      searchAnalytics by date), 4 assets at a time, and store the rows;
 *   3. mark per-asset status (syncing -> synced | error | no_access).
 *
 * First sync backfills in two chunks per asset: the newest 200 days first
 * (so the 7d/28d/3m views fill quickly), then the rest of the history
 * (16 months for GSC, 25 for GA4). Later syncs refetch from a few days
 * before the last stored day (GA4 revises ~3 days, GSC ~5).
 *
 * One sync per user at a time per process; concurrent callers share it.
 *
 * Transient Google failures (5xx such as a 502 Bad Gateway, network errors, timeouts) are retried
 * silently: each request up to 3 more times with a short back-off, then the assets that still
 * failed get two more rounds a few seconds apart (they stay "syncing" meanwhile). Only a failure
 * that survives all of that is stored as an error, and then with a plain message, never "HTTP 502".
 */
import { fetchInventory, type FetchLike, type Inventory } from '@/lib/sites/fetchInventory';
import { normalizeHost, pairSites } from '@/lib/sites/pairing';
import { AdminStoreError, adminStore, type AssetUpsert, type StatusUpdate } from './adminStore';
import { addDays, HISTORY_DAYS, STALE_AFTER_S, SYNC_STUCK_S, syncEndDay } from './ranges';
import { ga4DailyRequest, ga4RangeUsersRequest, gscDailyRequest, parseGa4Daily, parseGa4RangeUsers, parseGscDaily } from './rows';
import { pairingOverridesFrom, type DailyRow, type StoreAsset, type StoreWindow } from './snapshot';
import type { AssetKind } from './types';

const GA_DATA = 'https://analyticsdata.googleapis.com/v1beta';
const GSC = 'https://www.googleapis.com/webmasters/v3';
/** Assets fetched at the same time (each asset is one request at a time). */
export const SYNC_CONCURRENCY = 4;
const RECENT_CHUNK_DAYS = 200;
const LOOKBACK_DAYS: Record<AssetKind, number> = { ga4: 3, gsc: 5 };
const ERROR_RETRY_S = 30 * 60;

export type SyncReason = 'page' | 'manual' | 'cron' | 'pairing';

export interface SyncCalls {
    /** GA4 Admin + GSC sites listing (0 when the inventory came from cache). */
    inventory: number;
    ga4: number;
    gsc: number;
}

export interface SyncResult {
    identifier: string;
    reason: SyncReason;
    startedAt: number;
    ms: number;
    properties: number;
    sites: number;
    due: number;
    synced: number;
    failed: number;
    noAccess: number;
    calls: SyncCalls;
    googleError: { status: number; message: string } | null;
}

export interface SyncOptions {
    identifier: string;
    /**
     * A Google access token, or a function that gets one. The function runs inside the sync, after it is
     * registered as running, so a caller (the sync route) can answer at once while a token refresh is
     * still in flight. Returning null or throwing ends the sync with "Google access expired".
     */
    accessToken: string | (() => Promise<string | null>);
    reason: SyncReason;
    /** Refetch fresh assets too (manual "Sync now"). */
    force?: boolean;
    /** Refresh the inventory instead of using the 10-minute cache. */
    refreshInventory?: boolean;
    /**
     * Creates the admin user row when it does not exist yet (first visit right
     * after sign-in, before /api/auth/register-provider has finished). Called
     * once on a 404 from the store, then the sync retries. Returns success.
     */
    ensureUser?: () => Promise<boolean>;
}

class GoogleError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Waits (ms) before each retry of one Google request, and before each extra round for assets that still failed. Mutable for tests. */
export const retryTuning = { call: [700, 2000, 5000], /** per-request retries in the extra rounds (a Google that is still down is not hammered) */ later: [1000], rounds: [5000, 15000] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A failure that is likely gone in a few seconds: Google 5xx, no answer, dropped connection. Not 4xx and not 429 (quota lasts). */
export function isTransientGoogleError(err: unknown): boolean {
    if (err instanceof GoogleError) return err.status >= 500 || err.status === 0;
    if (err instanceof Error) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
        if (err instanceof TypeError) return true; // undici "fetch failed"
    }
    return false;
}

/** What the card tooltip and the banners say for a failure that survived every retry. */
export function plainGoogleMessage(err: unknown): string {
    const status = err instanceof GoogleError ? err.status : 0;
    if (status === 401) return 'Google access expired. Reconnect Google.';
    if (status === 403) return 'No access to this property';
    if (status === 429) return 'Google quota reached; will retry later';
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return 'Google did not answer in time. Will retry shortly.';
    if (isTransientGoogleError(err)) return 'Google had a temporary problem. Will retry shortly.';
    return err instanceof Error ? err.message.slice(0, 300) : 'Sync failed';
}

const running = new Map<string, Promise<SyncResult>>();
const lastResults = new Map<string, SyncResult>();

export function isSyncRunning(identifier: string): boolean {
    return running.has(identifier);
}

/** Last finished sync of this user in this process. */
export function lastSyncResult(identifier: string): SyncResult | undefined {
    return lastResults.get(identifier);
}

/** Start (or join) the user's sync. Never rejects. */
export function startSync(opts: SyncOptions): Promise<SyncResult> {
    const existing = running.get(opts.identifier);
    if (existing) return existing;
    const p = runSync(opts)
        .catch((err): SyncResult => {
            console.error(`[portfolio-sync] user=${opts.identifier} failed:`, err instanceof Error ? err.message : err);
            return emptyResult(opts, Date.now(), { status: 500, message: 'Sync failed' });
        })
        .then((res) => {
            lastResults.set(opts.identifier, res);
            if (lastResults.size > 5000) lastResults.delete(lastResults.keys().next().value as string);
            return res;
        })
        .finally(() => running.delete(opts.identifier));
    running.set(opts.identifier, p);
    return p;
}

function emptyResult(opts: SyncOptions, startedAt: number, googleError: SyncResult['googleError'] = null): SyncResult {
    return {
        identifier: opts.identifier, reason: opts.reason, startedAt, ms: Date.now() - startedAt, properties: 0, sites: 0,
        due: 0, synced: 0, failed: 0, noAccess: 0, calls: { inventory: 0, ga4: 0, gsc: 0 }, googleError,
    };
}

const demoLogging = () => process.env.TC_DEMO_DATA === '1';

/** fetch that counts (and in demo mode logs) every Google request. */
function countingFetch(calls: SyncCalls, tag: string): FetchLike {
    return async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        const parsed = new URL(url);
        const host = parsed.hostname;
        if (host === 'analyticsdata.googleapis.com') calls.ga4 += 1;
        else if (host.endsWith('googleapis.com') && parsed.pathname.includes('/searchAnalytics/')) calls.gsc += 1;
        else if (host.endsWith('googleapis.com')) calls.inventory += 1;
        if (demoLogging()) console.log(`[portfolio-sync] ${tag} google ${init?.method ?? 'GET'} ${host}${decodeURIComponent(parsed.pathname)}`);
        return fetch(input, init);
    };
}

async function googlePostOnce(fetchFn: FetchLike, url: string, token: string, body: unknown): Promise<unknown> {
    const res = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(text) as { error?: { message?: string } };
            if (parsed?.error?.message) message = parsed.error.message.slice(0, 300);
        } catch {
            /* keep the status */
        }
        throw new GoogleError(res.status, message);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new GoogleError(502, 'Google returned a page that is not JSON');
    }
}

/** One Google request; a transient failure is retried silently after 0.7 s, 2 s and 5 s (`delays`). */
async function googlePost(fetchFn: FetchLike, url: string, token: string, body: unknown, delays: number[] = retryTuning.call): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await googlePostOnce(fetchFn, url, token, body);
        } catch (err) {
            if (attempt >= delays.length || !isTransientGoogleError(err)) throw err;
            await sleep(delays[attempt]);
        }
    }
}

async function fetchDaily(fetchFn: FetchLike, token: string, kind: AssetKind, assetId: string, start: string, end: string, delays?: number[]): Promise<DailyRow[]> {
    if (kind === 'ga4') {
        const url = `${GA_DATA}/${assetId}:runReport`;
        try {
            return parseGa4Daily(assetId, await googlePost(fetchFn, url, token, ga4DailyRequest(start, end), delays) as never);
        } catch (err) {
            // Properties that predate key events: retry once with conversions.
            if (err instanceof GoogleError && err.status === 400 && /keyEvents/i.test(err.message)) {
                return parseGa4Daily(assetId, await googlePost(fetchFn, url, token, ga4DailyRequest(start, end, true), delays) as never);
            }
            throw err;
        }
    }
    const url = `${GSC}/sites/${encodeURIComponent(assetId)}/searchAnalytics/query`;
    return parseGscDaily(assetId, await googlePost(fetchFn, url, token, gscDailyRequest(start, end), delays) as never);
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) await fn(items[next++]);
    }));
}

/** Pair the inventory with the stored overrides and store it. Returns the stored assets. */
async function storeInventory(identifier: string, inv: Inventory, current: StoreAsset[]): Promise<StoreAsset[]> {
    const pairs = pairSites(inv.properties, inv.sites, pairingOverridesFrom(current));
    const upserts: AssetUpsert[] = [];
    for (const pair of pairs) {
        if (pair.ga4) {
            const p = inv.properties.find((x) => x.property === pair.ga4!.property);
            upserts.push({
                kind: 'ga4', asset_id: pair.ga4.property, display_name: pair.ga4.displayName,
                host: normalizeHost(pair.ga4.streamUris[0] ?? '') || null, account_name: p?.accountName ?? null,
                paired_with: pair.gsc?.siteUrl ?? null,
            });
        }
        if (pair.gsc) {
            upserts.push({
                kind: 'gsc', asset_id: pair.gsc.siteUrl, display_name: pair.host, host: pair.host,
                permission_level: pair.gsc.permissionLevel ?? null, paired_with: pair.ga4?.property ?? null,
            });
        }
    }
    const complete: AssetKind[] = [];
    if (!inv.errors.ga4) complete.push('ga4');
    if (!inv.errors.gsc) complete.push('gsc');
    return adminStore.putAssets(identifier, upserts, complete);
}

/** Re-pair after an override change, without fetching any data. */
export async function repairPairs(identifier: string, accessToken: string): Promise<StoreAsset[]> {
    const inv = await fetchInventory(accessToken, { cacheKey: identifier });
    if (inv.errors.ga4 && inv.errors.gsc) throw new GoogleError(inv.errors.ga4.status, inv.errors.ga4.message);
    return storeInventory(identifier, inv, await adminStore.getAssets(identifier));
}

function isDue(a: StoreAsset, nowS: number, force: boolean): boolean {
    if (a.missing || a.hidden) return false;
    if (a.status === 'syncing') {
        if ((a.sync_started_at ?? 0) > nowS - SYNC_STUCK_S) return false; // a live sync (heartbeat is recent)
        return true; // interrupted (restart, deploy): run again now, whatever its last_synced_at says
    }
    if (!a.backfill_done || !a.last_synced_at) {
        // Never synced yet: retry errors after 5 minutes and "no access" after 30 (it was due on every
        // poll, so a property Google refuses restarted the sync every 2 seconds while the page was open).
        if (a.status === 'error' && !force) return nowS - (a.sync_started_at ?? 0) > ERROR_RETRY_S / 6;
        if (a.status === 'no_access' && !force) return nowS - (a.sync_started_at ?? 0) > ERROR_RETRY_S;
        return true;
    }
    if ((a.status === 'error' || a.status === 'no_access') && !force) return nowS - (a.sync_started_at ?? 0) > ERROR_RETRY_S;
    return force || nowS - a.last_synced_at >= STALE_AFTER_S;
}

/**
 * Search Console sites the user can see but is not verified for cannot be queried: the sync marks
 * them "no access" and never fetches them. needsSync() and runSync() must agree on this. They did
 * not (2026-10 preview): such a site was "due" on every page poll after 30 minutes, every poll
 * started a sync that found nothing to do (due=0), `syncing` stayed true, and the exact-users job
 * (which waits for the sync) never ran, so the "Users (sum of sites)" tile loaded forever.
 */
function isSyncable(a: StoreAsset): boolean {
    return !(a.asset_kind === 'gsc' && a.permission_level === 'siteUnverifiedUser');
}

/** Assets a sync would fetch now (the same rule for the page check and the sync itself). */
export function dueAssets(assets: StoreAsset[], nowS: number, force = false): StoreAsset[] {
    return assets.filter((a) => isSyncable(a) && isDue(a, nowS, force));
}

/** True when some visible asset needs a sync (used on page open). */
export function needsSync(assets: StoreAsset[], nowS: number = Math.floor(Date.now() / 1000)): boolean {
    if (assets.length === 0) return true;
    return dueAssets(assets, nowS).length > 0;
}

function chunksFor(a: StoreAsset, end: string): { chunks: [string, string][]; backfill: boolean; horizon: string } {
    const kind = a.asset_kind;
    const horizon = addDays(end, -(HISTORY_DAYS[kind] - 1));
    if (!a.backfill_done || !a.data_start || !a.data_end) {
        const recentStart = addDays(end, -(RECENT_CHUNK_DAYS - 1));
        const first: [string, string] = [recentStart > horizon ? recentStart : horizon, end];
        const chunks: [string, string][] = [first];
        if (first[0] > horizon) chunks.push([horizon, addDays(first[0], -1)]);
        return { chunks, backfill: true, horizon };
    }
    const from = addDays(a.data_end < end ? a.data_end : end, -LOOKBACK_DAYS[kind]);
    return { chunks: [[from > horizon ? from : horizon, end]], backfill: false, horizon };
}

async function runSync(opts: SyncOptions): Promise<SyncResult> {
    const startedAt = Date.now();
    const nowS = Math.floor(startedAt / 1000);
    const { identifier } = opts;
    const calls: SyncCalls = { inventory: 0, ga4: 0, gsc: 0 };
    const fetchFn = countingFetch(calls, `user=${identifier}`);
    const result = emptyResult(opts, startedAt);
    result.calls = calls;

    let resolved: string | null;
    try {
        resolved = typeof opts.accessToken === 'function' ? await opts.accessToken() : opts.accessToken;
    } catch {
        resolved = null;
    }
    if (!resolved) {
        result.googleError = { status: 401, message: 'Google access expired. Reconnect Google.' };
        result.ms = Date.now() - startedAt;
        return result;
    }
    const accessToken: string = resolved;

    let current: StoreAsset[];
    try {
        current = await adminStore.getAssets(identifier);
    } catch (err) {
        // No admin user row yet: register the user, then try once more.
        if (!(err instanceof AdminStoreError && err.status === 404) || !opts.ensureUser || !(await opts.ensureUser())) throw err;
        current = await adminStore.getAssets(identifier);
    }
    const inv = await fetchInventory(accessToken, { cacheKey: identifier, fetch: fetchFn, refresh: opts.refreshInventory });
    result.properties = inv.properties.length;
    result.sites = inv.sites.length;
    if (inv.errors.ga4 && inv.errors.gsc) {
        const err = inv.errors.ga4.status === 401 || inv.errors.gsc.status === 401 ? { status: 401, message: 'Google access expired. Reconnect Google.' } : inv.errors.ga4;
        result.googleError = err;
        result.ms = Date.now() - startedAt;
        console.warn(`[portfolio-sync] user=${identifier} inventory failed: ${err.status} ${err.message}`);
        return result;
    }

    const assets = await storeInventory(identifier, inv, current);
    const end = syncEndDay(startedAt);

    // Search Console users without access to a site cannot query it.
    const noAccess = assets.filter((a) => a.asset_kind === 'gsc' && !a.missing && a.permission_level === 'siteUnverifiedUser' && a.status !== 'no_access');
    await adminStore.updateStatus(identifier, noAccess.map((a) => ({
        kind: a.asset_kind, asset_id: a.asset_id, status: 'no_access', last_error: 'Not verified in Search Console', sync_started_at: nowS,
    })));
    result.noAccess += noAccess.length;

    const due = dueAssets(assets, nowS, Boolean(opts.force));
    result.due = due.length;
    await adminStore.updateStatus(identifier, due.map((a) => ({
        kind: a.asset_kind, asset_id: a.asset_id, status: 'syncing', last_error: a.last_error, sync_started_at: nowS,
    })));

    let authFailed = false;
    // Assets marked "syncing" above that have not reached a final status. If this run dies on the way
    // (a throw inside mapLimit), they are put back to an error below instead of staying "syncing".
    const unfinished = new Set<StoreAsset>(due);
    // Chunks already stored per asset, so a retry round continues instead of starting over.
    const stored = new Map<StoreAsset, number>();

    /** 'retry' = a transient Google failure that may still clear: the asset stays "syncing" for another round. */
    const processAsset = async (a: StoreAsset, round: number, finalRound: boolean): Promise<'done' | 'retry'> => {
        if (authFailed) {
            await adminStore.updateStatus(identifier, [{ kind: a.asset_kind, asset_id: a.asset_id, status: 'error', last_error: 'Google access expired. Reconnect Google.' }]);
            unfinished.delete(a);
            result.failed += 1;
            return 'done';
        }
        const { chunks, backfill } = chunksFor(a, end);
        try {
            for (let i = stored.get(a) ?? 0; i < chunks.length; i++) {
                const [s, e] = chunks[i];
                const rows = await fetchDaily(fetchFn, accessToken, a.asset_kind, a.asset_id, s, e, round === 0 ? retryTuning.call : retryTuning.later);
                await adminStore.upsertMetrics(identifier, rows);
                stored.set(a, i + 1);
                const last = i === chunks.length - 1;
                const upd: StatusUpdate = {
                    kind: a.asset_kind, asset_id: a.asset_id, status: last ? 'synced' : 'syncing', last_error: null,
                    data_end: end, backfill_done: backfill ? last : true,
                };
                // Chunks run newest first, so each backfill chunk start is the oldest day stored so far.
                if (backfill) upd.data_start = s;
                if (last) upd.last_synced_at = Math.floor(Date.now() / 1000);
                else upd.sync_started_at = Math.floor(Date.now() / 1000); // heartbeat: this sync is alive
                await adminStore.updateStatus(identifier, [upd]);
            }
            result.synced += 1;
        } catch (err) {
            if (!finalRound && isTransientGoogleError(err)) return 'retry';
            const status = err instanceof GoogleError ? err.status : 0;
            if (status === 401) authFailed = true;
            const message = plainGoogleMessage(err);
            if (status === 403) result.noAccess += 1;
            else result.failed += 1;
            if (status === 401) result.googleError = { status, message };
            await adminStore.updateStatus(identifier, [{
                kind: a.asset_kind, asset_id: a.asset_id, status: status === 403 ? 'no_access' : 'error', last_error: message,
            }]).catch(() => undefined);
        }
        unfinished.delete(a);
        return 'done';
    };

    try {
        // Round 0 is the normal pass. Assets that hit a transient Google failure (after the per-request
        // retries) get up to two more rounds a few seconds apart, still showing "syncing"; only a failure
        // that survives them is stored as an error.
        let pending = due;
        for (let round = 0; pending.length > 0; round++) {
            const finalRound = round >= retryTuning.rounds.length;
            if (round > 0) {
                await sleep(retryTuning.rounds[round - 1]);
                const beat = Math.floor(Date.now() / 1000);
                await adminStore.updateStatus(identifier, pending.map((a) => ({
                    kind: a.asset_kind, asset_id: a.asset_id, status: 'syncing' as const, last_error: null, sync_started_at: beat,
                }))).catch(() => undefined);
            }
            const again: StoreAsset[] = [];
            await mapLimit(pending, SYNC_CONCURRENCY, async (a) => {
                if ((await processAsset(a, round, finalRound)) === 'retry') again.push(a);
            });
            pending = again;
        }
    } finally {
        if (unfinished.size > 0) {
            const nowDone = Math.floor(Date.now() / 1000);
            await adminStore.updateStatus(identifier, [...unfinished].map((a) => ({
                kind: a.asset_kind, asset_id: a.asset_id, status: 'error' as const, last_error: 'Sync interrupted. Will retry.', sync_started_at: nowDone,
            }))).catch(() => undefined);
        }
    }

    result.ms = Date.now() - startedAt;
    console.log(
        `[portfolio-sync] user=${identifier} reason=${opts.reason} inventory=${inv.properties.length} ga4 + ${inv.sites.length} gsc` +
        ` due=${result.due} synced=${result.synced} failed=${result.failed} no_access=${result.noAccess}` +
        ` google_calls inventory=${calls.inventory} ga4=${calls.ga4} gsc=${calls.gsc} in ${result.ms}ms`,
    );
    return result;
}

// ─── Exact users per range (lazy, for the range being viewed) ──────────────

const rangeJobs = new Map<string, Promise<void>>();

export function isRangeUsersRunning(identifier: string, rangeKey: string): boolean {
    return rangeJobs.has(`${identifier}|${rangeKey}`);
}

/** Last range-users run per user|range that had Google failures (epoch ms), to back off instead of retrying on every poll. */
const rangeFailedAt = new Map<string, number>();
const RANGE_USERS_RETRY_MS = 5 * 60_000;

export function rangeUsersFailedRecently(identifier: string, rangeKey: string, now: number = Date.now()): boolean {
    const t = rangeFailedAt.get(`${identifier}|${rangeKey}`);
    return t !== undefined && now - t < RANGE_USERS_RETRY_MS;
}

/**
 * Fetch exact (de-duplicated) users for one range and its previous period:
 * ONE GA4 runReport per property (two date ranges, no date dimension), 4
 * properties at a time, stored per (property, range key). Joins a running job.
 */
export function startRangeUsers(opts: {
    identifier: string;
    accessToken: string;
    rangeKey: string;
    window: StoreWindow;
    properties: string[];
}): Promise<void> {
    const key = `${opts.identifier}|${opts.rangeKey}`;
    const existing = rangeJobs.get(key);
    if (existing) return existing;
    const p = runRangeUsers(opts)
        .catch((err) => console.error(`[portfolio-users] user=${opts.identifier} failed:`, err instanceof Error ? err.message : err))
        .finally(() => rangeJobs.delete(key));
    rangeJobs.set(key, p);
    return p;
}

async function runRangeUsers(opts: { identifier: string; accessToken: string; rangeKey: string; window: StoreWindow; properties: string[] }): Promise<void> {
    const started = Date.now();
    const calls: SyncCalls = { inventory: 0, ga4: 0, gsc: 0 };
    const fetchFn = countingFetch(calls, `user=${opts.identifier} users=${opts.rangeKey}`);
    const w = opts.window;
    let failed = 0;
    let stored = 0;
    const key = `${opts.identifier}|${opts.rangeKey}`;
    // Any failure (also a 401 that ends the run early) backs off, so the page polls do not restart it every 2 s.
    const backOff = () => {
        rangeFailedAt.set(key, Date.now());
        if (rangeFailedAt.size > 5000) rangeFailedAt.delete(rangeFailedAt.keys().next().value as string);
    };
    try {
        await mapLimit(opts.properties, SYNC_CONCURRENCY, async (property) => {
            try {
                const report = await googlePost(fetchFn, `${GA_DATA}/${property}:runReport`, opts.accessToken,
                    ga4RangeUsersRequest({ start: w.cur_start, end: w.cur_end }, { start: w.prev_start, end: w.prev_end }));
                const u = parseGa4RangeUsers(report as never);
                // Store each property as it lands so cards fill in while the rest load.
                await adminStore.upsertRangeTotals(opts.identifier, [{
                    kind: 'ga4', asset_id: property, range_key: opts.rangeKey, ...w,
                    active_users_cur: u.activeCur, active_users_prev: u.activePrev, total_users_cur: u.totalCur, total_users_prev: u.totalPrev,
                }]);
                stored += 1;
            } catch (err) {
                failed += 1;
                if (err instanceof GoogleError && err.status === 401) throw err;
            }
        });
    } catch (err) {
        backOff();
        throw err;
    }
    if (failed > 0) backOff();
    else rangeFailedAt.delete(key);
    console.log(
        `[portfolio-users] user=${opts.identifier} range=${opts.rangeKey} properties=${opts.properties.length}` +
        ` stored=${stored} failed=${failed} google_calls ga4=${calls.ga4} in ${Date.now() - started}ms`,
    );
}
