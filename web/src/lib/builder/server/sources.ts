/**
 * Source resolution for the builder (BUILDER.md 6.1): every widget source becomes concrete
 * Google assets through the shared site inventory (lib/sites/fetchInventory + pairSites), the
 * same pairing the Portfolio and MCP use. Pins in a SiteRef win over the pairing. Access is
 * checked against the user's own lists (inventory cached 10 minutes).
 *
 * TODO(portfolio): read pairing overrides and stars from the Portfolio snapshot store
 * (tc/portfolio, admin /api/portfolio/users/{id}/assets) once it is merged.
 */
import { loadUserInventory } from '@/lib/googleAccounts';
import type { Inventory } from '@/lib/sites/fetchInventory';
import { normalizeHost, pairSites, type SitePair } from '@/lib/sites/pairing';
import type { SiteRef, SourceRef } from '../types';

export interface ResolvedSite {
    siteId: string;
    label: string;
    ga4?: string;
    gsc?: string;
    ga4Name?: string;
    /** A pinned asset the user can no longer read. */
    ga4Denied?: boolean;
    gscDenied?: boolean;
}

export interface SiteDirectory {
    sites: ResolvedSite[];
    byId: Map<string, ResolvedSite>;
    ga4Set: Set<string>;
    gscSet: Set<string>;
    errors: Inventory['errors'];
}

const isHostname = (h: string | undefined): h is string => Boolean(h && /^[a-z0-9.-]+$/.test(h) && h.includes('.'));

function siteIdFor(pair: SitePair): string {
    const host = pair.host;
    if (isHostname(host)) return host;
    const digits = pair.ga4?.property.replace(/\D/g, '');
    return digits ? `ga4-${digits}` : `site-${pair.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

/** What tells a second Search Console property for the same host apart, without its URL. */
function variantOf(siteUrl: string | undefined): string | null {
    if (!siteUrl) return 'Analytics';
    if (siteUrl.startsWith('sc-domain:')) return 'domain';
    if (/^http:\/\//i.test(siteUrl)) return 'http';
    if (/^https?:\/\/www\./i.test(siteUrl)) return 'www';
    return null;
}

/**
 * Deterministic site ids: the host, '--2', '--3' for collisions (DESIGN.md 4.2).
 *
 * One naming rule (round 5, audit #14): a site is named by its host, also when it has only a GA4
 * property (its web stream host); the GA4 display name is kept apart (`ga4Name`) for a subtitle. A
 * second property on the same host says which one it is ("acme.com (http)").
 */
export function buildDirectory(inv: Inventory): SiteDirectory {
    const pairs = pairSites(inv.properties, inv.sites);
    const rank = (p: SitePair) => (p.ga4 && p.gsc ? 0 : p.gsc ? 1 : 2);
    pairs.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
    const used = new Map<string, number>();
    const sites: ResolvedSite[] = [];
    for (const p of pairs) {
        let id = siteIdFor(p);
        const n = (used.get(id) ?? 0) + 1;
        used.set(id, n);
        if (n > 1) id = `${id}--${n}`;
        // Two Search Console properties for one host (http vs https, www): name the variant. The
        // label never contains the property URL (labels reach public viewers).
        const host = p.gsc ? normalizeHost(p.gsc.siteUrl) : isHostname(p.host) ? p.host : undefined;
        const base = host ?? p.ga4?.displayName ?? id;
        sites.push({
            siteId: id,
            label: n > 1 ? `${base} (${variantOf(p.gsc?.siteUrl) ?? n})` : base,
            ga4: p.ga4?.property,
            gsc: p.gsc?.siteUrl,
            ga4Name: p.ga4?.displayName,
        });
    }
    return {
        sites,
        byId: new Map(sites.map((s) => [s.siteId, s])),
        ga4Set: new Set(inv.properties.map((p) => p.property)),
        gscSet: new Set(inv.sites.map((s) => s.siteUrl)),
        errors: inv.errors,
    };
}

export async function loadSiteDirectory(userId: string, accessToken: string): Promise<SiteDirectory> {
    // Every Google connection of the owner (sign-in account + linked accounts), each asset once.
    const inv = await loadUserInventory(userId, { primary: { ok: true, token: accessToken }, cacheKey: `builder:${userId}` });
    return buildDirectory(inv);
}

function normaliseProperty(id?: string): string | undefined {
    if (!id) return undefined;
    if (id.startsWith('properties/')) return id;
    const d = id.replace(/\D/g, '');
    return d ? `properties/${d}` : undefined;
}

/** A SiteRef -> assets, or null when the site is unknown and nothing is pinned. */
export function resolveSiteRef(ref: SiteRef, dir: SiteDirectory): ResolvedSite | null {
    const known = dir.byId.get(ref.siteId);
    const pinGa4 = normaliseProperty(ref.ga4);
    const pinGsc = ref.gsc || undefined;
    if (!known && !pinGa4 && !pinGsc) return null;
    const out: ResolvedSite = {
        siteId: ref.siteId,
        label: known?.label ?? (pinGsc ? normalizeHost(pinGsc) : ref.siteId),
        ga4Name: known?.ga4Name,
        ga4: pinGa4 ?? known?.ga4,
        gsc: pinGsc ?? known?.gsc,
    };
    // A pinned asset must still be in the user's lists (unless that list failed to load).
    if (pinGa4 && !dir.errors.ga4 && !dir.ga4Set.has(pinGa4)) {
        out.ga4 = undefined;
        out.ga4Denied = true;
    }
    if (pinGsc && !dir.errors.gsc && !dir.gscSet.has(pinGsc)) {
        out.gsc = undefined;
        out.gscDenied = true;
    }
    return out;
}

/** Sites a portfolio source covers (all accessible sites minus exclusions). */
export function resolvePortfolio(src: Extract<SourceRef, { type: 'portfolio' }>, dir: SiteDirectory): ResolvedSite[] {
    let list = dir.sites;
    if (Array.isArray(src.include)) {
        const want = new Set(src.include);
        list = list.filter((s) => want.has(s.siteId));
    }
    // TODO(portfolio): 'starred' needs the snapshot store's stars; until then it means all sites.
    if (src.exclude?.length) {
        const ex = new Set(src.exclude);
        list = list.filter((s) => !ex.has(s.siteId));
    }
    return list;
}

/** Name for a source, as shown on cards and in public views. */
export function sourceLabel(src: SourceRef, dir: SiteDirectory | null, defaultLabel?: string): string {
    if (src.type === 'portfolio') {
        if (Array.isArray(src.include)) return src.include.length === 1 ? src.include[0] : `${src.include.length} sites`;
        return 'All sites';
    }
    if (src.type === 'default') return defaultLabel ?? 'Default site';
    const known = dir?.byId.get(src.siteId);
    if (known) return known.label;
    if (src.gsc) return normalizeHost(src.gsc);
    // Never show property digits (siteId 'ga4-123') as a name.
    return src.siteId.startsWith('ga4-') ? 'Analytics property' : src.siteId;
}

/**
 * The GA4 property name as a subtitle under a site's host, unless it only repeats the host
 * ("Puzzle Hub" for puzzlehub.example, "Acme.com" for acme.com): "Search Metrics – Marketing site".
 */
export function siteSubLabel(site: Pick<ResolvedSite, 'label' | 'ga4Name'>): string | undefined {
    const name = site.ga4Name?.trim();
    if (!name) return undefined;
    const flat = (v: string) => v.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
    const host = site.label.replace(/ \(.*\)$/, '');
    const n = flat(name);
    return n === flat(host) || n === flat(host.replace(/\.[a-z0-9-]+$/i, '')) ? undefined : name;
}
