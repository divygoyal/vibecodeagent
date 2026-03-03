'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
    User, Mail, LogOut,
    CheckCircle2, ChevronRight, Coins, MessageSquare, Sparkles
} from 'lucide-react';
import { useCredits } from '@/lib/useDashboardData';

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-emerald-400' : 'bg-zinc-700'}`}
        >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    );
}

const CREDIT_PACKS = [
    {
        name: 'Starter',
        messages: 100,
        price: '$1',
        href: 'https://checkout.dodopayments.com/buy/pdt_0NYn4ZUFJs2YcTSvqivsI',
        highlight: false,
    },
    {
        name: 'Growth',
        messages: 500,
        price: '$5',
        href: 'https://checkout.dodopayments.com/buy/pdt_0NYn4ZZQMZXmfjC3aNpkI',
        highlight: true,
    },
    {
        name: 'Pro',
        messages: 1200,
        price: '$10',
        href: 'https://checkout.dodopayments.com/buy/pdt_0NYn4Zjup0Bo2kI7DIfBp',
        highlight: false,
        badge: 'Best Value',
    },
];

export default function SettingsPage() {
    const { data: session } = useSession();
    const { credits } = useCredits();
    const [notifications, setNotifications] = useState({
        seoAlerts: true,
        weeklyReport: true,
        contentDecay: true,
        botErrors: false,
    });

    const toggleNotification = (key: keyof typeof notifications) => {
        setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const displayCredits = credits ?? 0;
    const isLow = displayCredits < 20;
    const isMed = displayCredits < 50;

    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
                <p className="text-sm text-zinc-500">
                    Manage your account, messages, and preferences.
                </p>
            </div>

            {/* Profile */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
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
                        <div className="text-lg font-semibold text-white">{session?.user?.name || 'TrafficClaw User'}</div>
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

            {/* AI Messages / Credits */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" />
                    AI Messages
                </h2>

                {/* Current balance */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className={`text-3xl font-bold flex items-center gap-2 ${isLow ? 'text-red-400' : isMed ? 'text-amber-400' : 'text-emerald-400'}`}>
                            <Coins className="w-6 h-6" />
                            {credits !== null ? displayCredits : '—'}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                            {credits !== null
                                ? `${displayCredits} message${displayCredits !== 1 ? 's' : ''} remaining • 1 credit = 1 message`
                                : 'Loading balance...'
                            }
                        </div>
                    </div>
                    {isLow && credits !== null && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15]">
                            <Sparkles className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[11px] font-medium text-red-400">Running low!</span>
                        </div>
                    )}
                </div>

                {/* Progress bar */}
                {credits !== null && (
                    <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden mb-6">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-400' : isMed ? 'bg-amber-400' : 'bg-gradient-to-r from-emerald-400 to-cyan-400'}`}
                            style={{ width: `${Math.min(100, (displayCredits / 500) * 100)}%` }}
                        />
                    </div>
                )}

                {/* Buy more packs */}
                <div className="border-t border-white/[0.06] pt-5">
                    <h3 className="text-xs font-medium text-zinc-400 mb-3">Buy more messages</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {CREDIT_PACKS.map((pack) => (
                            <a
                                key={pack.name}
                                href={pack.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`relative flex flex-col items-center p-4 rounded-xl border transition-all duration-200 hover:scale-[1.02] ${pack.highlight
                                    ? 'bg-emerald-500/[0.06] border-emerald-500/[0.2] hover:border-emerald-500/[0.3]'
                                    : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                                    }`}
                            >
                                {pack.badge && (
                                    <span className="absolute -top-2 right-2 text-[9px] px-2 py-0.5 rounded-full bg-violet-500 text-white font-bold uppercase tracking-wider">
                                        {pack.badge}
                                    </span>
                                )}
                                <span className={`text-xl font-bold ${pack.highlight ? 'text-emerald-400' : 'text-white'}`}>
                                    {pack.messages.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-zinc-500 mb-2">messages</span>
                                <span className={`text-sm font-semibold px-4 py-1.5 rounded-lg transition ${pack.highlight
                                    ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black'
                                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                                    }`}>
                                    {pack.price}
                                </span>
                            </a>
                        ))}
                    </div>
                    <p className="text-[10px] text-zinc-600 text-center mt-3">
                        Payments by Dodo Payments • Credits never expire • Instant delivery
                    </p>
                </div>
            </div>

            {/* Connected Services */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Connected Services</h2>
                <div className="space-y-3">
                    <ServiceRow
                        name="Google Analytics"
                        description="GA4 property linked"
                        connected={true}
                        icon="📊"
                    />
                    <ServiceRow
                        name="Google Search Console"
                        description="1 site verified"
                        connected={true}
                        icon="🔍"
                    />
                    <ServiceRow
                        name="Telegram Bot"
                        description="Configure in Bot tab"
                        connected={false}
                        icon="✈️"
                    />
                </div>
            </div>

            {/* Notification Preferences */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Notifications</h2>
                <div className="space-y-4">
                    <NotificationRow
                        label="SEO Alerts"
                        description="Position drops, crawl errors, new keyword opportunities"
                        checked={notifications.seoAlerts}
                        onChange={() => toggleNotification('seoAlerts')}
                    />
                    <NotificationRow
                        label="Weekly Performance Report"
                        description="Summary of traffic, rankings, and AI recommendations"
                        checked={notifications.weeklyReport}
                        onChange={() => toggleNotification('weeklyReport')}
                    />
                    <NotificationRow
                        label="Content Decay Warnings"
                        description="Alert when a page loses significant organic traffic"
                        checked={notifications.contentDecay}
                        onChange={() => toggleNotification('contentDecay')}
                    />
                    <NotificationRow
                        label="Bot Error Notifications"
                        description="Alert when your bot encounters an error"
                        checked={notifications.botErrors}
                        onChange={() => toggleNotification('botErrors')}
                    />
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/[0.03] border border-red-500/[0.1] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">Danger Zone</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-medium text-sm">Sign Out</div>
                            <div className="text-xs text-zinc-500 mt-0.5">Sign out of your TrafficClaw account</div>
                        </div>
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-500/[0.2] rounded-xl hover:bg-red-500/[0.08] transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                        </button>
                    </div>
                    <div className="border-t border-red-500/[0.08] pt-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-white font-medium text-sm">Delete Account</div>
                                <div className="text-xs text-zinc-500 mt-0.5">Permanently delete your account and all data</div>
                            </div>
                            <button className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 border border-red-500/[0.2] rounded-xl hover:bg-red-500/[0.08] transition-colors opacity-50 cursor-not-allowed" disabled>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ServiceRow({ name, description, connected, icon }: {
    name: string;
    description: string;
    connected: boolean;
    icon: string;
}) {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.02] transition">
            <div className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <div>
                    <div className="text-sm font-medium text-white">{name}</div>
                    <div className="text-xs text-zinc-500">{description}</div>
                </div>
            </div>
            {connected ? (
                <span className="text-[10px] bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                </span>
            ) : (
                <button className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.1]">
                    Connect <ChevronRight className="w-3 h-3" />
                </button>
            )}
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
            <ToggleSwitch checked={checked} onChange={onChange} />
        </div>
    );
}
