/**
 * Server-only: everything the app needs to build its site directory, in one answer.
 *
 *   GET /api/sites/directory               live: Search Console sites + GA4 properties from Google
 *                                          (both lists in parallel, cached per user) + the stored pairing
 *   GET /api/sites/directory?source=store  fast: the same shape from the portfolio store alone (one local
 *                                          admin call, no Google), for users who have opened the portfolio
 *
 * Before this, the app asked for /api/connections, then the two Google lists (each gated on the first),
 * then the pairing, one after the other from the browser, and no site page could render until all of it
 * had come back. Now the browser asks once as soon as it is signed in, the Google lists load in parallel
 * on the server and share the caches of /api/seo?mode=list and /api/analytics?mode=list (5 minutes, per
 * user, so the later calls for the same lists are free), and `source=store` lets /dashboard/s/[host]
 * start fetching its data while the live lists are still on their way.
 *
 * The pairing is read fresh on every call (it is local and cheap), so a pairing change shows at once even
 * though the Google lists are cached. A failed list is cached for a few seconds only, so polling clients
 * do not hammer Google during an outage.
 */
import { cachedFetch, CACHE_TTL, invalidateCache } from '@/lib/apiCache';
import { describeGoogleError } from '@/lib/googleErrors';
import { listAnalyticsProperties, listSearchConsoleSites } from '@/lib/googleApi';
import { invalidateInventory } from '@/lib/sites/fetchInventory';
import { AdminStoreError, adminStore } from '@/lib/portfolio/adminStore';
import type { GoogleAccess } from '@/lib/portfolio/auth';
import type { StoreAsset } from '@/lib/portfolio/snapshot';
import { storedPairs } from './pairingStore';
import type { DirectoryError, DirectoryPayload, DirectoryProperty, DirectorySite } from './directoryTypes';

export type { DirectoryError, DirectoryPayload, DirectoryProperty, DirectorySite };

const LIST_TIMEOUT_MS = 10_000;
const FAILURE_TTL_MS = 10_000;

interface Failed {
    __isError: true;
    error: string;
    /** Error name, so a timeout (TimeoutError / AbortError) is still recognised from the message-only record. */
    name?: string;
}

const failureMemo = ((globalThis as unknown as { __tcDirectoryFailures?: Map<string, { error: Failed; until: number }> }).__tcDirectoryFailures ??= new Map());

/** One Google list through the cache the /api/seo and /api/analytics list routes use, with a short memory of failures. */
async function cachedList<T>(key: string, load: () => Promise<T>): Promise<T | Failed> {
    const failed = failureMemo.get(key);
    if (failed && failed.until > Date.now()) return failed.error;
    const result = await cachedFetch<T | Failed>(key, CACHE_TTL.PROPERTY_LIST, async () => {
        try {
            return await load();
        } catch (e) {
            return { __isError: true, error: e instanceof Error ? e.message : 'Failed to load the list', name: e instanceof Error ? e.name : undefined } as Failed;
        }
    });
    if (result && typeof result === 'object' && '__isError' in result) {
        failureMemo.set(key, { error: result, until: Date.now() + FAILURE_TTL_MS });
        if (failureMemo.size > 2000) for (const [k, v] of failureMemo) if (v.until < Date.now()) failureMemo.delete(k);
    } else {
        failureMemo.delete(key);
    }
    return result;
}

function toError(f: Failed): DirectoryError {
    const err = new Error(f.error);
    if (f.name) err.name = f.name;
    const d = describeGoogleError(err);
    return { code: d.error, message: d.message };
}

async function storedAssets(identifier: string): Promise<StoreAsset[]> {
    try {
        return await adminStore.getAssets(identifier);
    } catch (err) {
        if (!(err instanceof AdminStoreError && err.status === 404)) console.warn('[sites-directory] store unavailable:', err instanceof Error ? err.message : err);
        return []; // user row not created yet, or the admin is busy: no stored pairing
    }
}

/** The directory from the portfolio store alone: what the last sync saw, with the pairing it decided. */
export async function loadStoreDirectory(identifier: string): Promise<DirectoryPayload> {
    const assets = (await storedAssets(identifier)).filter((a) => !a.missing);
    return {
        source: 'store',
        connected: true,
        sites: assets.filter((a) => a.asset_kind === 'gsc').map((a) => ({ siteUrl: a.asset_id, ...(a.permission_level ? { permissionLevel: a.permission_level } : {}) })),
        properties: assets.filter((a) => a.asset_kind === 'ga4').map((a) => ({ property: a.asset_id, displayName: a.display_name || a.asset_id, ...(a.host ? { host: a.host } : {}) })),
        pairs: storedPairs(assets),
        errors: {},
    };
}

/**
 * The live directory: both Google lists in parallel (cached), plus the stored pairing. `refresh` skips the
 * cached lists and drops the portfolio's cached inventory too ("Check again"), so the next portfolio sync
 * lists Google afresh and stores a site the user just added.
 */
export async function loadLiveDirectory(identifier: string, getAccess: () => Promise<GoogleAccess>, opts: { refresh?: boolean } = {}): Promise<DirectoryPayload> {
    if (opts.refresh) {
        for (const key of [`gsc:sites:${identifier}`, `ga:properties:${identifier}`]) {
            invalidateCache(key);
            failureMemo.delete(key);
        }
        invalidateInventory(identifier);
    }
    const [access, assets] = await Promise.all([getAccess(), storedAssets(identifier)]);
    const pairs = storedPairs(assets.filter((a) => !a.missing));
    if (!access.ok) {
        if (access.reason === 'not_connected') return { source: 'live', connected: false, sites: [], properties: [], pairs, errors: {} };
        const err: DirectoryError = { code: 'google_reauth', message: 'Google access expired or was revoked. Reconnect Google.' };
        return { source: 'live', connected: true, sites: [], properties: [], pairs, errors: { sites: err, properties: err } };
    }
    const token = access.token;
    const [sites, properties] = await Promise.all([
        cachedList<DirectorySite[]>(`gsc:sites:${identifier}`, () => listSearchConsoleSites(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
        cachedList<DirectoryProperty[]>(`ga:properties:${identifier}`, () => listAnalyticsProperties(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
    ]);
    const errors: DirectoryPayload['errors'] = {};
    if (!Array.isArray(sites)) errors.sites = toError(sites);
    if (!Array.isArray(properties)) errors.properties = toError(properties);
    const hostOf = new Map(assets.filter((a) => a.asset_kind === 'ga4' && a.host).map((a) => [a.asset_id, a.host as string]));
    return {
        source: 'live',
        connected: true,
        sites: Array.isArray(sites) ? sites : [],
        properties: Array.isArray(properties) ? properties.map((p) => (hostOf.has(p.property) && !p.host ? { ...p, host: hostOf.get(p.property) } : p)) : [],
        pairs,
        errors,
    };
}
