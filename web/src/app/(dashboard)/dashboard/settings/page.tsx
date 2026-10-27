'use client';

import { Suspense, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Bell, Database, Palette, Plug, ShieldAlert, User } from 'lucide-react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { useConnections } from '@/lib/useDashboardData';
import { AppearanceTab } from './AppearanceTab';
import { DangerTab } from './DangerTab';
import { GoogleTab } from './GoogleTab';
import { NotificationsTab } from './NotificationsTab';
import { PrivacyTab } from './PrivacyTab';
import { ProfileTab } from './ProfileTab';

/**
 * Settings (DESIGN 5.14): Profile, Google connection, Appearance, Notifications,
 * Data and privacy, Danger zone. The tab lives in `?tab=`.
 *
 * Old links keep working: `?tab=account` is Profile, `?tab=connections` and
 * `?tab=sites` are Google, and `?tab=leaderboard` goes to /dashboard/leaderboard,
 * where the leaderboard settings now live.
 */
const TAB_VALUES = ['profile', 'google', 'appearance', 'notifications', 'privacy', 'danger'] as const;
type TabKey = (typeof TAB_VALUES)[number];

const LEGACY_TABS: Record<string, TabKey> = { account: 'profile', connections: 'google', sites: 'google' };

const TAB_ITEMS: TabItem<TabKey>[] = [
    { value: 'profile', label: 'Profile', icon: User },
    { value: 'google', label: 'Google', icon: Plug },
    { value: 'appearance', label: 'Appearance', icon: Palette },
    { value: 'notifications', label: 'Notifications', icon: Bell },
    { value: 'privacy', label: 'Data & privacy', icon: Database },
    { value: 'danger', label: 'Danger zone', icon: ShieldAlert },
];

export default function SettingsPage() {
    return (
        <Suspense fallback={<SettingsSkeleton />}>
            <Settings />
        </Suspense>
    );
}

function Settings() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { hasGoogleConnection, refresh: refreshContainer } = useConnections();

    const raw = searchParams.get('tab') ?? '';
    const tab: TabKey = (TAB_VALUES as readonly string[]).includes(raw) ? (raw as TabKey) : LEGACY_TABS[raw] ?? 'profile';

    const setTab = useCallback((next: TabKey) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'profile') params.delete('tab');
        else params.set('tab', next);
        const qs = params.toString();
        router.replace(`/dashboard/settings${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [router, searchParams]);

    // Old deep links: the leaderboard tab moved to its own page.
    useEffect(() => {
        if (raw === 'leaderboard') router.replace('/dashboard/leaderboard');
    }, [raw, router]);

    // Back from the Google round trip (`?connected=google`): register it, toast, clean the URL.
    const connected = searchParams.get('connected');
    useEffect(() => {
        if (connected !== 'google' && connected !== 'github') return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: connected }),
                });
                if (!cancelled) {
                    if (res.ok) {
                        toast.success(connected === 'github' ? 'GitHub connected' : 'Google connected');
                        refreshContainer();
                    } else {
                        toast.error(`Failed to register ${connected} connection.`);
                    }
                }
            } catch {
                if (!cancelled) toast.error(`Failed to register ${connected} connection.`);
            } finally {
                if (!cancelled) {
                    const params = new URLSearchParams(window.location.search);
                    params.delete('connected');
                    const qs = params.toString();
                    router.replace(`/dashboard/settings${qs ? `?${qs}` : ''}`, { scroll: false });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [connected, router, refreshContainer]);

    return (
        <div className="mx-auto max-w-[960px]">
            <PageHeader
                title="Settings"
                subtitle="Your account, Google connection and preferences"
                tabs={<Tabs items={TAB_ITEMS} value={tab} onValueChange={setTab} ariaLabel="Settings sections" panelIdPrefix="settings" showIcons />}
            />
            <div id={`settings-${tab}`} role="tabpanel" className="flex flex-col gap-4">
                {tab === 'profile' ? <ProfileTab /> : null}
                {tab === 'google' ? <GoogleTab connected={hasGoogleConnection} /> : null}
                {tab === 'appearance' ? <AppearanceTab /> : null}
                {tab === 'notifications' ? <NotificationsTab /> : null}
                {tab === 'privacy' ? <PrivacyTab goToDanger={() => setTab('danger')} /> : null}
                {tab === 'danger' ? <DangerTab /> : null}
            </div>
        </div>
    );
}

function SettingsSkeleton() {
    return (
        <div aria-hidden className="mx-auto max-w-[960px]">
            <div className="mb-6 flex flex-col gap-2"><Skeleton className="h-7 w-32" /><Skeleton className="h-4 w-72" /></div>
            <Skeleton className="mb-4 h-9 w-full max-w-xl" />
            <Skeleton className="h-48 w-full" rounded="card" />
        </div>
    );
}
