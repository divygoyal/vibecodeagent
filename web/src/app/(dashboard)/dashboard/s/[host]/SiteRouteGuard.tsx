'use client';

import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { signIn } from 'next-auth/react';

import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/shell/PageSkeleton';
import { useShell } from '@/components/shell/ShellContext';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { useWorkspace } from '@/components/shell/workspaceContext';

/** Sign in with Google again: the same consent parameters as every other "Connect Google" button. */
function reconnectGoogle() {
    const callbackUrl = window.location.pathname + window.location.search;
    void signIn('google', { callbackUrl }, { prompt: 'select_account consent' });
}

/**
 * Makes the site in the URL the current site (saves the GA4 + Search Console
 * pair to the workspace, so old pages and other tabs follow) and shows a
 * "site not found" state for hosts the user cannot access (DESIGN 4.2).
 * Children render once the selection matches the URL, without waiting for the live Google inventory when the
 * portfolio store already knows the host.
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

    // A site found in the directory is enough to start: the fast directory (the portfolio store) answers in
    // milliseconds, while the live Google inventory can take seconds. Only a host nobody knows yet has to wait
    // for the live answer before "We couldn't find ..." is allowed.
    if ((loading && !site) || (site && !matches)) return <PageSkeleton />;
    if (unknownHost || !site) {
        // Google refused our token: the list of sites is empty because we cannot read it, not because the host is
        // wrong. Never call that "not found".
        if (ws.googleReauth) {
            return (
                <Card padding="none">
                    <EmptyState
                        variant="page"
                        icon={RefreshCw}
                        title="Reconnect Google to see this site"
                        description={`Your Google access expired or was revoked, so we can't check ${host ?? 'this site'} right now. Sign in with Google again and we will pick up where we left off.`}
                        actions={
                            <>
                                <Button variant="google" onClick={() => reconnectGoogle()}><GoogleMark />Reconnect Google</Button>
                                <Button asChild variant="secondary"><Link href="/dashboard">Go to portfolio</Link></Button>
                            </>
                        }
                    />
                </Card>
            );
        }
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
    if (ws.googleReauth) {
        // The site is known from the last sync, but live Google data will fail: say why above the page.
        return (
            <>
                <Banner
                    variant="danger"
                    title="Google access expired"
                    actions={<Button variant="google" size="sm" onClick={() => reconnectGoogle()}><GoogleMark />Reconnect Google</Button>}
                    className="mb-4"
                >
                    Reconnect Google to load fresh numbers for {site.host}.
                </Banner>
                {children}
            </>
        );
    }
    return <>{children}</>;
}
