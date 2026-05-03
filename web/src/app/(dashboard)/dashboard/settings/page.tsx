'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    User, Mail, LogOut, Github, Plug,
    CheckCircle2, ChevronRight, Gift, Copy, Check, CreditCard
} from 'lucide-react';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { isPushSupported, isPushEnabled, requestPushPermission, disablePush } from '@/lib/pushNotifications';
import { useContainerStatus } from '@/lib/useDashboardData';
import { toast } from 'sonner';
import LeaderboardOptIn from './LeaderboardOptIn';

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
    return (
        <button
            onClick={onChange}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-emerald-400' : 'bg-zinc-700'}`}
        >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}


// Isolated child so the useSearchParams() Suspense bailout doesn't disable
// static rendering for the entire settings page (Next.js 16 prerender requirement).
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
            } catch { /* use defaults */ }
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

    const [activeTab, setActiveTab] = useState<'account' | 'notifications' | 'leaderboard'>('account');

    return (
        <div className="space-y-6 max-w-2xl">
            <Suspense fallback={null}>
                <ProviderConnectionCallback onConnected={refreshContainer} />
            </Suspense>
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
                <p className="text-sm text-zinc-500">
                    Manage your account, plan, and preferences.
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 p-1 bg-white/[0.02] border border-white/[0.06] rounded-xl w-fit">
                {(['account', 'notifications', 'leaderboard'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2.5 min-h-[44px] text-xs font-medium rounded-lg transition-all capitalize ${
                            activeTab === tab
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'account' && (<>
            {/* Profile */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 sm:p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Profile</h2>
                <div className="flex items-center gap-4">
                    {session?.user?.image ? (
                        <img
                            src={session.user.image}
                            alt=""
                            className="w-14 h-14 rounded-full ring-2 ring-white/[0.08]"
                        />
                    ) : (
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                            <User className="w-6 h-6 text-black" />
                        </div>
                    )}
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold text-white">{session?.user?.name || 'TrafficClaw User'}</span>
                        </div>
                        <div className="text-sm text-zinc-500 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            {session?.user?.email || 'Not available'}
                        </div>
                    </div>
                    <span className="text-[10px] bg-emerald-400/10 text-emerald-400 px-2.5 py-1 rounded-full font-medium hidden sm:inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                    </span>
                </div>
            </div>

            {/* Plan & Billing Link */}
            <Link href="/dashboard/plan" className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl hover:bg-white/[0.04] transition-colors group">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <div className="text-sm font-medium text-white">Plan & Billing</div>
                        <div className="text-xs text-zinc-500">Manage your subscription, view credits, and upgrade</div>
                    </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </Link>

            {/* Connections */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 sm:p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Plug className="w-3.5 h-3.5" />
                    Connections
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                    Connect your data sources so the AI chatbot can diagnose issues across SEO, analytics, and your codebase in a single conversation.
                </p>
                <div className="space-y-1">
                    <ServiceRow
                        name="Google (Analytics + Search Console)"
                        description="Lets the AI read GA4 traffic and GSC search performance"
                        icon={<span className="text-base">📊</span>}
                        connected={hasGoogleConnection}
                        onConnect={() => signIn('google', { callbackUrl: '/dashboard/settings?connected=google' }, { prompt: 'select_account consent' })}
                    />
                    <ServiceRow
                        name="GitHub"
                        description="Selective per-repo access via the TrafficClaw GitHub App — pick exactly which repos the AI can read"
                        icon={<Github className="w-4 h-4 text-white" />}
                        connected={hasGithubConnection}
                        onConnect={() => { window.location.href = '/api/auth/github-app/install'; }}
                    />
                    <ServiceRow
                        name="Vercel"
                        description="Coming soon — correlate deploys, build failures, and edge logs with traffic events"
                        icon={
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                                <path d="M12 3 22 20H2L12 3Z" />
                            </svg>
                        }
                        connected={false}
                        comingSoon
                    />
                    <ServiceRow
                        name="WordPress"
                        description="Coming soon — read posts, drafts, and plugins; correlate publish dates with ranking changes"
                        icon={
                            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-[#5fbcd9]">
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
            </div>

            {/* Referral Program */}
            <ReferralSection email={session?.user?.email || ''} />

            {/* Danger Zone */}
            <div className="bg-red-500/[0.03] border border-red-500/[0.1] rounded-2xl p-4 sm:p-6">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">Danger Zone</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-medium text-sm">Sign Out</div>
                            <div className="text-xs text-zinc-500 mt-0.5">Sign out of your TrafficClaw account</div>
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm text-red-400 border border-red-500/[0.2] rounded-xl hover:bg-red-500/[0.08] transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
            </>)}


            {activeTab === 'notifications' && (<>
            {/* Notification Preferences */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 sm:p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Notifications</h2>
                <div className="space-y-4">
                    <NotificationRow label="SEO Alerts" description="Position drops, crawl errors, new keyword opportunities" checked={notifications.seoAlerts} onChange={() => toggleNotification('seoAlerts')} />
                    <NotificationRow label="Weekly Performance Report" description="Summary of traffic, rankings, and AI recommendations" checked={notifications.weeklyReport} onChange={() => toggleNotification('weeklyReport')} />
                    <NotificationRow label="Content Decay Warnings" description="Alert when a page loses significant organic traffic" checked={notifications.contentDecay} onChange={() => toggleNotification('contentDecay')} />
                    <NotificationRow label="Bot Error Notifications" description="Alert when your bot encounters an error" checked={notifications.botErrors} onChange={() => toggleNotification('botErrors')} />
                </div>
            </div>

            {/* Browser Push Notifications */}
            {isPushSupported() && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 sm:p-6">
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BellRing className="w-3.5 h-3.5" />
                        Browser Push Notifications
                    </h2>
                    <PushNotificationToggle />
                </div>
            )}
            </>)}

            {activeTab === 'leaderboard' && (
                <LeaderboardOptIn />
            )}
        </div>
    );
}

function ServiceRow({ name, description, connected, icon, onConnect, comingSoon }: {
    name: string;
    description: string;
    connected: boolean;
    icon: React.ReactNode;
    onConnect?: () => void;
    comingSoon?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-white/[0.02] transition">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    {icon}
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{name}</div>
                    <div className="text-xs text-zinc-500">{description}</div>
                </div>
            </div>
            {connected ? (
                <span className="text-[10px] bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                </span>
            ) : comingSoon ? (
                <span className="text-[10px] bg-white/[0.04] text-zinc-400 px-2 py-0.5 rounded-full font-medium shrink-0 border border-white/[0.06]">
                    Coming soon
                </span>
            ) : (
                <button
                    onClick={onConnect}
                    disabled={!onConnect}
                    className="text-xs text-zinc-300 hover:text-white transition flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.16] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                    Connect <ChevronRight className="w-3 h-3" />
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
        <div className="bg-gradient-to-br from-emerald-500/[0.06] to-cyan-500/[0.04] border border-emerald-500/[0.15] rounded-2xl p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Invite Friends, Earn Credits</h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
                Share your referral link. When a friend signs up, you both get <span className="text-emerald-400 font-bold">5 free credits</span>.
            </p>
            <div className="flex items-center gap-2">
                <div className="flex-1 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-400 truncate">
                    {referralLink}
                </div>
                <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition"
                >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            {referralCount > 0 && (
                <p className="text-[10px] text-zinc-500 mt-2">{referralCount} friend{referralCount !== 1 ? 's' : ''} invited</p>
            )}
        </div>
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
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-white">Critical Alert Notifications</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                    {enabled ? 'You\'ll receive browser notifications for critical alerts' : 'Get instant browser alerts when critical issues are detected'}
                </div>
            </div>
            <button
                onClick={toggle}
                disabled={requesting}
                className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-400' : 'bg-zinc-700'} ${requesting ? 'opacity-50' : ''}`}
                role="switch"
                aria-checked={enabled}
                aria-label="Browser push notifications"
            >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
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
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-white">{label}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{description}</div>
            </div>
            <ToggleSwitch checked={checked} onChange={onChange} label={label} />
        </div>
    );
}
