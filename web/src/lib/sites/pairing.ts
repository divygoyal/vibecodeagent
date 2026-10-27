/**
 * Pair GA4 properties with Search Console sites by hostname.
 *
 * Pure and dependency-free: the portfolio, the MCP tools and the leaderboard
 * all call this, so callers fetch the inputs (GA4 web-stream URIs, GSC site
 * list) and pass them in.
 *
 * Rules:
 *  - Hosts compare with a leading "www." removed and lower-cased.
 *  - A URL-prefix site ("https://www.example.com/") pairs with a property whose
 *    web stream host equals its host.
 *  - A domain site ("sc-domain:example.com") pairs with any stream whose host is
 *    example.com or a subdomain of it. An exact host match wins over a
 *    subdomain match, and URL-prefix sites win over domain sites.
 *  - Each property pairs with at most one site and vice versa. Leftovers are
 *    returned unpaired.
 *  - Manual overrides (propertyId -> siteUrl, or null to force unpaired) win.
 */

export interface Ga4PropertyInput {
    /** "properties/123" */
    property: string;
    displayName: string;
    /** defaultUri of each WEB data stream, e.g. "https://www.example.com" */
    streamUris: string[];
}

export interface GscSiteInput {
    /** "https://www.example.com/" or "sc-domain:example.com" */
    siteUrl: string;
    permissionLevel?: string;
}

export interface SitePair {
    /** Stable key for UI lists and caches. */
    key: string;
    host: string;
    ga4?: Ga4PropertyInput;
    gsc?: GscSiteInput;
}

export type PairingOverrides = Record<string, string | null>;

export function normalizeHost(input: string): string {
    let raw = input.trim().toLowerCase();
    if (raw.startsWith('sc-domain:')) raw = raw.slice('sc-domain:'.length);
    raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    raw = raw.split('/')[0].split('?')[0].split('#')[0];
    raw = raw.replace(/:\d+$/, '').replace(/\.$/, '');
    return raw.startsWith('www.') ? raw.slice(4) : raw;
}

export function siteKind(siteUrl: string): 'domain' | 'prefix' {
    return siteUrl.startsWith('sc-domain:') ? 'domain' : 'prefix';
}

/** True when the GSC site covers the host (exact for prefix, subdomains for domain). */
export function siteCoversHost(siteUrl: string, host: string): boolean {
    const siteHost = normalizeHost(siteUrl);
    const h = normalizeHost(host);
    if (!siteHost || !h) return false;
    if (siteKind(siteUrl) === 'prefix') return siteHost === h;
    return h === siteHost || h.endsWith(`.${siteHost}`);
}

/** Lower is better. Infinity means no match. */
function matchScore(site: GscSiteInput, prop: Ga4PropertyInput): number {
    const siteHost = normalizeHost(site.siteUrl);
    let best = Infinity;
    for (const uri of prop.streamUris) {
        const host = normalizeHost(uri);
        if (!siteCoversHost(site.siteUrl, host)) continue;
        const exact = host === siteHost;
        const kind = siteKind(site.siteUrl);
        const score = (exact ? 0 : 2) + (kind === 'prefix' ? 0 : 1);
        best = Math.min(best, score);
    }
    return best;
}

export function pairSites(
    properties: Ga4PropertyInput[],
    sites: GscSiteInput[],
    overrides: PairingOverrides = {},
): SitePair[] {
    const pairs: SitePair[] = [];
    const usedProps = new Set<string>();
    const usedSites = new Set<string>();
    const siteByUrl = new Map(sites.map((s) => [s.siteUrl, s]));

    for (const prop of properties) {
        if (!(prop.property in overrides)) continue;
        usedProps.add(prop.property);
        const target = overrides[prop.property];
        const site = target ? siteByUrl.get(target) : undefined;
        if (site && !usedSites.has(site.siteUrl)) {
            usedSites.add(site.siteUrl);
            pairs.push(makePair(prop, site));
        } else {
            pairs.push(makePair(prop, undefined));
        }
    }

    const candidates: { score: number; prop: Ga4PropertyInput; site: GscSiteInput }[] = [];
    for (const prop of properties) {
        if (usedProps.has(prop.property)) continue;
        for (const site of sites) {
            if (usedSites.has(site.siteUrl)) continue;
            const score = matchScore(site, prop);
            if (Number.isFinite(score)) candidates.push({ score, prop, site });
        }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const c of candidates) {
        if (usedProps.has(c.prop.property) || usedSites.has(c.site.siteUrl)) continue;
        usedProps.add(c.prop.property);
        usedSites.add(c.site.siteUrl);
        pairs.push(makePair(c.prop, c.site));
    }

    for (const prop of properties) {
        if (!usedProps.has(prop.property)) pairs.push(makePair(prop, undefined));
    }
    for (const site of sites) {
        if (!usedSites.has(site.siteUrl)) pairs.push(makePair(undefined, site));
    }
    return pairs;
}

function makePair(ga4: Ga4PropertyInput | undefined, gsc: GscSiteInput | undefined): SitePair {
    const host = gsc
        ? normalizeHost(gsc.siteUrl)
        : normalizeHost(ga4?.streamUris[0] ?? ga4?.displayName ?? '');
    const key = gsc ? `gsc:${gsc.siteUrl}` : `ga4:${ga4?.property ?? host}`;
    return { key, host, ga4, gsc };
}
