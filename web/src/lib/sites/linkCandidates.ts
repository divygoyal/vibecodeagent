/**
 * Suggestions for the site pages' "Link a Search Console site" / "Link a GA4
 * property" pickers: everything the user can see, best match first. Pure, safe
 * for the client.
 */
import { normalizeHost, siteCoversHost, siteKind } from './pairing';
import type { DirectoryProperty, DirectorySite } from './directoryTypes';

/** 'Acme Analytics – Web' -> 'acmeanalyticsweb'; 'acme-analytics.example' -> first label 'acmeanalytics'. */
function compact(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function firstLabel(host: string): string {
    return compact(normalizeHost(host).split('.')[0] ?? '');
}

/** 0 = same name, 1 = one contains the other, Infinity = unrelated. */
function nameScore(name: string | null | undefined, host: string): number {
    const n = compact(name ?? '');
    const h = firstLabel(host);
    if (!n || !h || h.length < 3) return Infinity;
    if (n === h) return 0;
    if (n.includes(h) || h.includes(n)) return 1;
    return Infinity;
}

const UNVERIFIED = 'siteUnverifiedUser';
/** Scores under this are real matches (worth preselecting), not just the A-Z rest. */
export const GOOD_MATCH = 1000;

/**
 * How well a Search Console site fits a GA4 property (its stream host when known, else its name).
 * Lower is better: covers the host (exact host, then https prefix before domain before http), then
 * a name match, then the rest; sites the user is not verified for come last (they cannot be read).
 */
export function scoreSearchConsoleSite(s: DirectorySite, target: { host?: string | null; name?: string | null }): number {
    let v = GOOD_MATCH;
    const siteHost = normalizeHost(s.siteUrl);
    if (target.host && siteCoversHost(s.siteUrl, target.host)) {
        const exact = siteHost === normalizeHost(target.host);
        const kind = siteKind(s.siteUrl) === 'domain' ? 1 : s.siteUrl.startsWith('http://') ? 2 : 0;
        v = (exact ? 0 : 10) + kind;
    } else {
        const byName = Math.min(nameScore(target.name, siteHost), target.host ? nameScore(firstLabel(target.host), siteHost) : Infinity);
        if (byName !== Infinity) v = 100 + byName;
    }
    return s.permissionLevel === UNVERIFIED ? v + 10 * GOOD_MATCH : v;
}

/** How well a GA4 property fits a Search Console site: its stream host covered by the site, then a name match. */
export function scoreGa4Property(p: DirectoryProperty, siteUrl: string): number {
    const host = normalizeHost(siteUrl);
    if (p.host && siteCoversHost(siteUrl, p.host)) return normalizeHost(p.host) === host ? 0 : 1;
    const byName = Math.min(nameScore(p.displayName, host), p.host ? nameScore(firstLabel(p.host), host) : Infinity);
    return byName === Infinity ? GOOD_MATCH : 100 + byName;
}

/** Every Search Console site, best match for the GA4 property first, then A-Z. */
export function rankSearchConsoleSites(sites: DirectorySite[], target: { host?: string | null; name?: string | null }): DirectorySite[] {
    return [...sites].map((s) => ({ s, v: scoreSearchConsoleSite(s, target) }))
        .sort((a, b) => a.v - b.v || a.s.siteUrl.localeCompare(b.s.siteUrl))
        .map((x) => x.s);
}

/** Every GA4 property, best match for the Search Console site first, then A-Z. */
export function rankGa4Properties(properties: DirectoryProperty[], siteUrl: string): DirectoryProperty[] {
    return [...properties].map((p) => ({ p, v: scoreGa4Property(p, siteUrl) }))
        .sort((a, b) => a.v - b.v || a.p.displayName.localeCompare(b.p.displayName))
        .map((x) => x.p);
}
