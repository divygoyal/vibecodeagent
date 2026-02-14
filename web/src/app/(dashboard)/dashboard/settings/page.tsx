'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
    User, Mail, Bell, LogOut, Shield, Globe, Key,
    CheckCircle2, ExternalLink, Copy, Eye, EyeOff, ChevronRight
} from 'lucide-react';

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

export default function SettingsPage() {
    const { data: session } = useSession();
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);
    const [notifications, setNotifications] = useState({
        seoAlerts: true,
        weeklyReport: true,
        contentDecay: true,
        botErrors: false,
    });

    const toggleNotification = (key: keyof typeof notifications) => {
        setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const fakeApiKey = 'grc_sk_1a2b3c4d5e6f7g8h9i0j...';

    const handleCopy = () => {
        navigator.clipboard.writeText(fakeApiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
                <p className="text-sm text-zinc-500">
                    Manage your account, connections, and preferences.
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
                        <div className="text-lg font-semibold text-white">{session?.user?.name || 'GrowClaw User'}</div>
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

            {/* Plan */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Current Plan</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-white font-semibold flex items-center gap-2">
                            Free Plan
                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">Current</span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">1 bot · 7-day data · Basic analytics</div>
                    </div>
                    <button className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-emerald-400 to-cyan-400 text-black rounded-xl hover:opacity-90 transition-opacity">
                        Upgrade to Pro
                    </button>
                </div>
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Data usage</span>
                        <span className="text-zinc-400">2.4 GB / 5 GB</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.04] rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full" style={{ width: '48%' }} />
                    </div>
                </div>
            </div>

            {/* Connected Services */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Connected Services</h2>
                <div className="space-y-3">
                    <ServiceRow
                        name="GitHub"
                        description={session?.user?.name ? `@${session.user.name}` : 'Not connected'}
                        connected={!!session?.user}
                        icon="🐙"
                    />
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

            {/* API Key */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">API Access</h2>
                <p className="text-xs text-zinc-500 mb-3">Use your API key to access GrowClaw data programmatically.</p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-zinc-400 overflow-hidden">
                        {showKey ? fakeApiKey : '•'.repeat(32)}
                    </div>
                    <button onClick={() => setShowKey(!showKey)} className="p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition">
                        {showKey ? <EyeOff className="w-4 h-4 text-zinc-400" /> : <Eye className="w-4 h-4 text-zinc-400" />}
                    </button>
                    <button onClick={handleCopy} className="p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition">
                        {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                    </button>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/[0.03] border border-red-500/[0.1] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-4">Danger Zone</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white font-medium text-sm">Sign Out</div>
                            <div className="text-xs text-zinc-500 mt-0.5">Sign out of your GrowClaw account</div>
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
