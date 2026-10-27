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
import { linkedAccess, listLinkedGoogleConnections } from '@/lib/googleAccounts';
import { AdminStoreError, adminStore } from '@/lib/portfolio/adminStore';
import type { GoogleAccess } from '@/lib/portfolio/auth';
import type { StoreAsset } from '@/lib/portfolio/snapshot';
import { storedPairs } from './pairingStore';
import { propertyKey, siteKey } from './unionInventory';
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
        sites: assets.filter((a) => a.asset_kind === 'gsc').map((a) => ({ siteUrl: a.asset_id, ...(a.permission_level ? { permissionLevel: a.permission_level } : {}), ...(a.connection_id ? { connectionId: a.connection_id } : {}) })),
        properties: assets.filter((a) => a.asset_kind === 'ga4').map((a) => ({ property: a.asset_id, displayName: a.display_name || a.asset_id, ...(a.connection_id ? { connectionId: a.connection_id } : {}) })),
        pairs: storedPairs(assets),
        errors: {},
    };
}

/** The live directory: both Google lists in parallel (cached), plus the stored pairing. `refresh` skips the cached lists ("Check again"). */
export async function loadLiveDirectory(identifier: string, getAccess: () => Promise<GoogleAccess>, opts: { refresh?: boolean } = {}): Promise<DirectoryPayload> {
    const linked = await listLinkedGoogleConnections(identifier);
    if (opts.refresh) {
        for (const suffix of ['', ...linked.map((c) => `#${c.sub}`)]) {
            for (const key of [`gsc:sites:${identifier}${suffix}`, `ga:properties:${identifier}${suffix}`]) {
                invalidateCache(key);
                failureMemo.delete(key);
            }
        }
    }
    const [access, assets, extra] = await Promise.all([getAccess(), storedAssets(identifier), linkedLists(identifier, linked)]);
    const pairs = storedPairs(assets.filter((a) => !a.missing));
    if (!access.ok) {
        if (access.reason === 'not_connected' && !extra.any) return { source: 'live', connected: false, sites: [], properties: [], pairs, errors: {} };
        const err: DirectoryError | undefined = access.reason === 'not_connected' ? undefined : { code: 'google_reauth', message: 'Google access expired or was revoked. Reconnect Google.' };
        return { source: 'live', connected: true, sites: extra.sites, properties: extra.properties, pairs, errors: err ? { sites: err, properties: err } : {} };
    }
    const token = access.token;
    const [sites, properties] = await Promise.all([
        cachedList<DirectorySite[]>(`gsc:sites:${identifier}`, () => listSearchConsoleSites(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
        cachedList<DirectoryProperty[]>(`ga:properties:${identifier}`, () => listAnalyticsProperties(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
    ]);
    const errors: DirectoryPayload['errors'] = {};
    if (!Array.isArray(sites)) errors.sites = toError(sites);
    if (!Array.isArray(properties)) errors.properties = toError(properties);
    // Linked Google accounts add what the sign-in account cannot see (the sign-in account wins a tie).
    const ownSites = Array.isArray(sites) ? sites : [];
    const ownProps = Array.isArray(properties) ? properties : [];
    const siteSeen = new Set(ownSites.map((s) => siteKey(s.siteUrl)));
    const propSeen = new Set(ownProps.map((p) => propertyKey(p.property)));
    return {
        source: 'live',
        connected: true,
        sites: [...ownSites, ...extra.sites.filter((s) => !siteSeen.has(siteKey(s.siteUrl)))],
        properties: [...ownProps, ...extra.properties.filter((p) => !propSeen.has(propertyKey(p.property)))],
        pairs,
        errors,
    };
}

/** The lists of each linked Google account (cached like the primary ones), deduped in connection order. */
async function linkedLists(identifier: string, linked: Awaited<ReturnType<typeof listLinkedGoogleConnections>>): Promise<{ any: boolean; sites: DirectorySite[]; properties: DirectoryProperty[] }> {
    const out = { any: false, sites: [] as DirectorySite[], properties: [] as DirectoryProperty[] };
    const parts = await Promise.all(linked.filter((c) => c.status !== 'needs_reconnect').map(async (conn) => {
        const access = await linkedAccess(identifier, conn);
        if (!access.ok) return null;
        const token = access.token;
        const [sites, properties] = await Promise.all([
            cachedList<DirectorySite[]>(`gsc:sites:${identifier}#${conn.sub}`, () => listSearchConsoleSites(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
            cachedList<DirectoryProperty[]>(`ga:properties:${identifier}#${conn.sub}`, () => listAnalyticsProperties(token, AbortSignal.timeout(LIST_TIMEOUT_MS))),
        ]);
        return { sub: conn.sub, sites: Array.isArray(sites) ? sites : [], properties: Array.isArray(properties) ? properties : [] };
    }));
    const siteSeen = new Set<string>();
    const propSeen = new Set<string>();
    for (const part of parts) {
        if (!part) continue;
        out.any = true;
        for (const s of part.sites) {
            if (siteSeen.has(siteKey(s.siteUrl))) continue;
            siteSeen.add(siteKey(s.siteUrl));
            out.sites.push({ siteUrl: s.siteUrl, ...(s.permissionLevel ? { permissionLevel: s.permissionLevel } : {}), connectionId: part.sub });
        }
        for (const p of part.properties) {
            if (propSeen.has(propertyKey(p.property))) continue;
            propSeen.add(propertyKey(p.property));
            out.properties.push({ property: p.property, displayName: p.displayName, ...(p.parent ? { parent: p.parent } : {}), connectionId: part.sub });
        }
    }
    return out;
}
