'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
    User, Mail, LogOut,
    CheckCircle2, ChevronRight, Coins, MessageSquare, Sparkles, Bot, Crown,
    Zap, TrendingUp, Shield, ArrowUpRight, Gift, Copy, Check
} from 'lucide-react';
import { useCredits } from '@/lib/useDashboardData';
import { History, BellRing } from 'lucide-react';
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

const PLAN_CONFIG: Record<string, { label: string; color: string; gradient: string; icon: typeof Zap; credits: number; price: string }> = {
    free: { label: 'Free', color: 'text-zinc-400', gradient: 'from-zinc-500 to-zinc-600', icon: Zap, credits: 0, price: '$0' },
    starter: { label: 'Starter', color: 'text-cyan-400', gradient: 'from-cyan-400 to-blue-500', icon: Zap, credits: 50, price: '$9' },
    growth: { label: 'Growth', color: 'text-emerald-400', gradient: 'from-emerald-400 to-cyan-400', icon: TrendingUp, credits: 150, price: '$19' },
    pro: { label: 'Pro', color: 'text-violet-400', gradient: 'from-violet-400 to-purple-500', icon: Shield, credits: 300, price: '$29' },
};

const SUBSCRIPTION_PLANS = [
    {
        key: 'starter',
        name: 'Starter',
        price: '$9',
        credits: 50,
        telegramBot: false,
        productId: 'pdt_0NZoVGbK4CoQKguLeiFbO',
        color: 'cyan',
        icon: Zap,
        features: ['50 AI credits/month', 'Full dashboard access', 'SEO & analytics tools', 'Site audit reports'],
    },
    {
        key: 'growth',
        name: 'Growth',
        price: '$19',
        credits: 150,
        telegramBot: false,
        productId: 'pdt_0NZoVI3aamuRliw0Ffnuh',
        color: 'emerald',
        icon: TrendingUp,
        features: ['150 AI credits/month', 'Everything in Starter', 'Priority AI responses', 'Advanced SEO intelligence'],
    },
    {
        key: 'pro',
        name: 'Pro',
        price: '$29',
        credits: 300,
        telegramBot: true,
        productId: 'pdt_0NZoVIVgk7pdElblScoop',
        color: 'violet',
        icon: Shield,
        features: ['300 AI credits/month', 'Everything in Growth', 'Telegram bot included', 'Priority support'],
    },
];

export default function SettingsPage() {
    const { data: session } = useSession();
    const { credits, plan, telegramBotEnabled, subscriptionEnd } = useCredits();
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

    const displayCredits = credits ?? 0;
    const isLow = displayCredits < 20;
    const isMed = displayCredits < 50;
    const currentPlan = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
    const PlanIcon = currentPlan.icon;
    const planMaxCredits = currentPlan.credits || 100;

    const [activeTab, setActiveTab] = useState<'account' | 'billing' | 'notifications'>('account');

    const renewalDate = subscriptionEnd ? new Date(subscriptionEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

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
                {(['account', 'billing', 'notifications'] as const).map(tab => (
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-gradient-to-r ${currentPlan.gradient} text-white`}>
                                {currentPlan.label}
                            </span>
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

            {activeTab === 'billing' && (<>
            {/* Current Plan Card */}
            <div className={`relative overflow-hidden border rounded-2xl p-6 ${
                plan === 'pro' ? 'bg-gradient-to-br from-violet-500/[0.08] to-purple-500/[0.04] border-violet-500/[0.2]' :
                plan === 'growth' ? 'bg-gradient-to-br from-emerald-500/[0.08] to-cyan-500/[0.04] border-emerald-500/[0.2]' :
                plan === 'starter' ? 'bg-gradient-to-br from-cyan-500/[0.08] to-blue-500/[0.04] border-cyan-500/[0.2]' :
                'bg-white/[0.02] border-white/[0.06]'
            }`}>
                {/* Glow */}
                <div className={`absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-20 bg-gradient-to-br ${currentPlan.gradient}`} />
                <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${currentPlan.gradient} flex items-center justify-center`}>
                                <PlanIcon className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                    {currentPlan.label} Plan
                                    {plan !== 'free' && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                                </h2>
                                <p className="text-[11px] text-zinc-500">
                                    {plan === 'free' ? 'Free tier — upgrade for AI credits' : `${currentPlan.price}/month • ${currentPlan.credits} credits/month`}
                                </p>
                            </div>
                        </div>
                        {renewalDate && plan !== 'free' && (
                            <div className="text-[10px] text-zinc-500 bg-white/[0.04] px-2.5 py-1 rounded-lg">
                                Renews {renewalDate}
                            </div>
                        )}
                    </div>

                    {/* Credits bar */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Coins className={`w-4 h-4 ${isLow ? 'text-red-400' : isMed ? 'text-amber-400' : currentPlan.color}`} />
                            <span className={`text-2xl font-bold ${isLow ? 'text-red-400' : isMed ? 'text-amber-400' : currentPlan.color}`}>
                                {credits !== null ? displayCredits : '—'}
                            </span>
                            <span className="text-xs text-zinc-500">credits remaining</span>
                        </div>
                        {isLow && credits !== null && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15]">
                                <Sparkles className="w-3 h-3 text-red-400" />
                                <span className="text-[10px] font-medium text-red-400">Running low!</span>
                            </div>
                        )}
                    </div>
                    <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden mb-3">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-red-400' : isMed ? 'bg-amber-400' : `bg-gradient-to-r ${currentPlan.gradient}`}`}
                            style={{ width: `${Math.min(100, (displayCredits / planMaxCredits) * 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-600">
                        <span>1 credit = 1 AI message</span>
                        {plan !== 'free' && <span>Credits reset monthly</span>}
                    </div>

                    {/* Telegram bot access */}
                    {telegramBotEnabled && (
                        <div className="flex items-center gap-2 mt-4 p-2.5 rounded-lg bg-violet-500/[0.06] border border-violet-500/[0.1]">
                            <Bot className="w-4 h-4 text-violet-400" />
                            <span className="text-[11px] text-violet-300 font-medium">Telegram bot access included</span>
                            <CheckCircle2 className="w-3 h-3 text-violet-400 ml-auto" />
                        </div>
                    )}
                </div>
            </div>

            {/* Subscription Plans */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-400" />
                            {plan === 'free' ? 'Choose a Plan' : 'Change Plan'}
                        </h2>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                            {plan === 'free' ? 'Upgrade to unlock AI credits and premium features.' : 'Upgrade or switch your subscription.'}
                        </p>
                    </div>
                    <span className="text-[10px] text-zinc-600">Credits reset monthly</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {SUBSCRIPTION_PLANS.map((p) => {
                        const isCurrentPlan = p.key === plan;
                        const isUpgrade = SUBSCRIPTION_PLANS.findIndex(x => x.key === plan) < SUBSCRIPTION_PLANS.findIndex(x => x.key === p.key);
                        const checkoutUrl = `https://checkout.dodopayments.com/buy/${p.productId}?email=${encodeURIComponent(session?.user?.email || '')}`;
                        const IconComp = p.icon;
                        const isGrowth = p.key === 'growth';
                        const isPro = p.key === 'pro';

                        return (
                            <div
                                key={p.key}
                                className={`relative flex flex-col p-5 rounded-2xl border transition-all duration-300 group overflow-hidden ${
                                    isCurrentPlan
                                        ? isPro ? 'bg-gradient-to-b from-violet-500/[0.1] via-purple-500/[0.04] to-transparent border-violet-500/[0.3]'
                                        : isGrowth ? 'bg-gradient-to-b from-emerald-500/[0.1] via-emerald-500/[0.04] to-transparent border-emerald-500/[0.3]'
                                        : 'bg-gradient-to-b from-cyan-500/[0.1] via-cyan-500/[0.04] to-transparent border-cyan-500/[0.3]'
                                    : isPro ? 'bg-gradient-to-b from-violet-500/[0.06] via-purple-500/[0.02] to-transparent border-violet-500/[0.15] hover:border-violet-500/[0.3]'
                                    : isGrowth ? 'bg-gradient-to-b from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent border-2 border-emerald-500/[0.25] hover:border-emerald-500/[0.4]'
                                    : 'bg-white/[0.02] border-white/[0.06] hover:border-cyan-500/[0.2]'
                                }`}
                            >
                                {/* Glow effect for Pro */}
                                {isPro && <div className="absolute top-0 right-0 w-28 h-28 bg-violet-500/[0.06] rounded-full blur-3xl pointer-events-none" />}

                                {/* Badges */}
                                {isCurrentPlan && (
                                    <span className={`absolute -top-0 left-0 right-0 text-center text-[9px] py-1 font-bold uppercase tracking-wider ${
                                        isPro ? 'bg-gradient-to-r from-violet-400 to-purple-500' : isGrowth ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 text-black' : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                                    } text-white`}>
                                        Current Plan
                                    </span>
                                )}
                                {isGrowth && !isCurrentPlan && (
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-[9px] font-bold text-black uppercase tracking-wider shadow-lg shadow-emerald-500/20">
                                        Most Popular
                                    </span>
                                )}
                                {isPro && !isCurrentPlan && (
                                    <span className="absolute -top-3 right-3 px-3 py-0.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-[9px] font-bold text-white uppercase tracking-wider shadow-lg shadow-violet-500/20">
                                        Best Value
                                    </span>
                                )}

                                <div className="relative pt-2">
                                    {/* Icon */}
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform ${
                                        isPro ? 'bg-gradient-to-br from-violet-400/20 to-purple-500/20' : isGrowth ? 'bg-gradient-to-br from-emerald-400/20 to-cyan-400/20' : 'bg-gradient-to-br from-cyan-400/20 to-blue-500/20'
                                    }`}>
                                        <IconComp className={`w-4.5 h-4.5 ${isPro ? 'text-violet-400' : isGrowth ? 'text-emerald-400' : 'text-cyan-400'}`} />
                                    </div>

                                    {/* Name & description */}
                                    <h3 className="text-base font-bold text-white mb-0.5">{p.name}</h3>
                                    <p className="text-[10px] text-zinc-500 mb-4">
                                        {isPro ? 'Everything unlocked + Telegram bot' : isGrowth ? 'For growing businesses' : 'Perfect for side projects'}
                                    </p>

                                    {/* Price */}
                                    <div className="flex items-baseline gap-1 mb-1">
                                        <span className={`text-3xl font-bold ${
                                            isPro ? 'bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent'
                                            : isGrowth ? 'bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent'
                                            : 'text-white'
                                        }`}>{p.price}</span>
                                        <span className="text-xs text-zinc-500">/mo</span>
                                    </div>
                                    <div className="flex items-center gap-2 mb-5">
                                        <span className={`text-xs font-medium ${isPro ? 'text-violet-400' : isGrowth ? 'text-emerald-400' : 'text-cyan-400'}`}>
                                            {p.credits} AI credits/month
                                        </span>
                                        {isGrowth && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/[0.1] text-emerald-400 border border-emerald-500/[0.15] font-semibold">3x Starter</span>}
                                        {isPro && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/[0.1] text-violet-400 border border-violet-500/[0.15] font-semibold">6x Starter</span>}
                                    </div>

                                    {/* CTA Button */}
                                    {isCurrentPlan ? (
                                        <div className={`text-center text-xs font-semibold px-4 py-2.5 rounded-xl mb-5 ${
                                            isPro ? 'bg-violet-500/[0.08] text-violet-400 border border-violet-500/[0.2]' : isGrowth ? 'bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/[0.2]' : 'bg-cyan-500/[0.08] text-cyan-400 border border-cyan-500/[0.2]'
                                        }`}>
                                            Active
                                        </div>
                                    ) : isGrowth ? (
                                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                                            className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all duration-200 mb-5 block text-center">
                                            {isUpgrade || plan === 'free' ? 'Get Growth' : 'Switch to Growth'}
                                        </a>
                                    ) : isPro ? (
                                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                                            className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-violet-400 to-purple-500 text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-200 mb-5 block text-center">
                                            {isUpgrade || plan === 'free' ? 'Get Pro' : 'Switch to Pro'}
                                        </a>
                                    ) : (
                                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                                            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] text-white hover:bg-white/[0.12] transition-all duration-200 mb-5 block text-center border border-white/[0.06] hover:border-cyan-500/[0.2]">
                                            {isUpgrade || plan === 'free' ? 'Get Starter' : 'Switch to Starter'}
                                        </a>
                                    )}

                                    {/* Features */}
                                    <ul className="space-y-2.5 flex-1">
                                        {p.features.map((f, i) => (
                                            <li key={i} className={`flex items-center gap-2 text-[11px] ${
                                                f.includes('Telegram') ? (isPro ? 'text-violet-300 font-medium' : 'text-zinc-400') : isCurrentPlan ? 'text-zinc-300' : 'text-zinc-400'
                                            }`}>
                                                {f.includes('Telegram') ? (
                                                    <Bot className={`w-3.5 h-3.5 flex-shrink-0 ${isPro ? 'text-violet-400' : 'text-zinc-600'}`} />
                                                ) : (
                                                    <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${
                                                        isPro ? 'text-violet-400' : isGrowth ? 'text-emerald-400' : isCurrentPlan ? 'text-cyan-400' : 'text-zinc-600'
                                                    }`} />
                                                )}
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-zinc-600 text-center">
                    Secure payments by Dodo Payments • Cancel anytime
                </p>
            </div>

            {/* Credit Usage History */}
            <CreditUsageHistory />
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

function CreditUsageHistory() {
    const [history] = useState<{ date: string; action: string; amount: number }[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem('tc-credit-usage');
            if (saved) return JSON.parse(saved);
        } catch { /* empty */ }
        return [];
    });

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                Credit Usage History
            </h2>
            {history.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-4">No credit usage recorded yet. Credits are tracked as you use AI features.</p>
            ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {history.slice(-20).reverse().map((entry, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.04] last:border-0">
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-500">{new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                <span className="text-zinc-300">{entry.action}</span>
                            </div>
                            <span className={`font-medium ${entry.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {entry.amount > 0 ? '+' : ''}{entry.amount}
                            </span>
                        </div>
                    ))}
                </div>
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
            <ToggleSwitch checked={checked} onChange={onChange} label={label} />
        </div>
    );
}
