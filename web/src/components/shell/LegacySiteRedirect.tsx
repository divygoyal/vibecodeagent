'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { PageSkeleton } from './PageSkeleton';
import { siteHref, type SiteSection } from './nav';
import { useCurrentSite } from './useCurrentSite';

/**
 * Old single-site URLs (/dashboard/analytics/*, /dashboard/seo, /dashboard/audit)
 * moved to /dashboard/s/<host>/…. The middleware redirects when the tc_site
 * cookie names the site; this is the fallback without the cookie: wait for the
 * saved selection, then replace the URL (keeping the query). No saved site ->
 * Portfolio.
 */
export function LegacySiteRedirect({ section, tabFromPath }: { section: SiteSection; tabFromPath?: (pathname: string) => { section?: SiteSection; tab?: string } }) {
    const router = useRouter();
    const pathname = usePathname() ?? '';
    const params = useSearchParams();
    const { site, loading } = useCurrentSite();

    useEffect(() => {
        if (loading) return;
        if (!site) {
            router.replace('/dashboard');
            return;
        }
        const extra = tabFromPath?.(pathname) ?? {};
        const q = new URLSearchParams(params?.toString() ?? '');
        if (extra.tab) q.set('tab', extra.tab);
        const qs = q.toString();
        router.replace(`${siteHref(site.host, extra.section ?? section)}${qs ? `?${qs}` : ''}`);
    }, [loading, site, router, pathname, params, section, tabFromPath]);

    return <PageSkeleton />;
}
