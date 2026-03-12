'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    CheckCircle2, Coins, Sparkles, Bot, Crown,
    Zap, TrendingUp, Shield, History, AlertTriangle, X, Loader2
} from 'lucide-react';
import { useCredits } from '@/lib/useDashboardData';

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
        productId: 'pdt_0NaLMLyWwiO355QaGlQwq',
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
        productId: 'pdt_0NaLMM1bLW9wAbmxcsebm',
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
        productId: 'pdt_0NaLMM4r23kncRahthuyj',
        color: 'violet',
        icon: Shield,
        features: ['300 AI credits/month', 'Everything in Growth', 'Telegram bot included', 'Priority support'],
    },
];

export default function PlanPage() {
    return (
        <Suspense>
            <PlanPageContent />
        </Suspense>
    );
}

function PlanPageContent() {
    const { data: session } = useSession();
    const { credits, plan, telegramBotEnabled, subscriptionEnd, subscriptionId, subscriptionCancelled, refresh: refreshCredits } = useCredits();
    const searchParams = useSearchParams();
    const justUpgraded = useMemo(() => searchParams.get('upgraded') === 'true', [searchParams]);
    const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(justUpgraded);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelSuccess, setCancelSuccess] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    useEffect(() => {
        if (!justUpgraded) return;
        refreshCredits();
        window.history.replaceState({}, '', '/dashboard/plan');
        const timer = setTimeout(() => setShowUpgradeSuccess(false), 8000);
        return () => clearTimeout(timer);
    }, [justUpgraded, refreshCredits]);

    const handleCancelSubscription = async () => {
        setCancelling(true);
        setCancelError(null);
        try {
            const res = await fetch('/api/subscription/cancel', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                setCancelError(data.error || 'Failed to cancel subscription');
                return;
            }
            setCancelSuccess(true);
            setShowCancelModal(false);
            refreshCredits();
        } catch {
            setCancelError('Something went wrong. Please try again.');
        } finally {
            setCancelling(false);
        }
    };

    const displayCredits = credits ?? 0;
    const isLow = displayCredits < 20;
    const isMed = displayCredits < 50;
    const currentPlan = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
    const PlanIcon = currentPlan.icon;
    const planMaxCredits = currentPlan.credits || 100;

    const renewalDate = subscriptionEnd ? new Date(subscriptionEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-white mb-1">Plan & Billing</h1>
                <p className="text-sm text-zinc-500">
                    Manage your subscription, credits, and billing.
                </p>
            </div>

            {/* Upgrade Success Banner */}
            {showUpgradeSuccess && (
                <div className="bg-emerald-500/[0.08] border border-emerald-500/[0.2] rounded-2xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-emerald-300">Payment successful!</p>
                        <p className="text-xs text-zinc-400">Your plan is being activated. It may take a moment to reflect.</p>
                    </div>
                </div>
            )}

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
                            <div className={`text-[10px] px-2.5 py-1 rounded-lg ${
                                subscriptionCancelled
                                    ? 'text-amber-400 bg-amber-500/[0.08] border border-amber-500/[0.15]'
                                    : 'text-zinc-500 bg-white/[0.04]'
                            }`}>
                                {subscriptionCancelled ? `Active until ${renewalDate}` : `Renews ${renewalDate}`}
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

                    {/* Cancel subscription button or cancelled status */}
                    {plan !== 'free' && (
                        <div className="mt-4 pt-4 border-t border-white/[0.06]">
                            {subscriptionCancelled ? (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.1]">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                    <span className="text-[11px] text-amber-300">
                                        Subscription cancelled — active until {renewalDate || 'end of billing period'}
                                    </span>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    className="text-[11px] font-medium text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg bg-red-500/[0.06] border border-red-500/[0.1] hover:bg-red-500/[0.12] hover:border-red-500/[0.2]"
                                >
                                    Cancel subscription
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Cancel Success Banner */}
            {cancelSuccess && (
                <div className="bg-amber-500/[0.08] border border-amber-500/[0.2] rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-300">Subscription cancelled</p>
                        <p className="text-xs text-zinc-400">
                            Your plan remains active until {renewalDate || 'the end of your billing period'}. You won&apos;t be charged again.
                        </p>
                    </div>
                    <button onClick={() => setCancelSuccess(false)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

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
                        const userEmail = session?.user?.email || '';
                        const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard/plan?upgraded=true` : '';
                        const checkoutUrl = userEmail
                            ? `https://checkout.dodopayments.com/buy/${p.productId}?email=${encodeURIComponent(userEmail)}&redirect_url=${encodeURIComponent(returnUrl)}`
                            : '';
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
                                    ) : !checkoutUrl ? (
                                        <div className="text-center text-[10px] text-zinc-500 px-4 py-2.5 rounded-xl mb-5 bg-white/[0.03] border border-white/[0.06]">
                                            Email required to subscribe
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

            {/* Cancel Subscription Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#0a0a0f] border border-white/[0.08] rounded-2xl p-6 max-w-md w-full space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/[0.1] flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Cancel subscription?</h3>
                                <p className="text-[11px] text-zinc-500">This action will stop future renewals</p>
                            </div>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2">
                            <p className="text-xs text-zinc-300">
                                Your <span className={`font-semibold ${currentPlan.color}`}>{currentPlan.label}</span> plan will remain active until <span className="text-white font-medium">{renewalDate || 'the end of your billing period'}</span>.
                            </p>
                            <p className="text-xs text-zinc-500">
                                After that, you&apos;ll be downgraded to the Free plan. Your remaining credits will still be usable until then.
                            </p>
                        </div>

                        {cancelError && (
                            <div className="bg-red-500/[0.08] border border-red-500/[0.15] rounded-lg p-3">
                                <p className="text-xs text-red-400">{cancelError}</p>
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                            <button
                                onClick={() => { setShowCancelModal(false); setCancelError(null); }}
                                disabled={cancelling}
                                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-white/[0.06] text-white hover:bg-white/[0.1] transition-all border border-white/[0.06]"
                            >
                                Keep my plan
                            </button>
                            <button
                                onClick={handleCancelSubscription}
                                disabled={cancelling}
                                className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-red-500/[0.1] text-red-400 hover:bg-red-500/[0.2] transition-all border border-red-500/[0.2] flex items-center justify-center gap-2"
                            >
                                {cancelling ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    'Cancel subscription'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
