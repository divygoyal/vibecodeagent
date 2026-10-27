/**
 * Who may read a GA4 property's realtime data (security review F3 / N4). Server-only, no request access of its own.
 *
 * The public demo user: only the demo catalogue's properties. Everyone else: the property must be in their Google
 * inventory (cached per user). On a miss the inventory is reloaded once (at most once a minute per user) before
 * answering no, so a property added in Google a moment ago works straight away. When the inventory cannot be
 * listed at all, Google's own check on the caller's token decides (the realtime cache is per user anyway).
 */
import { findSiteByPropertyId } from '@/lib/demo/catalog';
import { DEMO_USER_ID } from '@/lib/publicDemo/config';

type Inventory = { properties: { property: string }[] } | null;
export type InventoryLoader = (opts: { refresh?: boolean }) => Promise<Inventory>;

const digitsOf = (p: string) => /(\d+)/.exec(p)?.[1] ?? '';
const refreshedAt = new Map<string, number>();
const REFRESH_EVERY_MS = 60_000;

export async function canReadGa4Property(userId: string, propertyId: string, load: InventoryLoader, now: number = Date.now()): Promise<boolean> {
    const digits = digitsOf(propertyId);
    if (!digits) return false;
    if (userId === DEMO_USER_ID) return Boolean(findSiteByPropertyId(digits)?.ga);
    const listed = (inv: Inventory) => !inv || inv.properties.length === 0 || inv.properties.some((p) => digitsOf(p.property) === digits);
    if (listed(await load({}).catch(() => null))) return true;
    const last = refreshedAt.get(userId) ?? 0;
    if (now - last < REFRESH_EVERY_MS) return false;
    if (refreshedAt.size > 10_000) refreshedAt.clear();
    refreshedAt.set(userId, now);
    return listed(await load({ refresh: true }).catch(() => null));
}
