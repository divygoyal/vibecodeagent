/**
 * The app's list of "sites" (DESIGN 4.2) built from the existing inventory
 * endpoints: Search Console sites (/api/seo?mode=list) and GA4 properties
 * (/api/analytics?mode=list). Pure, so the shell, the site switcher and the
 * /dashboard/s/[host] routes agree on hosts.
 *
 * A site = one hostname with at most one Search Console property (domain
 * preferred, then https, then http) and at most one GA4 property.
 *
 * GA4 pairing comes from the portfolio store (`pairs`, from
 * /api/portfolio/pairs): the stream-URI host match plus the user's manual
 * overrides, exactly what the portfolio cards and the MCP tools use. A
 * property the store has not seen yet (before the first portfolio sync)
 * falls back to a name heuristic: it pairs with the site whose host label
 * appears in its display name ("Acme Analytics – Web" -> acmeanalytics.example).
 * The saved workspace selection never decides a pairing: it can be stale
 * (a site from one pick, a property from another).
 *
 * Route keys ([host] in /dashboard/s/[host]):
 *  - lowercase host without www ('acme.com');
 *  - a second property on the same host gets '--2', a third '--3' (paired
 *    first, then domain, then https: the portfolio's card slugs use the same order);
 *  - a GA4 property with no Search Console site gets 'ga4-<number>'.
 */
import { normalizeHost, siteKind } from './pairing';

export interface SiteEntry {
    /** Route key, see above. */
    host: string;
    /** What to show: the host, or the GA4 display name for GA4-only sites. */
    label: string;
    gscSiteUrl: string | null;
    gscKind: 'domain' | 'prefix' | null;
    /** 'properties/123' */
    ga4PropertyId: string | null;
    ga4Name: string | null;
}

export interface DirectoryInput {
    sites: { siteUrl: string }[];
    properties: { property?: string; propertyId?: string; displayName?: string }[];
    /**
     * Stored pairing (GA4 property -> GSC site URL, or null for GA4-only) from
     * the portfolio store. Properties listed here never use the heuristic.
     */
    pairs?: Record<string, string | null>;
}

/** SWR key of the stored pairing endpoint (revalidate it after a pairing change). */
export const PAIRS_KEY = '/api/portfolio/pairs';

const HOST_KEY_RE = /^[a-z0-9.-]+(--\d+)?$|^ga4-\d+$/;

/** True when a string is a valid route key (used to validate cookies and URLs). */
export function isSiteRouteKey(v: string | null | undefined): v is string {
    return typeof v === 'string' && v.length > 0 && v.length <= 260 && HOST_KEY_RE.test(v);
}

function propId(p: DirectoryInput['properties'][number]): string | null {
    const raw = p.property || p.propertyId || '';
    if (!raw) return null;
    return raw.startsWith('properties/') ? raw : /^\d+$/.test(raw) ? `properties/${raw}` : raw;
}

function compact(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 'docs.acmeanalytics.example' -> 'docsacmeanalytics' (host minus the TLD). */
function hostLabel(host: string): string {
    const parts = host.split('.');
    return compact(parts.length > 1 ? parts.slice(0, -1).join('.') : host);
}

/** Search Console property order inside one host (same as the portfolio's slugs, lib/portfolio/build.ts). */
function kindRank(siteUrl: string, paired: boolean): number {
    if (paired) return 0;
    if (siteKind(siteUrl) === 'domain') return 1;
    if (siteUrl.startsWith('https://')) return 2;
    return 4;
}

/** Preferred property for the name heuristic: domain, then https, then https://www., then http. */
function heuristicRank(siteUrl: string): number {
    if (siteKind(siteUrl) === 'domain') return 0;
    if (siteUrl.startsWith('https://')) return siteUrl.includes('://www.') ? 2 : 1;
    return 3;
}

export function buildSiteDirectory({ sites, properties, pairs }: DirectoryInput): SiteEntry[] {
    const seenUrls = new Set<string>();
    const gsc = sites
        .filter((s) => typeof s?.siteUrl === 'string' && s.siteUrl && !seenUrls.has(s.siteUrl) && seenUrls.add(s.siteUrl))
        .map((s) => ({ siteUrl: s.siteUrl, host: normalizeHost(s.siteUrl), ga4: null as { id: string; name: string } | null }))
        .filter((x) => x.host);

    const props = properties
        .map((p) => ({ id: propId(p), name: p.displayName || '' }))
        .filter((p): p is { id: string; name: string } => Boolean(p.id));
    const paired = new Set<string>();

    // 1. The stored pairing (portfolio store). A property stored as GA4-only stays GA4-only.
    const decided = new Set<string>();
    for (const p of props) {
        if (!pairs || !(p.id in pairs)) continue;
        decided.add(p.id);
        const siteUrl = pairs[p.id];
        if (!siteUrl) continue;
        const e = gsc.find((x) => x.siteUrl === siteUrl && !x.ga4);
        if (e) {
            e.ga4 = { id: p.id, name: p.name };
            paired.add(p.id);
        }
    }

    // 2. Name heuristic for properties the store has not seen yet: best (longest) host
    //    label contained in the display name, on the preferred property of each host,
    //    never on a site the store already paired.
    const storedSites = new Set(Object.values(pairs ?? {}).filter((v): v is string => Boolean(v)));
    const preferred = new Map<string, (typeof gsc)[number]>();
    for (const e of [...gsc].sort((a, b) => heuristicRank(a.siteUrl) - heuristicRank(b.siteUrl) || a.siteUrl.localeCompare(b.siteUrl))) {
        if (!preferred.has(e.host)) preferred.set(e.host, e);
    }
    for (const p of props) {
        if (paired.has(p.id) || decided.has(p.id)) continue;
        const name = compact(p.name);
        if (!name) continue;
        let best: (typeof gsc)[number] | null = null;
        let bestLen = 0;
        for (const e of preferred.values()) {
            if (e.ga4 || storedSites.has(e.siteUrl)) continue;
            const label = hostLabel(e.host);
            if (label.length >= 3 && name.includes(label) && label.length > bestLen) {
                best = e;
                bestLen = label.length;
            }
        }
        if (best) {
            best.ga4 = { id: p.id, name: p.name };
            paired.add(p.id);
        }
    }

    // 3. Route keys, exactly like the portfolio's card slugs: per host the paired
    //    property first, then domain, then https, then the rest ('--2', '--3' …).
    const entries: SiteEntry[] = [];
    const used = new Map<string, number>();
    const ordered = [...gsc].sort((a, b) => kindRank(a.siteUrl, Boolean(a.ga4)) - kindRank(b.siteUrl, Boolean(b.ga4))
        || `gsc:${a.siteUrl}`.localeCompare(`gsc:${b.siteUrl}`));
    for (const e of ordered) {
        const n = (used.get(e.host) ?? 0) + 1;
        used.set(e.host, n);
        entries.push({
            host: n === 1 ? e.host : `${e.host}--${n}`,
            // A second property on the same host is labelled by its own URL ("http://acme.com").
            label: n === 1 ? e.host : e.siteUrl.replace(/\/$/, ''),
            gscSiteUrl: e.siteUrl,
            gscKind: siteKind(e.siteUrl),
            ga4PropertyId: e.ga4?.id ?? null,
            ga4Name: e.ga4?.name ?? null,
        });
    }

    // 4. GA4-only properties: 'ga4-<number>' (the portfolio uses the same key).
    for (const p of props) {
        if (paired.has(p.id)) continue;
        const num = p.id.replace(/^properties\//, '');
        entries.push({
            host: /^\d+$/.test(num) ? `ga4-${num}` : `ga4-${compact(num)}`,
            label: p.name || p.id,
            gscSiteUrl: null,
            gscKind: null,
            ga4PropertyId: p.id,
            ga4Name: p.name || null,
        });
    }

    return entries.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) || a.host.localeCompare(b.host));
}

export function findSite(dir: SiteEntry[], host: string | null | undefined): SiteEntry | null {
    if (!host) return null;
    const h = host.toLowerCase();
    return dir.find((e) => e.host === h) ?? null;
}

/** The entry matching a saved workspace selection (site first, then property). */
export function siteForSelection(dir: SiteEntry[], siteUrl?: string | null, propertyId?: string | null): SiteEntry | null {
    if (siteUrl) {
        const e = dir.find((x) => x.gscSiteUrl === siteUrl);
        if (e) return e;
    }
    if (propertyId) {
        const e = dir.find((x) => x.ga4PropertyId === propertyId || x.ga4PropertyId === `properties/${propertyId}`);
        if (e) return e;
    }
    return null;
}
