'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import {
    User, Mail, LogOut,
    CheckCircle2, ChevronRight, Coins, MessageSquare, Sparkles, Bot, Crown,
    Zap, TrendingUp, Shield, ArrowUpRight
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
    const currentPlan = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
    const PlanIcon = currentPlan.icon;
    const planMaxCredits = currentPlan.credits || 100;

    const renewalDate = subscriptionEnd ? new Date(subscriptionEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    return (
        <div className="space-y-6 max-w-2xl p-6">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
                <p className="text-sm text-zinc-500">
                    Manage your account, plan, and preferences.
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
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {plan === 'free' ? 'Choose a Plan' : 'Change Plan'}
                </h2>
                <p className="text-[11px] text-zinc-600 mb-5">
                    {plan === 'free' ? 'Upgrade to unlock AI credits and premium features.' : 'Upgrade or switch your subscription.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {SUBSCRIPTION_PLANS.map((p) => {
                        const isCurrentPlan = p.key === plan;
                        const isUpgrade = SUBSCRIPTION_PLANS.findIndex(x => x.key === plan) < SUBSCRIPTION_PLANS.findIndex(x => x.key === p.key);
                        const checkoutUrl = `https://checkout.dodopayments.com/buy/${p.productId}?email=${encodeURIComponent(session?.user?.email || '')}`;
                        const IconComp = p.icon;

                        const colorMap: Record<string, { border: string; bg: string; text: string; btnBg: string; check: string }> = {
                            cyan: { border: 'border-cyan-500/[0.2]', bg: 'bg-cyan-500/[0.04]', text: 'text-cyan-400', btnBg: 'bg-gradient-to-r from-cyan-400 to-blue-500', check: 'text-cyan-500' },
                            emerald: { border: 'border-emerald-500/[0.2]', bg: 'bg-emerald-500/[0.04]', text: 'text-emerald-400', btnBg: 'bg-gradient-to-r from-emerald-400 to-cyan-400', check: 'text-emerald-400' },
                            violet: { border: 'border-violet-500/[0.2]', bg: 'bg-violet-500/[0.04]', text: 'text-violet-400', btnBg: 'bg-gradient-to-r from-violet-400 to-purple-500', check: 'text-violet-400' },
                        };
                        const colors = colorMap[p.color];

                        return (
                            <div
                                key={p.key}
                                className={`relative flex flex-col p-4 rounded-xl border transition-all duration-200 ${
                                    isCurrentPlan ? `${colors.bg} ${colors.border} ring-1 ring-inset ring-white/[0.06]` : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                                }`}
                            >
                                {isCurrentPlan && (
                                    <span className={`absolute -top-2 left-3 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${colors.btnBg} text-white`}>
                                        Current Plan
                                    </span>
                                )}
                                {p.key === 'pro' && !isCurrentPlan && (
                                    <span className="absolute -top-2 right-2 text-[9px] px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-500 text-white font-bold uppercase tracking-wider">
                                        Best Value
                                    </span>
                                )}
                                <div className="flex items-center gap-2 mb-2 mt-1">
                                    <div className={`w-6 h-6 rounded-md ${colors.btnBg} flex items-center justify-center`}>
                                        <IconComp className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <span className={`text-sm font-bold ${isCurrentPlan ? colors.text : 'text-white'}`}>
                                        {p.name}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className={`text-2xl font-bold ${isCurrentPlan ? colors.text : 'text-white'}`}>{p.price}</span>
                                    <span className="text-[10px] text-zinc-500">/mo</span>
                                </div>
                                <div className="text-[10px] text-zinc-500 mb-3">{p.credits} AI credits/month</div>
                                <ul className="space-y-1.5 mb-4 flex-1">
                                    {p.features.map((f, i) => (
                                        <li key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                            <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${isCurrentPlan ? colors.check : 'text-zinc-600'}`} />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                {isCurrentPlan ? (
                                    <div className={`text-center text-xs font-semibold px-4 py-2 rounded-lg ${colors.bg} ${colors.text} border ${colors.border}`}>
                                        Active
                                    </div>
                                ) : (
                                    <a
                                        href={checkoutUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`text-center text-xs font-semibold px-4 py-2 rounded-lg transition hover:scale-[1.02] flex items-center justify-center gap-1.5 ${
                                            isUpgrade || plan === 'free'
                                                ? `${colors.btnBg} text-white hover:shadow-lg`
                                                : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]'
                                        }`}
                                    >
                                        {isUpgrade || plan === 'free' ? 'Upgrade' : 'Switch'}
                                        <ArrowUpRight className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-zinc-600 text-center mt-3">
                    Payments by Dodo Payments • Credits reset monthly • Cancel anytime
                </p>
            </div>

            {/* Connected Services */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Connected Services</h2>
                <div className="space-y-3">
                    <ServiceRow name="Google Analytics" description="GA4 property linked" connected={true} icon="📊" />
                    <ServiceRow name="Google Search Console" description="1 site verified" connected={true} icon="🔍" />
                    <ServiceRow
                        name="Telegram Bot"
                        description={telegramBotEnabled ? 'Enabled with Pro plan' : 'Requires Pro plan'}
                        connected={telegramBotEnabled}
                        icon="✈️"
                    />
                </div>
            </div>

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
