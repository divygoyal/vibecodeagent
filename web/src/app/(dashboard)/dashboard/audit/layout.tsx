'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { siteHref } from '@/components/shell/nav';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { useCurrentSite } from '@/components/shell/useCurrentSite';

/**
 * /dashboard/audit moved to /dashboard/s/<host>/actions/audit (keeps ?url=).
 * Waits for the user's own saved site; no site -> Portfolio. Never shows a demo site.
 */
export default function AuditLegacyLayout() {
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
        const qs = params?.toString() ?? '';
        router.replace(`${siteHref(site.host, 'actions')}/audit${qs ? `?${qs}` : ''}`);
    }, [loading, site, router, pathname, params]);
    return <PageSkeleton />;
}
