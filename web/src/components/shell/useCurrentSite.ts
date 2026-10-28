'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { resolveSite, siteForSelection, type SiteEntry } from '@/lib/sites/siteDirectory';
import { parseSitePath, siteHref, type SiteSection } from './nav';
import { useWorkspace } from './workspaceContext';

export interface CurrentSite {
    /** The site of this page: from /dashboard/s/[host], else the saved selection. Null on "All sites". */
    site: SiteEntry | null;
    /** Route key of `site` (or the unknown host in the URL). */
    host: string | null;
    /** True on /dashboard/s/** routes. */
    fromRoute: boolean;
    /** The URL names a host the user has no access to. */
    unknownHost: boolean;
    /** The URL names the site by another name (a GA4 stream host, 'www.'): redirect to `site.host`. */
    aliasHost: boolean;
    /** Section of the current site page ('' = overview). */
    section: SiteSection | null;
    /** Every site (sorted by label). */
    sites: SiteEntry[];
    loading: boolean;
    /** Make a site current: saves the GA4 + GSC pair to the workspace. Navigates unless navigate is false. */
    selectSite: (entry: SiteEntry, opts?: { navigate?: boolean; section?: SiteSection }) => void;
}

/**
 * The current site and the site list. Use on any app page:
 *
 *   const { site } = useCurrentSite();
 *   site?.gscSiteUrl   // 'sc-domain:acme.com' | null
 *   site?.ga4PropertyId // 'properties/123' | null
 */
export function useCurrentSite(): CurrentSite {
    const pathname = usePathname() ?? '';
    const router = useRouter();
    const ws = useWorkspace();
    const parsed = parseSitePath(pathname);

    const routeHost = parsed?.host ?? null;
    const resolved = useMemo(() => (routeHost ? resolveSite(ws.siteDirectory, routeHost) : null), [routeHost, ws.siteDirectory]);
    const site = useMemo(() => {
        if (routeHost) return resolved?.site ?? null;
        return siteForSelection(ws.siteDirectory, ws.resolvedSiteUrl || ws.selectedSite, ws.resolvedPropertyId || ws.selectedProperty);
    }, [routeHost, resolved, ws.siteDirectory, ws.resolvedSiteUrl, ws.selectedSite, ws.resolvedPropertyId, ws.selectedProperty]);

    const { saveWorkspace } = ws;
    const selectSite = useCallback((entry: SiteEntry, opts: { navigate?: boolean; section?: SiteSection } = {}) => {
        void saveWorkspace({ site: entry.gscSiteUrl ?? null, property: entry.ga4PropertyId ?? null });
        if (opts.navigate === false) return;
        const section = opts.section ?? parsed?.section ?? '';
        router.push(siteHref(entry.host, section));
    }, [saveWorkspace, router, parsed?.section]);

    return {
        site,
        host: site?.host ?? parsed?.host ?? null,
        fromRoute: Boolean(parsed),
        unknownHost: Boolean(parsed) && !ws.siteDirectoryLoading && !site,
        aliasHost: Boolean(resolved?.alias),
        section: parsed?.section ?? null,
        sites: ws.siteDirectory,
        loading: ws.siteDirectoryLoading,
        selectSite,
    };
}
