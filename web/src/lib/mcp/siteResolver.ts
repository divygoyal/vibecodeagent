/**
 * Site catalogue for MCP tools: the user's GA4 properties and Search Console
 * sites paired by host (lib/sites/pairing.ts), the grant's site filter, and
 * resolution of a site argument (site_id, URL, sc-domain:, properties/N or a
 * display name). MCP.md 7.1 "Site identity" and 4.5. Manual pairings come from
 * the portfolio store (lib/sites/pairingStore.ts), the same ones the app shows.
 */
import { fetchInventory, type Inventory } from '@/lib/sites/fetchInventory';
import { normalizeHost, pairSites, type PairingOverrides } from '@/lib/sites/pairing';
import { loadPairingOverrides } from '@/lib/sites/pairingStore';
import type { McpPrincipal } from './auth';
import { ToolError } from './errors';
import type { GoogleClient } from './google';

export interface SiteRecord {
    site_id: string;
    host: string;
    ga4?: { property: string; displayName: string; streamUris: string[] };
    gsc?: { siteUrl: string; permissionLevel?: string };
    paired_by: 'auto' | 'manual' | '-';
}

export interface SiteCatalog {
    /** Sites this connection may read (grant filter applied). */
    sites: SiteRecord[];
    /** Count before the grant filter, for envelopes. */
    totalBeforeFilter: number;
    filtered: boolean;
    errors: Inventory['errors'];
}

function kindRank(r: Omit<SiteRecord, 'site_id'>): number {
    if (r.ga4 && r.gsc) return 0;
    if (r.gsc?.siteUrl.startsWith('sc-domain:')) return 1;
    if (r.gsc?.siteUrl.startsWith('https://')) return 2;
    if (r.gsc) return 3;
    return 4;
}

/** Deterministic site ids: the bare host, then host~2, host~3 for further entries on the same host. */
export function buildSiteRecords(inv: Pick<Inventory, 'properties' | 'sites'>, overrides: PairingOverrides = {}): SiteRecord[] {
    const pairs = pairSites(inv.properties, inv.sites, overrides);
    const base = pairs.map((p) => ({
        host: p.host || normalizeHost(p.ga4?.displayName ?? 'site'),
        ga4: p.ga4 ? { property: p.ga4.property, displayName: p.ga4.displayName, streamUris: p.ga4.streamUris } : undefined,
        gsc: p.gsc ? { siteUrl: p.gsc.siteUrl, permissionLevel: p.gsc.permissionLevel } : undefined,
        paired_by: (p.ga4 && p.gsc ? (p.ga4.property in overrides ? 'manual' : 'auto') : '-') as SiteRecord['paired_by'],
    }));
    base.sort((a, b) => a.host.localeCompare(b.host) || kindRank(a) - kindRank(b)
        || (a.gsc?.siteUrl ?? a.ga4?.property ?? '').localeCompare(b.gsc?.siteUrl ?? b.ga4?.property ?? ''));
    const seen = new Map<string, number>();
    return base.map((r) => {
        const n = (seen.get(r.host) ?? 0) + 1;
        seen.set(r.host, n);
        return { site_id: n === 1 ? r.host : `${r.host}~${n}`, ...r };
    });
}

export async function loadCatalog(p: McpPrincipal, google: GoogleClient, opts: { refresh?: boolean } = {}): Promise<SiteCatalog> {
    const inv = await fetchInventory(google.demo ? '' : google.token, {
        demo: google.demo,
        cacheKey: google.demo ? 'mcp-demo' : `u${p.userId}`,
        refresh: opts.refresh,
    });
    if (inv.errors.ga4?.status === 401 || inv.errors.gsc?.status === 401) {
        throw new ToolError('google_reauth_required', 'The Google connection expired or was revoked', 'Ask the user to open TrafficClaw > Connect AI and press "Re-connect Google".');
    }
    const all = buildSiteRecords(inv, p.demo ? {} : await loadPairingOverrides(p.userIdentifier));
    const filter = p.siteFilter;
    const sites = filter ? all.filter((s) => filter.includes(s.site_id)) : all;
    return { sites, totalBeforeFilter: all.length, filtered: Boolean(filter), errors: inv.errors };
}

function editDistance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 8) return 99;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return dp[b.length];
}

export function suggestions(input: string, candidates: string[], max = 5): string[] {
    const q = input.toLowerCase();
    return candidates
        .map((c) => ({ c, score: c.toLowerCase().includes(q) || q.includes(c.toLowerCase()) ? 0 : editDistance(q, c.toLowerCase()) }))
        .filter((x) => x.score <= 4)
        .sort((a, b) => a.score - b.score)
        .slice(0, max)
        .map((x) => x.c);
}

/** Resolve a site argument against the visible catalogue. */
export function resolveSite(catalog: SiteCatalog, rawInput: string): SiteRecord {
    const input = (rawInput || '').trim();
    if (!input) throw new ToolError('invalid_argument', 'site is required. Call list_sites to see site ids.');
    const sites = catalog.sites;
    const notFound = () => {
        if (catalog.filtered) return new ToolError('site_not_in_grant', `"${input.slice(0, 80)}" is not one of the sites shared with this connection`, 'Call list_sites for the sites this connection can read. The user can change the shared sites in TrafficClaw > Connect AI.');
        const s = suggestions(input, sites.map((x) => x.site_id));
        return new ToolError('site_not_found', `No site matches "${input.slice(0, 80)}"${s.length ? `. Did you mean: ${s.join(', ')}` : ''}`, 'Call list_sites to see site ids.');
    };

    const exact = sites.find((s) => s.site_id === input || s.site_id === input.toLowerCase());
    if (exact) return exact;

    const gscExact = sites.filter((s) => s.gsc && (s.gsc.siteUrl === input || s.gsc.siteUrl === `${input}/` || s.gsc.siteUrl.toLowerCase() === input.toLowerCase()));
    if (gscExact.length === 1) return gscExact[0];

    const propMatch = /^(?:properties\/)?(\d{4,15})$/.exec(input);
    if (propMatch) {
        const byProp = sites.filter((s) => s.ga4?.property === `properties/${propMatch[1]}`);
        if (byProp.length >= 1) return byProp[0];
        throw notFound();
    }

    if (input.startsWith('sc-domain:') || /^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(input)) {
        const host = normalizeHost(input);
        const byHost = sites.filter((s) => s.host === host);
        if (byHost.length >= 1) return byHost.find((s) => s.site_id === host) ?? byHost[0];
        throw notFound();
    }

    const byName = sites.filter((s) => s.ga4?.displayName.toLowerCase() === input.toLowerCase());
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
        throw new ToolError('invalid_argument', `"${input.slice(0, 80)}" matches several sites: ${byName.map((s) => s.site_id).slice(0, 5).join(', ')}. Pass a site_id.`);
    }
    throw notFound();
}

export function requireGa4(site: SiteRecord): { property: string; displayName: string } {
    if (!site.ga4) throw new ToolError('ga4_not_connected', `${site.site_id} has no Google Analytics 4 property paired`, 'Use the Search Console tools for this site, or check list_sites.');
    return site.ga4;
}

export function requireGsc(site: SiteRecord): { siteUrl: string; permissionLevel?: string } {
    if (!site.gsc) throw new ToolError('gsc_not_connected', `${site.site_id} has no Search Console site paired`, 'Use the GA4 tools for this site, or check list_sites.');
    return site.gsc;
}

/** Brand tokens from the host: "acme-analytics.example" -> ["acme", "analytics", "acmeanalytics"]. */
export function brandTokens(host: string): string[] {
    const label = host.split('.')[0] || host;
    const parts = label.split(/[-_]/).filter((t) => t.length >= 3);
    return Array.from(new Set([label.replace(/[-_]/g, ''), ...parts])).filter((t) => t.length >= 3);
}
