/**
 * The one store for manual GA4 <-> Search Console pairings: the GA4 rows of
 * portfolio_assets (admin/portfolio_api.py, column pairing_override). The
 * portfolio sync, the portfolio pairing dialog and the MCP site resolver all
 * read and write it here, so a pairing fixed in the app is the pairing the
 * AI tools see. Server-only.
 */
import { AdminStoreError, adminStore } from '@/lib/portfolio/adminStore';
import { NO_PAIR, pairingOverridesFrom, type StoreAsset } from '@/lib/portfolio/snapshot';
import type { PairingOverrides } from './pairing';

const TTL_MS = 10 * 60_000;

/**
 * The resolved pairing of every GA4 property in the store: GA4 property ->
 * the GSC site URL it is paired with (auto or manual), or null when it is
 * GA4-only. Missing (no longer accessible) properties are left out.
 */
export function storedPairs(assets: Pick<StoreAsset, 'asset_kind' | 'asset_id' | 'paired_with' | 'missing'>[]): Record<string, string | null> {
    const gsc = new Set(assets.filter((a) => a.asset_kind === 'gsc' && !a.missing).map((a) => a.asset_id));
    const out: Record<string, string | null> = {};
    for (const a of assets) {
        if (a.asset_kind !== 'ga4' || a.missing) continue;
        out[a.asset_id] = a.paired_with && gsc.has(a.paired_with) ? a.paired_with : null;
    }
    return out;
}
const cache = new Map<string, { value: PairingOverrides; until: number }>();

/** Overrides of one user (GA4 property -> GSC site URL | null). Empty when the user has none or the store is down. */
export async function loadPairingOverrides(identifier: string | null | undefined, opts: { fresh?: boolean } = {}): Promise<PairingOverrides> {
    if (!identifier) return {};
    const hit = cache.get(identifier);
    if (!opts.fresh && hit && hit.until > Date.now()) return hit.value;
    let value: PairingOverrides = {};
    try {
        value = pairingOverridesFrom(await adminStore.getAssets(identifier));
    } catch {
        /* user row may not exist yet, or the admin is down: automatic pairing */
    }
    cache.set(identifier, { value, until: Date.now() + TTL_MS });
    return value;
}

/** Drop cached overrides after a write (all users: identifiers may differ in form between the app and MCP). */
export function invalidatePairingOverrides(): void {
    cache.clear();
}

/**
 * Set the pairing of one GA4 property: a GSC site URL, null (never pair), or
 * 'auto' (back to automatic pairing by host). Creates the GA4 asset row when
 * the user has never opened the portfolio.
 */
export async function setPairingOverride(identifier: string, ga4Property: string, value: string | null | 'auto'): Promise<void> {
    const patch = value === 'auto'
        ? { kind: 'ga4' as const, asset_id: ga4Property, clear_override: true }
        : { kind: 'ga4' as const, asset_id: ga4Property, pairing_override: value ?? NO_PAIR };
    try {
        await adminStore.patchAsset(identifier, patch);
    } catch (err) {
        if (!(err instanceof AdminStoreError) || err.status !== 404) throw err;
        await adminStore.putAssets(identifier, [{ kind: 'ga4', asset_id: ga4Property }], []);
        await adminStore.patchAsset(identifier, patch);
    }
    invalidatePairingOverrides();
}
