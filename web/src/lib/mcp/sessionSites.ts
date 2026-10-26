/**
 * The signed-in user's site list and Google health, for the consent screen
 * ("Only selected sites") and the Connect AI page. Same site ids as the MCP
 * tools use (siteResolver.buildSiteRecords).
 */
import { fetchGoogleTokensFromDb, getValidAccessToken } from '@/lib/googleApi';
import { fetchInventory, type Inventory } from '@/lib/sites/fetchInventory';
import { loadPairingOverrides } from '@/lib/sites/pairingStore';
import { buildSiteRecords, type SiteRecord } from './siteResolver';
import type { SessionUser } from './session';

export interface SessionSites {
    connected: boolean;
    sites: SiteRecord[];
    ga4Count: number;
    gscCount: number;
    errors: Inventory['errors'];
    reauthRequired: boolean;
}

export async function loadSessionSites(user: SessionUser): Promise<SessionSites> {
    const empty = (reauth: boolean): SessionSites => ({ connected: false, sites: [], ga4Count: 0, gscCount: 0, errors: {}, reauthRequired: reauth });
    let access = user.googleAccessToken || undefined;
    let refresh = user.googleRefreshToken || undefined;
    if (!refresh) {
        const db = await fetchGoogleTokensFromDb(user.id).catch(() => null);
        if (db) {
            access = db.accessToken || access;
            refresh = db.refreshToken || refresh;
        }
    }
    if (!access && !refresh) return empty(false);
    let token: string;
    try {
        token = await getValidAccessToken(access, refresh);
    } catch {
        return empty(true);
    }
    const inv = await fetchInventory(token, { cacheKey: `session:${user.id}` });
    const reauth = inv.errors.ga4?.status === 401 || inv.errors.gsc?.status === 401;
    const overrides = await loadPairingOverrides(user.id);
    return {
        connected: !reauth,
        sites: buildSiteRecords(inv, overrides),
        ga4Count: inv.properties.length,
        gscCount: inv.sites.length,
        errors: inv.errors,
        reauthRequired: reauth,
    };
}
