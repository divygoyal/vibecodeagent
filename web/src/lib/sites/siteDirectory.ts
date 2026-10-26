/**
 * The app's list of "sites" (DESIGN 4.2) built from the existing inventory
 * endpoints: Search Console sites (/api/seo?mode=list) and GA4 properties
 * (/api/analytics?mode=list). Pure, so the shell, the site switcher and the
 * /dashboard/s/[host] routes agree on hosts.
 *
 * A site = one hostname with at most one Search Console property (domain
 * preferred, then https, then http) and at most one GA4 property.
 *
 * GA4 pairing here is a name heuristic because the list endpoint has no web
 * stream URIs: a property pairs with the site whose host label appears in its
 * display name ("Acme Analytics – Web" -> acmeanalytics.example). The
 * workspace's saved pair always wins. Replace with lib/sites/pairing.ts
 * pairSites() fed by stream URIs once /api/portfolio exposes them.
 *
 * Route keys ([host] in /dashboard/s/[host]):
 *  - lowercase host without www ('acme.com');
 *  - a second property on the same host gets '--2', a third '--3';
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
    /** The workspace's saved pair: always paired together. */
    savedPair?: { siteUrl?: string | null; propertyId?: string | null };
}

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

function rank(siteUrl: string): number {
    if (siteKind(siteUrl) === 'domain') return 0;
    if (siteUrl.startsWith('https://')) return siteUrl.includes('://www.') ? 2 : 1;
    return 3;
}

export function buildSiteDirectory({ sites, properties, savedPair }: DirectoryInput): SiteEntry[] {
    const sorted = [...sites]
        .filter((s) => typeof s?.siteUrl === 'string' && s.siteUrl)
        .sort((a, b) => rank(a.siteUrl) - rank(b.siteUrl) || a.siteUrl.localeCompare(b.siteUrl));

    const used = new Map<string, number>();
    const entries: SiteEntry[] = [];
    for (const s of sorted) {
        const host = normalizeHost(s.siteUrl);
        if (!host) continue;
        const n = (used.get(host) ?? 0) + 1;
        used.set(host, n);
        entries.push({
            host: n === 1 ? host : `${host}--${n}`,
            // A second property on the same host is labelled by its own URL ("http://acme.com").
            label: n === 1 ? host : s.siteUrl.replace(/\/$/, ''),
            gscSiteUrl: s.siteUrl,
            gscKind: siteKind(s.siteUrl),
            ga4PropertyId: null,
            ga4Name: null,
        });
    }

    const props = properties
        .map((p) => ({ id: propId(p), name: p.displayName || '' }))
        .filter((p): p is { id: string; name: string } => Boolean(p.id));
    const paired = new Set<string>();

    // 1. The saved workspace pair.
    if (savedPair?.siteUrl && savedPair.propertyId) {
        const e = entries.find((x) => x.gscSiteUrl === savedPair.siteUrl);
        const p = props.find((x) => x.id === savedPair.propertyId || x.id === `properties/${savedPair.propertyId}`);
        if (e && p) {
            e.ga4PropertyId = p.id;
            e.ga4Name = p.name;
            paired.add(p.id);
        }
    }

    // 2. Name heuristic: best (longest) host label contained in the display name.
    for (const p of props) {
        if (paired.has(p.id)) continue;
        const name = compact(p.name);
        if (!name) continue;
        let best: SiteEntry | null = null;
        let bestLen = 0;
        for (const e of entries) {
            if (e.ga4PropertyId || e.host.includes('--')) continue;
            const label = hostLabel(e.host);
            if (label.length >= 3 && name.includes(label) && label.length > bestLen) {
                best = e;
                bestLen = label.length;
            }
        }
        if (best) {
            best.ga4PropertyId = p.id;
            best.ga4Name = p.name;
            paired.add(p.id);
        }
    }

    // 3. GA4-only properties.
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
