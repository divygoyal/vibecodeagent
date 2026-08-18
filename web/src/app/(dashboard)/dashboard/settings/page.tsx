'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Mail, LogOut, Github, ChevronRight, Gift, Copy, Check,
    CreditCard, BellRing, User, Trophy, Bell, Plug, Settings as SettingsIcon,
} from 'lucide-react';
import Link from 'next/link';
import { isPushSupported, isPushEnabled, requestPushPermission, disablePush } from '@/lib/pushNotifications';
import { useContainerStatus } from '@/lib/useDashboardData';
import { toast } from 'sonner';
import LeaderboardOptIn from './LeaderboardOptIn';

/* ───────────────────────────────────────────────────────────────────
 * Settings
 *
 * Premium-pass redesign — neutral palette, vertical sidebar nav,
 * cleaner cards, no rainbow gradients. Functionality is byte-for-byte
 * identical: Google + GitHub OAuth flows, push notifications, referral
 * link generation, leaderboard opt-in, sign-out. The
 * ProviderConnectionCallback child still POSTs to /api/auth/register-provider
 * after the OAuth round-trip with the same error messages.
 * ──────────────────────────────────────────────────────────────────── */

type TabKey = 'account' | 'connections' | 'notifications' | 'leaderboard';

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
    { key: 'account',       label: 'Account',       icon: User },
    { key: 'connections',   label: 'Connections',   icon: Plug },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'leaderboard',   label: 'Leaderboard',   icon: Trophy },
];

/* ──────────────────────────────────────
 * Suspense-isolated child for OAuth callback registration.
 * ────────────────────────────────────── */
function ProviderConnectionCallback({ onConnected }: { onConnected: () => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const connected = searchParams.get('connected');
        if (connected !== 'github' && connected !== 'google') return;

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
                        onConnected();
                    } else {
                        toast.error(`Failed to register ${connected} connection.`);
                    }
                }
            } catch {
                if (!cancelled) toast.error(`Failed to register ${connected} connection.`);
            } finally {
                if (!cancelled) {
                    const params = new URLSearchParams(searchParams.toString());
                    params.delete('connected');
                    const qs = params.toString();
                    router.replace(`/dashboard/settings${qs ? `?${qs}` : ''}`);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, router, onConnected]);

    return null;
}

export default function SettingsPage() {
    const { data: session } = useSession();
    const { hasGoogleConnection, hasGithubConnection, refresh: refreshContainer } = useContainerStatus();

    const [notifications, setNotifications] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('tc-notification-prefs');
                if (saved) return JSON.parse(saved);
            } catch { /* defaults */ }
        }
        return { seoAlerts: true, weeklyReport: true, contentDecay: true, botErrors: false };
    });

    const toggleNotification = (key: keyof typeof notifications) => {
        setNotifications((prev: typeof notifications) => {
            const next = { ...prev, [key]: !prev[key] };
            localStorage.setItem('tc-notification-prefs', JSON.stringify(next));
            return next;
        });
    };

    const [activeTab, setActiveTab] = useState<TabKey>('account');

    return (
        <div className="max-w-5xl">
            <Suspense fallback={null}>
                <ProviderConnectionCallback onConnected={refreshContainer} />
            </Suspense>

            {/* Header */}
            <header className="mb-6 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <SettingsIcon className="h-4 w-4 text-zinc-300" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-white">Settings</h1>
                    <p className="text-[12px] text-zinc-500">Manage your account, integrations, and preferences.</p>
                </div>
            </header>

            <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                {/* Vertical tab nav (mobile: horizontal scroll fallback) */}
                <nav className="md:sticky md:top-4 self-start">
                    <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const active = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`group inline-flex md:flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors flex-shrink-0 ${
                                        active
                                            ? 'bg-white/[0.06] text-white'
                                            : 'text-zinc-400 hover:bg-white/[0.025] hover:text-zinc-200'
                                    }`}
                                >
                                    <Icon className={`h-3.5 w-3.5 ${active ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                                    <span className="font-medium">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                {/* Tab content */}
                <main className="space-y-4 min-w-0">
                    {activeTab === 'account' && (
                        <AccountTab
                            session={session}
                        />
                    )}
                    {activeTab === 'connections' && (
                        <ConnectionsTab
                            hasGoogleConnection={hasGoogleConnection}
                            hasGithubConnection={hasGithubConnection}
                            refreshContainer={refreshContainer}
                        />
                    )}
                    {activeTab === 'notifications' && (
                        <NotificationsTab
                            notifications={notifications}
                            toggleNotification={toggleNotification}
                        />
                    )}
                    {activeTab === 'leaderboard' && (
                        <LeaderboardOptIn />
                    )}
                </main>
            </div>
        </div>
    );
}

/* ───────────────────────────────────────────────────────────────────
 * Tabs
 * ──────────────────────────────────────────────────────────────────── */

function AccountTab({ session }: { session: ReturnType<typeof useSession>['data'] }) {
    return (
        <>
            {/* Profile card */}
            <Card>
                <SectionHeader title="Profile" />
                <div className="mt-4 flex items-center gap-4">
                    {session?.user?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={session.user.image}
                            alt=""
                            className="h-14 w-14 rounded-full ring-1 ring-white/[0.08]"
                        />
                    ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]">
                            <User className="h-6 w-6 text-zinc-300" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-white truncate">
                            {session?.user?.name || 'TrafficClaw user'}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-zinc-500">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{session?.user?.email || 'Not available'}</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Plan & Billing link */}
            <Link
                href="/dashboard/plan"
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-4 transition-colors hover:border-white/[0.12]"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02]">
                        <CreditCard className="h-4 w-4 text-zinc-300" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-white">Plan & billing</div>
                        <div className="text-[11.5px] text-zinc-500">Subscription, credits, renewal</div>
                    </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-600" />
            </Link>

            {/* Referral */}
            <ReferralSection email={session?.user?.email || ''} />

            {/* Danger zone */}
            <Card>
                <SectionHeader title="Danger zone" />
                <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[13px] font-medium text-white">Sign out</div>
                        <div className="mt-0.5 text-[11.5px] text-zinc-500">Sign out of your TrafficClaw account.</div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/[0.12]"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </Card>
        </>
    );
}

function ConnectionsTab({
    hasGoogleConnection, hasGithubConnection, refreshContainer,
}: {
    hasGoogleConnection: boolean;
    hasGithubConnection: boolean;
    refreshContainer: () => void;
}) {
    return (
        <Card>
            <SectionHeader title="Connections" />
            <p className="mt-1 text-[12px] text-zinc-500">
                Connect data sources so the AI can diagnose issues across SEO, analytics, and your codebase in one conversation.
            </p>
            <div className="mt-4 divide-y divide-white/[0.04]">
                <ServiceRow
                    name="Google · Analytics + Search Console"
                    description="Reads GA4 traffic and GSC search performance."
                    icon={
                        <svg viewBox="0 0 48 48" className="h-4 w-4">
                            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-11.3 8 12 12 0 1 1 7.9-21l5.6-5.6A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z"/>
                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12a12 12 0 0 1 7.9 3l5.6-5.6A20 20 0 0 0 6.3 14.7z"/>
                            <path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.5-5.2l-6.2-5.2A12 12 0 0 1 24 36a12 12 0 0 1-11.3-8L6.1 33A20 20 0 0 0 24 44z"/>
                            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2A19.6 19.6 0 0 0 44 24c0-1.2-.1-2.4-.4-3.5z"/>
                        </svg>
                    }
                    connected={hasGoogleConnection}
                    onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings?connected=google' }, { prompt: 'select_account consent' })}
                />
                <ServiceRow
                    name="GitHub"
                    description="Selective per-repo access via the TrafficClaw GitHub App — pick exactly which repos the AI can read."
                    icon={<Github className="h-4 w-4 text-white" />}
                    connected={hasGithubConnection}
                    onConnect={() => { window.location.href = '/api/auth/github-app/install'; }}
                    onDisconnect={async () => {
                        if (!confirm('Disconnect GitHub from TrafficClaw? You can also fully revoke access by uninstalling on github.com/settings/installations.')) return;
                        try {
                            const res = await fetch('/api/github-app/disconnect', { method: 'POST' });
                            if (res.ok) {
                                toast.success('GitHub disconnected.');
                                refreshContainer();
                            } else {
                                toast.error('Failed to disconnect GitHub.');
                            }
                        } catch {
                            toast.error('Failed to disconnect GitHub.');
                        }
                    }}
                />
                <ServiceRow
                    name="Vercel"
                    description="Coming soon — correlate deploys, build failures, and edge logs with traffic events."
                    icon={
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
                            <path d="M12 3 22 20H2L12 3Z" />
                        </svg>
                    }
                    connected={false}
                    comingSoon
                />
                <ServiceRow
                    name="WordPress"
                    description="Coming soon — read posts, drafts, and plugins; correlate publish dates with ranking changes."
                    icon={
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[#5fbcd9]">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
                            <path d="M3 12a9 9 0 0 0 5.2 8.15L4.6 9.65A8.96 8.96 0 0 0 3 12Z" fill="currentColor" />
                            <path d="M19.6 7.7a8.96 8.96 0 0 1 .9 8.7l-3.6-9.85a4 4 0 0 1 2.7 1.15Z" fill="currentColor" opacity="0.85" />
                            <path d="M11 4.4 14 13l-1.7 5.4a9 9 0 0 0 5.6-2.1L13.4 4.5l-2.4-.1Z" fill="currentColor" opacity="0.7" />
                        </svg>
                    }
                    connected={false}
                    comingSoon
                />
            </div>
        </Card>
    );
}

function NotificationsTab({
    notifications, toggleNotification,
}: {
    notifications: { seoAlerts: boolean; weeklyReport: boolean; contentDecay: boolean; botErrors: boolean };
    toggleNotification: (key: keyof typeof notifications) => void;
}) {
    return (
        <>
            <Card>
                <SectionHeader title="Email & in-app" />
                <div className="mt-3 divide-y divide-white/[0.04]">
                    <NotificationRow
                        label="SEO alerts"
                        description="Position drops, crawl errors, new keyword opportunities."
                        checked={notifications.seoAlerts}
                        onChange={() => toggleNotification('seoAlerts')}
                    />
                    <NotificationRow
                        label="Weekly performance report"
                        description="Summary of traffic, rankings, and AI recommendations."
                        checked={notifications.weeklyReport}
                        onChange={() => toggleNotification('weeklyReport')}
                    />
                    <NotificationRow
                        label="Content decay warnings"
                        description="Alert when a page loses significant organic traffic."
                        checked={notifications.contentDecay}
                        onChange={() => toggleNotification('contentDecay')}
                    />
                    <NotificationRow
                        label="Bot error notifications"
                        description="Alert when your bot encounters an error."
                        checked={notifications.botErrors}
                        onChange={() => toggleNotification('botErrors')}
                    />
                </div>
            </Card>

            {isPushSupported() && (
                <Card>
                    <SectionHeader
                        title="Browser push"
                        icon={<BellRing className="h-3 w-3" />}
                    />
                    <div className="mt-3">
                        <PushNotificationToggle />
                    </div>
                </Card>
            )}
        </>
    );
}

/* ───────────────────────────────────────────────────────────────────
 * Reusable primitives
 * ──────────────────────────────────────────────────────────────────── */

function Card({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-5">
            {children}
        </div>
    );
}

function SectionHeader({ title, icon }: { title: string; icon?: ReactNode }) {
    return (
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {icon}
            {title}
        </h2>
    );
}

function ToggleSwitch({ checked, onChange, label, disabled }: {
    checked: boolean;
    onChange: () => void;
    label?: string;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onChange}
            disabled={disabled}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                checked ? 'bg-emerald-500/80' : 'bg-zinc-700'
            } ${disabled ? 'opacity-50' : ''}`}
        >
            <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    checked ? 'translate-x-4' : 'translate-x-0.5'
                }`}
            />
        </button>
    );
}

function ServiceRow({
    name, description, connected, icon, onConnect, onDisconnect, comingSoon,
}: {
    name: string;
    description: string;
    connected: boolean;
    icon: ReactNode;
    onConnect?: () => void;
    onDisconnect?: () => void | Promise<void>;
    comingSoon?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white truncate">{name}</span>
                        {connected && (
                            <span className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{description}</p>
                </div>
            </div>
            {connected ? (
                <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-[10.5px] font-medium text-emerald-300">Connected</span>
                    {onDisconnect && (
                        <button
                            onClick={onDisconnect}
                            className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10.5px] text-zinc-400 transition-colors hover:border-red-500/30 hover:bg-red-500/[0.06] hover:text-red-300"
                            title="Disconnect"
                        >
                            Disconnect
                        </button>
                    )}
                </div>
            ) : comingSoon ? (
                <span className="flex-shrink-0 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10.5px] text-zinc-500">
                    Coming soon
                </span>
            ) : (
                <button
                    onClick={onConnect}
                    disabled={!onConnect}
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-zinc-200 transition-colors hover:bg-white/[0.08] hover:border-white/[0.16] disabled:opacity-50"
                >
                    Connect <ChevronRight className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

function ReferralSection({ email }: { email: string }) {
    const [copied, setCopied] = useState(false);
    const referralCode = email ? btoa(email).slice(0, 8).toLowerCase() : 'invite';
    const referralLink = typeof window !== 'undefined' ? `${window.location.origin}?ref=${referralCode}` : '';

    const [referralCount] = useState(() => {
        if (typeof window === 'undefined') return 0;
        return parseInt(localStorage.getItem('tc-referral-count') || '0', 10);
    });

    const copyLink = () => {
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Card>
            <div className="flex items-center justify-between gap-2">
                <SectionHeader title="Refer a friend" icon={<Gift className="h-3 w-3" />} />
                {referralCount > 0 && (
                    <span className="text-[10.5px] text-zinc-500 tabular-nums">{referralCount} invited</span>
                )}
            </div>
            <p className="mt-2 text-[12px] text-zinc-400">
                Share your link — when a friend signs up, you both get <span className="font-semibold text-white">5 free credits</span>.
            </p>
            <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-[11.5px] text-zinc-400">
                    {referralLink}
                </code>
                <button
                    onClick={copyLink}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[11.5px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
        </Card>
    );
}

function PushNotificationToggle() {
    const [enabled, setEnabled] = useState(isPushEnabled());
    const [requesting, setRequesting] = useState(false);

    const toggle = async () => {
        if (enabled) {
            disablePush();
            setEnabled(false);
        } else {
            setRequesting(true);
            const granted = await requestPushPermission();
            setEnabled(granted);
            setRequesting(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-[13px] font-medium text-white">Critical alert notifications</div>
                <div className="mt-0.5 text-[11.5px] text-zinc-500">
                    {enabled
                        ? 'Browser will surface alerts when critical issues are detected.'
                        : 'Get instant browser alerts for critical issues.'}
                </div>
            </div>
            <ToggleSwitch
                checked={enabled}
                onChange={toggle}
                disabled={requesting}
                label="Browser push notifications"
            />
        </div>
    );
}

function NotificationRow({ label, description, checked, onChange }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
                <div className="text-[13px] font-medium text-white">{label}</div>
                <div className="mt-0.5 text-[11.5px] text-zinc-500">{description}</div>
            </div>
            <ToggleSwitch checked={checked} onChange={onChange} label={label} />
        </div>
    );
}

