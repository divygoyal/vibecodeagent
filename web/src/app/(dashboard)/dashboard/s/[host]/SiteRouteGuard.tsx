'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { Globe } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { useShell } from '@/components/shell/ShellContext';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { useWorkspace } from '@/components/shell/workspaceContext';

/**
 * Makes the site in the URL the current site (saves the GA4 + Search Console
 * pair to the workspace, so old pages and other tabs follow) and shows a
 * "site not found" state for hosts the user cannot access (DESIGN 4.2).
 * Children render once the selection matches the URL.
 */
export function SiteRouteGuard({ children }: { children: ReactNode }) {
    const { site, host, loading, unknownHost, selectSite } = useCurrentSite();
    const ws = useWorkspace();
    const { setSwitcherOpen } = useShell();
    const synced = useRef<string | null>(null);

    const wantSite = site?.gscSiteUrl ?? '';
    const wantProp = site?.ga4PropertyId ?? '';
    const matches = Boolean(site) && ws.selectedSite === wantSite && ws.selectedProperty === wantProp;

    useEffect(() => {
        if (!site || matches) return;
        const key = `${site.host}|${wantSite}|${wantProp}`;
        if (synced.current === key) return;
        synced.current = key;
        selectSite(site, { navigate: false });
    }, [site, matches, wantSite, wantProp, selectSite]);

    if (loading || (site && !matches)) return <PageSkeleton />;
    if (unknownHost || !site) {
        return (
            <Card padding="none">
                <EmptyState
                    variant="page"
                    icon={Globe}
                    title={`We couldn't find ${host ?? 'this site'}`}
                    description="It isn't in the Search Console or Analytics properties this Google account can see. Pick another site, or add it in Google first."
                    actions={
                        <>
                            <Button variant="primary" onClick={() => setSwitcherOpen(true)}>Pick a site</Button>
                            <Button asChild variant="secondary"><Link href="/dashboard">Go to portfolio</Link></Button>
                        </>
                    }
                />
            </Card>
        );
    }
    return <>{children}</>;
}
