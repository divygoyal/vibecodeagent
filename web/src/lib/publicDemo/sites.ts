/**
 * The sample sites of the demo user (lib/demo catalogue, main account) and their app routes.
 * Server-side helper for /demo/<slug>; the home page reads hosts from lib/demo/catalog.ts too.
 */
import { getDemoAccount, getDemoSites, type DemoSite } from '@/lib/demo/catalog';
import { normalizeHost } from '@/lib/sites/pairing';
import { DEMO_ACCOUNT_KEY } from './config';

/** The demo user's sites (11). */
export function demoUserSites(): DemoSite[] {
    const account = getDemoAccount(DEMO_ACCOUNT_KEY);
    const keys = new Set([...account.gaAccounts.flatMap((a) => a.siteKeys), ...account.gscSiteKeys]);
    return getDemoSites().filter((s) => keys.has(s.key));
}

/** A site's app route key: its host, or ga4-<id> for a site with only a GA4 property (as the app builds it). */
export function demoSiteRouteKey(site: DemoSite): string {
    if (site.gsc) return normalizeHost(site.gsc.siteUrl);
    return `ga4-${(site.ga?.propertyId ?? '').replace(/\D/g, '')}`;
}

/** /demo/<slug> -> the app page of that sample site (slug = catalogue key or host), else the portfolio. */
export function demoSlugTarget(slug: string | null | undefined): string {
    const s = (slug || '').trim().toLowerCase();
    if (!s) return '/dashboard';
    const site = demoUserSites().find((x) => x.key === s || x.host === s || demoSiteRouteKey(x) === s.replace(/^www\./, ''));
    return site ? `/dashboard/s/${encodeURIComponent(demoSiteRouteKey(site))}` : '/dashboard';
}
