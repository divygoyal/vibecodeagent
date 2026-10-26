/**
 * The one store for manual GA4 <-> Search Console pairings: the GA4 rows of
 * portfolio_assets (admin/portfolio_api.py, column pairing_override). The
 * portfolio sync, the portfolio pairing dialog and the MCP site resolver all
 * read and write it here, so a pairing fixed in the app is the pairing the
 * AI tools see. Server-only.
 */
import { AdminStoreError, adminStore } from '@/lib/portfolio/adminStore';
import { NO_PAIR, pairingOverridesFrom } from '@/lib/portfolio/snapshot';
import type { PairingOverrides } from './pairing';

const TTL_MS = 10 * 60_000;
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
