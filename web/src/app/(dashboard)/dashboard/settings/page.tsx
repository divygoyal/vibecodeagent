'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
    User, Mail, LogOut,
    CheckCircle2, ChevronRight, Gift, Copy, Check
} from 'lucide-react';
import { BellRing } from 'lucide-react';
import { isPushSupported, isPushEnabled, requestPushPermission, disablePush } from '@/lib/pushNotifications';

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


export default function SettingsPage() {
    const { data: session } = useSession();

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

    const [activeTab, setActiveTab] = useState<'account' | 'notifications'>('account');

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
                <p className="text-sm text-zinc-500">
                    Manage your account, plan, and preferences.
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-1 p-1 bg-white/[0.02] border border-white/[0.06] rounded-xl w-fit">
                {(['account', 'notifications'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all capitalize ${
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

            {/* Referral Program */}
            <ReferralSection email={session?.user?.email || ''} />

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
                </div>
            </div>
            </>)}


            {activeTab === 'notifications' && (<>
            {/* Notification Preferences */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
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
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BellRing className="w-3.5 h-3.5" />
                        Browser Push Notifications
                    </h2>
                    <PushNotificationToggle />
                </div>
            )}
            </>)}
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
        <div className="bg-gradient-to-br from-emerald-500/[0.06] to-cyan-500/[0.04] border border-emerald-500/[0.15] rounded-2xl p-6">
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
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition"
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
