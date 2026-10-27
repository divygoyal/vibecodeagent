/**
 * One inventory across all of a user's Google connections: the primary
 * connection (their sign-in, or the Google account they connected first) and
 * any extra Google accounts linked in Settings -> Google.
 *
 * Every GA4 property and Search Console site is tagged with the connection it
 * was listed from (`connectionId`: 'primary' or the linked account's Google
 * `sub`). An asset two connections can read is listed once: the primary wins,
 * then the linked account connected first. Server code calls Google for an
 * asset with that connection's token (lib/googleAccounts.ts).
 *
 * Pure: no network, no tokens. tests/googleAccounts.test.mjs drives it.
 */
import type { Inventory, InventoryError, InventoryProperty } from './fetchInventory';
import type { GscSiteInput } from './pairing';

export const PRIMARY_CONNECTION = 'primary';

export type GoogleAssetKind = 'ga4' | 'gsc';

/** A GA4 property ("properties/123", "123") or a Search Console site URL. */
export interface GoogleAssetRef {
    kind: GoogleAssetKind;
    id: string;
}

export interface TaggedProperty extends InventoryProperty {
    connectionId: string;
}

export interface TaggedSite extends GscSiteInput {
    connectionId: string;
}

export type ConnectionState =
    | 'ok'               // listed (one side may still have failed, see errors)
    | 'needs_reconnect'  // Google refused the token: Reconnect this account
    | 'not_connected'    // no token stored
    | 'error';           // both lists failed for another reason (quota, outage)

/** One connection's part of the union, as loaded. */
export interface ConnectionPart {
    connectionId: string;
    primary: boolean;
    email?: string | null;
    state: ConnectionState;
    /** Absent when no listing was attempted (no token, needs reconnect). */
    inventory?: Inventory | null;
}

export interface ConnectionSummary {
    connectionId: string;
    primary: boolean;
    email: string | null;
    state: ConnectionState;
    /** Assets this connection listed (before the dedupe). */
    properties: number;
    sites: number;
    /** Assets credited to this connection after the dedupe. */
    ownProperties: number;
    ownSites: number;
    errors: { ga4?: InventoryError; gsc?: InventoryError };
}

export interface UserInventory {
    properties: TaggedProperty[];
    sites: TaggedSite[];
    /**
     * The primary connection's listing errors (what single-account callers
     * always saw, so "Reconnect Google" still means the sign-in account). A user
     * without a primary Google connection gets an error only for a side that
     * every linked account failed.
     */
    errors: Inventory['errors'];
    fetchedAt: number;
    connections: ConnectionSummary[];
}

/** "properties/123" for "123", "properties/123" or "properties/123/..."; the input when it has no digits. */
export function propertyKey(id: string): string {
    const m = /(?:^|properties\/)(\d+)/.exec((id || '').trim());
    return m ? `properties/${m[1]}` : (id || '').trim();
}

/** Search Console site URLs compare case-insensitively and with or without the trailing slash. */
export function siteKey(siteUrl: string): string {
    return (siteUrl || '').trim().toLowerCase().replace(/\/+$/, '');
}

export function assetKey(asset: GoogleAssetRef): string {
    return asset.kind === 'ga4' ? `ga4|${propertyKey(asset.id)}` : `gsc|${siteKey(asset.id)}`;
}

/** Primary first, then linked accounts in the order given (the order they were connected). */
function ordered(parts: ConnectionPart[]): ConnectionPart[] {
    return [...parts.filter((p) => p.primary), ...parts.filter((p) => !p.primary)];
}

export function mergeInventories(parts: ConnectionPart[], now: number = Date.now()): UserInventory {
    const properties: TaggedProperty[] = [];
    const sites: TaggedSite[] = [];
    const seenProps = new Set<string>();
    const seenSites = new Set<string>();
    const connections: ConnectionSummary[] = [];

    for (const part of ordered(parts)) {
        const inv = part.inventory;
        const summary: ConnectionSummary = {
            connectionId: part.connectionId, primary: part.primary, email: part.email ?? null, state: part.state,
            properties: inv?.properties.length ?? 0, sites: inv?.sites.length ?? 0, ownProperties: 0, ownSites: 0,
            errors: { ...(inv?.errors ?? {}) },
        };
        connections.push(summary);
        if (!inv) continue;
        for (const p of inv.properties) {
            const k = propertyKey(p.property);
            if (seenProps.has(k)) continue;
            seenProps.add(k);
            properties.push({ ...p, connectionId: part.connectionId });
            summary.ownProperties += 1;
        }
        for (const s of inv.sites) {
            const k = siteKey(s.siteUrl);
            if (seenSites.has(k)) continue;
            seenSites.add(k);
            sites.push({ ...s, connectionId: part.connectionId });
            summary.ownSites += 1;
        }
    }

    const primary = parts.find((p) => p.primary && p.state !== 'not_connected');
    let errors: Inventory['errors'] = {};
    if (primary) {
        errors = primary.inventory?.errors
            ? { ...primary.inventory.errors }
            : primary.state === 'needs_reconnect'
                ? { ga4: { status: 401, message: 'Google access expired. Reconnect Google.' }, gsc: { status: 401, message: 'Google access expired. Reconnect Google.' } }
                : {};
    } else {
        const tried = parts.filter((p) => p.inventory);
        for (const kind of ['ga4', 'gsc'] as const) {
            if (tried.length > 0 && tried.every((p) => p.inventory!.errors[kind])) errors[kind] = tried[0].inventory!.errors[kind];
        }
    }

    const fetched = parts.map((p) => p.inventory?.fetchedAt).filter((t): t is number => typeof t === 'number');
    return { properties, sites, errors, fetchedAt: fetched.length ? Math.min(...fetched) : now, connections };
}

/** The connection that lists `asset` in the union (the dedupe winner), or null when none does. */
export function connectionOf(inv: Pick<UserInventory, 'properties' | 'sites'>, asset: GoogleAssetRef): string | null {
    if (asset.kind === 'ga4') {
        const k = propertyKey(asset.id);
        return inv.properties.find((p) => propertyKey(p.property) === k)?.connectionId ?? null;
    }
    const k = siteKey(asset.id);
    return inv.sites.find((s) => siteKey(s.siteUrl) === k)?.connectionId ?? null;
}

/** asset key -> connection id, for callers that route many assets at once (the portfolio sync). */
export function connectionMap(inv: Pick<UserInventory, 'properties' | 'sites'>): Map<string, string> {
    const out = new Map<string, string>();
    for (const p of inv.properties) out.set(assetKey({ kind: 'ga4', id: p.property }), p.connectionId);
    for (const s of inv.sites) out.set(assetKey({ kind: 'gsc', id: s.siteUrl }), s.connectionId);
    return out;
}
