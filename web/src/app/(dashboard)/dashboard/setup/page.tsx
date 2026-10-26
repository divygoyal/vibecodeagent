'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useSWRConfig } from 'swr';

import { Skeleton } from '@/components/ui/Skeleton';
import { useWorkspace } from '@/components/shell/workspaceContext';
import { DEMO_PROPERTY_ID, DEMO_SITE_URL } from '@/lib/demoWorkspace';
import type { SiteEntry } from '@/lib/sites/siteDirectory';
import { patchWorkspaceWithRetry } from '@/lib/workspaceClient';
import { ConnectStep } from './ConnectStep';
import { SitesStep } from './SitesStep';
import { Stepper } from './Stepper';

/**
 * /dashboard/setup (DESIGN 5.3): two steps, "Connect Google" and "Your sites".
 *
 * There is nothing to pick. Step 2 shows every Search Console site and Analytics
 * property the account can open and how they pair by address; "Go to portfolio"
 * finishes. When no site is saved yet, one is saved as the site the per-site pages
 * open first (the site switcher changes it any time).
 */
const STEPS = ['Connect Google', 'Your sites'];

// Same-origin guard for the returnTo URL the middleware bounces in: only paths in
// the dashboard are accepted, so nobody can send a user to another site after setup.
function safeReturnTo(raw: string | null): string {
    if (!raw) return '/dashboard';
    if (raw !== '/dashboard' && !raw.startsWith('/dashboard/') && !raw.startsWith('/dashboard?')) return '/dashboard';
    if (raw.startsWith('//') || raw.includes('\\') || /:\/\//.test(raw)) return '/dashboard';
    return raw;
}

/** The entry the per-site pages open first: one with both Search Console and Analytics, else the first with Search Console. */
function defaultSite(sites: SiteEntry[]): SiteEntry | null {
    return sites.find((s) => s.gscSiteUrl && s.ga4PropertyId) ?? sites.find((s) => s.gscSiteUrl) ?? sites[0] ?? null;
}

// The admin API has been seen to take 8 s or more under load: never leave a button spinning forever.
const withTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T | 'timeout'> =>
    Promise.race<T | 'timeout'>([p, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))]);

export default function SetupPage() {
    return (
        <Suspense fallback={<SetupSkeleton />}>
            <Setup />
        </Suspense>
    );
}

function Setup() {
    const searchParams = useSearchParams();
    const { update: updateSession } = useSession();
    const { mutate } = useSWRConfig();
    const {
        hasGoogleConnection, siteDirectory, siteDirectoryLoading, siteInventoryError, propertyInventoryError,
        selectedSite, selectedProperty, saveWorkspace,
    } = useWorkspace();

    const [saving, setSaving] = useState(false);
    const [demoLoading, setDemoLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stale = searchParams.get('reason') === 'stale';
    const returnTo = safeReturnTo(searchParams.get('returnTo'));
    const connected = hasGoogleConnection;
    const failed = Boolean(siteInventoryError && propertyInventoryError);

    // Mark setup done on the server AND refresh the JWT claim the middleware reads: without
    // the refresh it still sees `false` and bounces the user back here.
    const markSetupCompleted = useCallback(async () => {
        await patchWorkspaceWithRetry({ mark_setup_completed: true }).catch(() => null);
        try {
            await updateSession({ workspaceSetupCompleted: true });
        } catch {
            /* non-fatal: the claim refreshes on the next sign-in */
        }
    }, [updateSession]);

    const connect = useCallback(() => {
        void signIn('google', { callbackUrl: '/dashboard/setup' }, { prompt: 'select_account consent' });
    }, []);

    const recheck = useCallback(() => {
        void mutate('/api/analytics?mode=list');
        void mutate('/api/seo?mode=list');
    }, [mutate]);

    const finish = async () => {
        if (saving) return;
        setSaving(true);
        setError(null);
        // Give the site pages somewhere to open, only when no site has been saved yet.
        // A slow or failed save never blocks the user: the portfolio does not need it.
        if (!selectedSite && !selectedProperty) {
            const pick = defaultSite(siteDirectory);
            if (pick) {
                await withTimeout(saveWorkspace({ site: pick.gscSiteUrl, property: pick.ga4PropertyId, label: pick.label })).catch(() => null);
            }
        }
        // Not wrapped in a timeout: if the JWT refresh is cut off, the cookie is never re-issued
        // and the middleware bounces the next request back to setup.
        await markSetupCompleted();
        // Hard navigation so the refreshed JWT cookie ships with the request.
        window.location.href = returnTo;
    };

    const continueWithDemo = async () => {
        if (demoLoading) return;
        setDemoLoading(true);
        setError(null);
        const saved = await withTimeout(saveWorkspace({ property: DEMO_PROPERTY_ID, site: DEMO_SITE_URL, label: 'Demo workspace' }));
        if (saved === 'timeout' || !saved) {
            setDemoLoading(false);
            setError(saved === 'timeout'
                ? 'Could not load the demo workspace: the server is slow. Try again in a moment.'
                : 'Could not load the demo workspace. Try again.');
            return;
        }
        await markSetupCompleted();
        window.location.href = returnTo;
    };

    return (
        <div className="mx-auto max-w-[640px] pt-4 md:pt-8">
            <Stepper steps={STEPS} current={connected ? 2 : 1} />
            {connected ? (
                <SitesStep
                    sites={siteDirectory}
                    loading={siteDirectoryLoading}
                    failed={failed}
                    stale={stale}
                    finishing={saving}
                    finishError={error}
                    onFinish={() => void finish()}
                    onRecheck={recheck}
                    onSwitchAccount={connect}
                    onDemo={() => void continueWithDemo()}
                    demoLoading={demoLoading}
                />
            ) : (
                <ConnectStep onConnect={connect} onDemo={() => void continueWithDemo()} demoLoading={demoLoading} error={error} />
            )}
        </div>
    );
}

function SetupSkeleton() {
    return (
        <div aria-hidden className="mx-auto max-w-[640px] pt-4 md:pt-8">
            <Skeleton className="mb-6 h-6 w-full" delay={0} />
            <Skeleton className="h-72 w-full" rounded="card" delay={0} />
        </div>
    );
}
