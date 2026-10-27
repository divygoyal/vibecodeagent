/**
 * Server-only: a user's Google connections and which token reads which asset.
 *
 * The primary connection is the user's sign-in Google account (or the Google
 * account they connected first): its tokens come from the session JWT, then the
 * admin DB (lib/serverAuth.ts). Extra Google accounts linked in Settings ->
 * Google (/api/google/link) are read-only DATA connections stored in the admin
 * DB (admin/google_accounts.py); they never change who is signed in.
 *
 * Every Google call for a GA4 property or Search Console site goes out with the
 * token of the connection that lists it in the union inventory
 * (lib/sites/unionInventory.ts: the primary wins, then the account linked
 * first). Users without linked accounts take the old path unchanged: no extra
 * inventory call, the primary token for everything.
 *
 * Never return anything from this module in a response (it carries tokens);
 * routes return connection metadata only.
 */
import { fetchInventory, type FetchLike, type Inventory } from '@/lib/sites/fetchInventory';
import { fetchGoogleTokensFromDb, getValidAccessToken, GoogleTokenError } from '@/lib/googleApi';
import {
    connectionOf,
    mergeInventories,
    PRIMARY_CONNECTION,
    type ConnectionPart,
    type GoogleAssetRef,
    type UserInventory,
} from '@/lib/sites/unionInventory';

export { PRIMARY_CONNECTION, type GoogleAssetRef, type UserInventory };

export interface GoogleCredentials {
    accessToken?: string;
    refreshToken?: string;
}

export type GoogleAccess =
    | { ok: true; token: string }
    | { ok: false; reason: 'not_connected' | 'refresh_failed' };

/** The primary connection's credentials (lib/serverAuth.ts supplies them per request). */
export type PrimaryCredentials = () => Promise<GoogleCredentials>;

export interface LinkedGoogleConnection {
    /** Google `sub`; also the connectionId of its assets. */
    sub: string;
    email: string | null;
    name: string | null;
    status: 'connected' | 'needs_reconnect';
    accessToken?: string;
    refreshToken?: string;
    createdAt?: string | null;
}

const adminUrl = () => (process.env.ADMIN_API_URL || 'http://admin-api:8000').replace(/\/+$/, '');
const adminKey = () => process.env.ADMIN_API_KEY || '';

const LINKED_TTL_MS = 30_000;
const LINKED_FAILURE_TTL_MS = 5_000;

const store = ((globalThis as unknown as { __tcGoogleAccounts?: unknown }).__tcGoogleAccounts ??= {
    linked: new Map<string, { value: LinkedGoogleConnection[]; until: number }>(),
    inflight: new Map<string, Promise<LinkedGoogleConnection[]>>(),
}) as {
    linked: Map<string, { value: LinkedGoogleConnection[]; until: number }>;
    inflight: Map<string, Promise<LinkedGoogleConnection[]>>;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** The user's linked (extra) Google accounts with their tokens. Cached 30 s; [] when there are none or the admin is unreachable. */
export async function listLinkedGoogleConnections(identifier: string, opts: { fresh?: boolean } = {}): Promise<LinkedGoogleConnection[]> {
    if (!identifier || !adminKey()) return [];
    if (!opts.fresh) {
        const hit = store.linked.get(identifier);
        if (hit && hit.until > Date.now()) return hit.value;
        const pending = store.inflight.get(identifier);
        if (pending) return pending;
    }
    const p = (async () => {
        let value: LinkedGoogleConnection[] = [];
        let ttl = LINKED_TTL_MS;
        try {
            const res = await fetch(`${adminUrl()}/api/users/${encodeURIComponent(identifier)}/google/linked`, {
                headers: { 'X-API-Key': adminKey() },
                cache: 'no-store',
                signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
                const data = await res.json() as { linked?: Record<string, unknown>[] };
                value = (data.linked ?? []).filter((r) => str(r.sub)).map((r) => ({
                    sub: String(r.sub),
                    email: str(r.email) ?? null,
                    name: str(r.name) ?? null,
                    status: r.status === 'needs_reconnect' ? 'needs_reconnect' : 'connected',
                    accessToken: str(r.access_token),
                    refreshToken: str(r.refresh_token),
                    createdAt: str(r.created_at) ?? null,
                }));
            } else if (res.status !== 404) {
                ttl = LINKED_FAILURE_TTL_MS;
            }
        } catch {
            ttl = LINKED_FAILURE_TTL_MS; // admin busy: behave as a single-account user for a few seconds
        }
        store.linked.set(identifier, { value, until: Date.now() + ttl });
        if (store.linked.size > 5000) for (const [k, v] of store.linked) if (v.until < Date.now()) store.linked.delete(k);
        return value;
    })().finally(() => store.inflight.delete(identifier));
    store.inflight.set(identifier, p);
    return p;
}

/** Forget cached linked-account lists (after a link, reconnect or disconnect). */
export function invalidateGoogleConnections(): void {
    store.linked.clear();
}

/** Record that Google refused (or accepted again) a linked account's token. */
export async function setLinkedStatus(identifier: string, sub: string, status: 'connected' | 'needs_reconnect'): Promise<void> {
    if (!adminKey()) return;
    try {
        await fetch(`${adminUrl()}/api/users/${encodeURIComponent(identifier)}/google/linked/${encodeURIComponent(sub)}`, {
            method: 'PATCH',
            headers: { 'X-API-Key': adminKey(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
            signal: AbortSignal.timeout(5000),
        });
    } catch { /* best effort: the next call finds out again */ }
    invalidateGoogleConnections();
}

/** A valid access token from stored credentials (refreshes and caches through lib/googleApi). */
export async function accessFromCredentials(creds: GoogleCredentials): Promise<GoogleAccess> {
    if (!creds.accessToken && !creds.refreshToken) return { ok: false, reason: 'not_connected' };
    try {
        return { ok: true, token: await getValidAccessToken(creds.accessToken, creds.refreshToken) };
    } catch {
        return { ok: false, reason: 'refresh_failed' };
    }
}

/** A linked account's access token. A refresh token Google rejects marks the account "Needs reconnect". */
export async function linkedAccess(identifier: string, conn: LinkedGoogleConnection): Promise<GoogleAccess> {
    if (!conn.refreshToken && !conn.accessToken) return { ok: false, reason: 'not_connected' };
    try {
        // Only the refresh token: a stored access token is at most an hour old and never the better choice.
        const token = await getValidAccessToken(conn.refreshToken ? undefined : conn.accessToken, conn.refreshToken);
        return { ok: true, token };
    } catch (err) {
        if (err instanceof GoogleTokenError && err.code === 'invalid_grant' && conn.status !== 'needs_reconnect') {
            console.warn('[google-accounts] a linked Google account needs reconnecting (invalid_grant)');
            await setLinkedStatus(identifier, conn.sub, 'needs_reconnect');
        }
        return { ok: false, reason: 'refresh_failed' };
    }
}

export interface UserInventoryOptions {
    /** The primary connection: its credentials, or an access result already in hand. */
    primary: PrimaryCredentials | GoogleAccess;
    /** Inventory cache key of the primary connection (default: the identifier). Linked ones use `<key>#<sub>`. */
    cacheKey?: string;
    refresh?: boolean;
    fetch?: FetchLike;
    /** Linked connections already loaded (skips the admin lookup). */
    linked?: LinkedGoogleConnection[];
}

async function primaryAccess(primary: UserInventoryOptions['primary']): Promise<GoogleAccess> {
    return typeof primary === 'function' ? accessFromCredentials(await primary()) : primary;
}

const unauthorized = (inv: Inventory) => inv.errors.ga4?.status === 401 && inv.errors.gsc?.status === 401;

/**
 * The union inventory of every Google connection of the user (each listing cached 10 minutes by
 * fetchInventory). Linked accounts marked "Needs reconnect" are not called until they are reconnected.
 */
export async function loadUserInventory(identifier: string, opts: UserInventoryOptions): Promise<UserInventory> {
    const key = opts.cacheKey ?? identifier;
    const [access, linked] = await Promise.all([
        primaryAccess(opts.primary),
        opts.linked ?? listLinkedGoogleConnections(identifier),
    ]);

    const primaryPart = (async (): Promise<ConnectionPart> => {
        if (!access.ok) {
            return { connectionId: PRIMARY_CONNECTION, primary: true, state: access.reason === 'not_connected' ? 'not_connected' : 'needs_reconnect' };
        }
        const inventory = await fetchInventory(access.token, { cacheKey: key, refresh: opts.refresh, fetch: opts.fetch });
        return { connectionId: PRIMARY_CONNECTION, primary: true, state: unauthorized(inventory) ? 'needs_reconnect' : 'ok', inventory };
    })();

    const linkedParts = linked.map(async (conn): Promise<ConnectionPart> => {
        const base = { connectionId: conn.sub, primary: false, email: conn.email };
        if (conn.status === 'needs_reconnect') return { ...base, state: 'needs_reconnect' };
        const a = await linkedAccess(identifier, conn);
        if (!a.ok) return { ...base, state: a.reason === 'not_connected' ? 'not_connected' : 'needs_reconnect' };
        const inventory = await fetchInventory(a.token, { cacheKey: `${key}#${conn.sub}`, refresh: opts.refresh, fetch: opts.fetch });
        if (unauthorized(inventory)) {
            await setLinkedStatus(identifier, conn.sub, 'needs_reconnect');
            return { ...base, state: 'needs_reconnect', inventory };
        }
        const failed = inventory.errors.ga4 && inventory.errors.gsc;
        return { ...base, state: failed ? 'error' : 'ok', inventory };
    });

    const parts = await Promise.all([primaryPart, ...linkedParts]);
    return mergeInventories(parts);
}

export interface AssetCredentials extends GoogleCredentials {
    /** 'primary' or the linked account's Google sub. */
    connectionId: string;
}

/**
 * Credentials of the connection that can read `asset`. Users without linked accounts (and assets no
 * linked account lists) get the primary credentials, exactly as before.
 */
export async function credentialsForAsset(identifier: string, asset: GoogleAssetRef | null | undefined, primary: PrimaryCredentials): Promise<AssetCredentials> {
    const linked = asset && asset.id ? await listLinkedGoogleConnections(identifier) : [];
    if (linked.length === 0) return { ...(await primary()), connectionId: PRIMARY_CONNECTION };

    let primaryCreds: GoogleCredentials | null = null;
    const getPrimary = async () => (primaryCreds ??= await primary());
    const inv = await loadUserInventory(identifier, { primary: getPrimary, linked });
    const owner = connectionOf(inv, asset!);
    const conn = owner && owner !== PRIMARY_CONNECTION ? linked.find((c) => c.sub === owner) : undefined;
    if (!conn) return { ...(await getPrimary()), connectionId: PRIMARY_CONNECTION };
    return { refreshToken: conn.refreshToken, accessToken: conn.refreshToken ? undefined : conn.accessToken, connectionId: conn.sub };
}

/** A valid access token for `asset` (see credentialsForAsset). */
export async function accessForAsset(identifier: string, asset: GoogleAssetRef | null | undefined, primary: PrimaryCredentials): Promise<GoogleAccess & { connectionId: string }> {
    const creds = await credentialsForAsset(identifier, asset, primary);
    if (creds.connectionId !== PRIMARY_CONNECTION) {
        const conn = (await listLinkedGoogleConnections(identifier)).find((c) => c.sub === creds.connectionId);
        if (conn) return { ...(await linkedAccess(identifier, conn)), connectionId: conn.sub };
    }
    return { ...(await accessFromCredentials(creds)), connectionId: creds.connectionId };
}

/** A token per connection id, resolved once each (the portfolio sync routes hundreds of assets). */
export function connectionTokenResolver(identifier: string, primaryToken: string, linked: LinkedGoogleConnection[]): (connectionId: string | null | undefined) => Promise<GoogleAccess> {
    const memo = new Map<string, Promise<GoogleAccess>>();
    return (connectionId) => {
        const id = connectionId || PRIMARY_CONNECTION;
        if (id === PRIMARY_CONNECTION) return Promise.resolve({ ok: true, token: primaryToken });
        let p = memo.get(id);
        if (!p) {
            const conn = linked.find((c) => c.sub === id);
            p = conn ? linkedAccess(identifier, conn) : Promise.resolve({ ok: false, reason: 'not_connected' } as GoogleAccess);
            memo.set(id, p);
        }
        return p;
    };
}

/**
 * Background jobs (shares, digests, reports): the stored credentials of the connection that lists
 * `asset` (the admin DB's primary tokens unless a linked account lists it). Null when not connected.
 */
export async function storedCredentialsForAsset(identifier: string, asset: GoogleAssetRef | null | undefined): Promise<AssetCredentials | null> {
    const primary = async (): Promise<GoogleCredentials> => (await fetchGoogleTokensFromDb(identifier)) ?? {};
    const creds = await credentialsForAsset(identifier, asset, primary);
    return creds.accessToken || creds.refreshToken ? creds : null;
}
