'use client';

import { useSession } from 'next-auth/react';
import { getSafeRedirectUrl } from '@/lib/checkout';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    CheckCircle2, Coins, Bot, Zap, TrendingUp, Shield,
    History, AlertTriangle, X, Loader2, ArrowRight, Check,
} from 'lucide-react';
import { useCredits } from '@/lib/useDashboardData';

/* ───────────────────────────────────────────────────────────────────
 * Plan & Billing
 *
 * Premium-pass redesign — neutral palette, tabular numbers, no rainbow
 * gradients. Functionality is byte-for-byte identical to the previous
 * version: same Dodo Payments product IDs + checkout URLs, same
 * /api/subscription/cancel call, same useCredits hook, same upgraded=true
 * URL-param handshake.
 * ──────────────────────────────────────────────────────────────────── */

interface PlanInfo {
    label: string;
    icon: typeof Zap;
    credits: number;
    price: string;
    blurb: string;
}

const PLAN_CONFIG: Record<string, PlanInfo> = {
    free:    { label: 'Free',    icon: Zap,         credits: 0,   price: '$0',  blurb: 'Free tier — no AI credits' },
    starter: { label: 'Starter', icon: Zap,         credits: 50,  price: '$9',  blurb: 'For side projects' },
    growth:  { label: 'Growth',  icon: TrendingUp,  credits: 150, price: '$19', blurb: 'For growing businesses' },
    pro:     { label: 'Pro',     icon: Shield,      credits: 300, price: '$29', blurb: 'Telegram bot + everything' },
};

const SUBSCRIPTION_PLANS = [
    {
        key: 'starter',
        productId: 'pdt_0NaLMLyWwiO355QaGlQwq',
        features: ['50 AI credits / month', 'Full dashboard access', 'SEO & analytics tools', 'Site audit reports'],
    },
    {
        key: 'growth',
        productId: 'pdt_0NaLMM1bLW9wAbmxcsebm',
        features: ['150 AI credits / month', 'Everything in Starter', 'Priority AI responses', 'Advanced SEO intelligence'],
        recommended: true,
    },
    {
        key: 'pro',
        productId: 'pdt_0NaLMM4r23kncRahthuyj',
        features: ['300 AI credits / month', 'Everything in Growth', 'Telegram bot included', 'Priority support'],
        telegramBot: true,
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
    const { credits, plan, telegramBotEnabled, subscriptionEnd, subscriptionCancelled, refresh: refreshCredits } = useCredits();
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
        const t = setTimeout(() => setShowUpgradeSuccess(false), 8000);
        return () => clearTimeout(t);
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

    const currentPlan = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
    const PlanIcon = currentPlan.icon;
    const displayCredits = credits ?? 0;
    const planMaxCredits = currentPlan.credits || 100;
    const creditsPct = Math.min(100, (displayCredits / planMaxCredits) * 100);
    const lowSeverity = displayCredits < 20 ? 'low' : displayCredits < 50 ? 'medium' : 'ok';
    const renewalDate = subscriptionEnd
        ? new Date(subscriptionEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

    return (
        <div className="max-w-3xl space-y-5">
            {/* Header */}
            <header>
                <h1 className="text-xl font-semibold text-white tracking-tight">Plan & billing</h1>
                <p className="mt-1 text-[13px] text-zinc-500">Manage your subscription, credits, and renewal.</p>
            </header>

            {/* Upgrade success banner */}
            {showUpgradeSuccess && (
                <Banner
                    tone="success"
                    title="Payment successful"
                    body="Your plan is being activated. It may take a moment to reflect."
                />
            )}
            {cancelSuccess && (
                <Banner
                    tone="warning"
                    title="Subscription cancelled"
                    body={`Your plan stays active until ${renewalDate || 'the end of the billing period'}. You won't be charged again.`}
                    onClose={() => setCancelSuccess(false)}
                />
            )}

            {/* Current plan summary */}
            <section className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                            <PlanIcon className="h-4.5 w-4.5 text-zinc-200" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-[15px] font-semibold text-white">{currentPlan.label}</h2>
                                {plan !== 'free' && (
                                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                                        Active
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-[12px] text-zinc-500">
                                {plan === 'free' ? currentPlan.blurb : `${currentPlan.price} / month · ${currentPlan.credits} credits / month`}
                            </p>
                        </div>
                    </div>
                    {renewalDate && plan !== 'free' && (
                        <div className={`flex-shrink-0 rounded-lg border px-2.5 py-1 text-[10px] tabular-nums ${
                            subscriptionCancelled
                                ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300'
                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
                        }`}>
                            {subscriptionCancelled ? `Active until ${renewalDate}` : `Renews ${renewalDate}`}
                        </div>
                    )}
                </div>

                {/* Credits */}
                <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                            <Coins className="h-4 w-4 self-center text-zinc-400" />
                            <span className="text-[28px] font-semibold tabular-nums text-white leading-none">
                                {credits !== null ? displayCredits.toLocaleString() : '—'}
                            </span>
                            <span className="text-[12px] text-zinc-500">credits</span>
                        </div>
                        {lowSeverity === 'low' && credits !== null && (
                            <span className="rounded-full border border-amber-500/25 bg-amber-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                Running low
                            </span>
                        )}
                    </div>
                    <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                lowSeverity === 'low' ? 'bg-amber-400' : lowSeverity === 'medium' ? 'bg-zinc-300' : 'bg-white'
                            }`}
                            style={{ width: `${creditsPct}%` }}
                        />
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                        1 credit = 1 AI message · {plan === 'free' ? 'upgrade to refill monthly' : 'resets each billing cycle'}
                    </p>
                </div>

                {/* Telegram bot ribbon */}
                {telegramBotEnabled && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                        <Bot className="h-3.5 w-3.5 text-zinc-300" />
                        <span className="text-[12px] text-zinc-300">Telegram bot access included</span>
                        <CheckCircle2 className="ml-auto h-3 w-3 text-zinc-500" />
                    </div>
                )}

                {/* Cancel control */}
                {plan !== 'free' && (
                    <div className="mt-4 border-t border-white/[0.05] pt-4">
                        {subscriptionCancelled ? (
                            <div className="flex items-center gap-2 text-[11.5px] text-amber-300">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Subscription cancelled — active until {renewalDate || 'end of billing period'}
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowCancelModal(true)}
                                className="text-[11.5px] font-medium text-zinc-400 transition-colors hover:text-red-300"
                            >
                                Cancel subscription
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* Plan grid */}
            <section className="space-y-3">
                <div className="flex items-end justify-between">
                    <div>
                        <h2 className="text-[13px] font-semibold text-white">
                            {plan === 'free' ? 'Choose a plan' : 'Change plan'}
                        </h2>
                        <p className="mt-0.5 text-[11.5px] text-zinc-500">
                            {plan === 'free' ? 'Upgrade to unlock AI credits.' : 'Switch to a different tier — credits prorate next cycle.'}
                        </p>
                    </div>
                    <span className="text-[10.5px] text-zinc-600">Cancel anytime</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                    {SUBSCRIPTION_PLANS.map((p) => {
                        const info = PLAN_CONFIG[p.key];
                        const isCurrent = p.key === plan;
                        const userEmail = session?.user?.email || '';
                        const returnUrl = getSafeRedirectUrl('/dashboard/plan?upgraded=true');
                        const checkoutUrl = userEmail
                            ? `https://checkout.dodopayments.com/buy/${p.productId}?email=${encodeURIComponent(userEmail)}&redirect_url=${encodeURIComponent(returnUrl)}`
                            : '';
                        const isUpgrade =
                            SUBSCRIPTION_PLANS.findIndex((x) => x.key === plan) <
                            SUBSCRIPTION_PLANS.findIndex((x) => x.key === p.key);
                        const Icon = info.icon;

                        return (
                            <article
                                key={p.key}
                                className={`relative flex flex-col rounded-2xl border p-5 transition-colors ${
                                    isCurrent
                                        ? 'border-cyan-400/30 bg-cyan-500/[0.04]'
                                        : 'border-white/[0.06] bg-[#0a0d12] hover:border-white/[0.12]'
                                }`}
                            >
                                {p.recommended && !isCurrent && (
                                    <span className="absolute -top-2.5 left-4 rounded-full border border-cyan-400/30 bg-cyan-500/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200">
                                        Recommended
                                    </span>
                                )}
                                {isCurrent && (
                                    <span className="absolute -top-2.5 left-4 rounded-full border border-cyan-400/30 bg-cyan-500/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200">
                                        Current
                                    </span>
                                )}

                                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02]">
                                    <Icon className="h-4 w-4 text-zinc-300" />
                                </div>
                                <h3 className="text-[15px] font-semibold text-white">{info.label}</h3>
                                <p className="mt-0.5 text-[11px] text-zinc-500">{info.blurb}</p>

                                <div className="mt-4 flex items-baseline gap-1">
                                    <span className="text-[28px] font-semibold tabular-nums text-white leading-none">
                                        {info.price}
                                    </span>
                                    <span className="text-[11px] text-zinc-500">/ mo</span>
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                                    {info.credits} AI credits / month
                                </div>

                                <div className="mt-4">
                                    {isCurrent ? (
                                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 text-center text-[11px] text-zinc-400">
                                            Active
                                        </div>
                                    ) : !checkoutUrl ? (
                                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 text-center text-[11px] text-zinc-500">
                                            Email required
                                        </div>
                                    ) : (
                                        <a
                                            href={checkoutUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition-colors ${
                                                p.recommended
                                                    ? 'bg-white text-black hover:bg-zinc-200'
                                                    : 'border border-white/[0.08] bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08] hover:border-white/[0.16]'
                                            }`}
                                        >
                                            {isUpgrade || plan === 'free' ? `Get ${info.label}` : `Switch to ${info.label}`}
                                            <ArrowRight className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>

                                <ul className="mt-4 space-y-2">
                                    {p.features.map((f, i) => {
                                        const isTelegram = f.toLowerCase().includes('telegram');
                                        return (
                                            <li key={i} className="flex items-start gap-2 text-[11.5px] text-zinc-300">
                                                {isTelegram ? (
                                                    <Bot className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-300" />
                                                ) : (
                                                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
                                                )}
                                                <span>{f}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </article>
                        );
                    })}
                </div>
                <p className="text-center text-[10.5px] text-zinc-600">
                    Secure payments by Dodo Payments
                </p>
            </section>

            {/* Credit usage history */}
            <CreditUsageHistory />

            {/* Cancel modal */}
            {showCancelModal && (
                <CancelSubscriptionModal
                    planLabel={currentPlan.label}
                    renewalDate={renewalDate}
                    cancelling={cancelling}
                    cancelError={cancelError}
                    onClose={() => { setShowCancelModal(false); setCancelError(null); }}
                    onConfirm={handleCancelSubscription}
                />
            )}
        </div>
    );
}

/* ───────────────────────────────────────────────────────────────────
 * Subcomponents
 * ──────────────────────────────────────────────────────────────────── */

function Banner({ tone, title, body, onClose }: { tone: 'success' | 'warning'; title: string; body: string; onClose?: () => void }) {
    const cls = tone === 'success'
        ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
        : 'border-amber-500/20 bg-amber-500/[0.05]';
    const icon = tone === 'success'
        ? <CheckCircle2 className="h-4 w-4 text-emerald-300 flex-shrink-0" />
        : <AlertTriangle className="h-4 w-4 text-amber-300 flex-shrink-0" />;
    return (
        <div className={`flex items-start gap-3 rounded-xl border ${cls} px-4 py-3`}>
            {icon}
            <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-zinc-100">{title}</p>
                <p className="mt-0.5 text-[11.5px] text-zinc-400">{body}</p>
            </div>
            {onClose && (
                <button onClick={onClose} className="flex-shrink-0 text-zinc-500 hover:text-zinc-300" aria-label="Dismiss">
                    <X className="h-3.5 w-3.5" />
                </button>
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
        } catch { /* ignore */ }
        return [];
    });

    return (
        <section className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <History className="h-3 w-3" />
                Recent activity
            </h2>
            {history.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-zinc-600">
                    No activity yet — credits are tracked as you use AI features.
                </p>
            ) : (
                <ul className="max-h-[220px] space-y-0 overflow-y-auto divide-y divide-white/[0.04]">
                    {history.slice(-20).reverse().map((entry, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-zinc-500 tabular-nums w-12 flex-shrink-0">
                                    {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                <span className="text-zinc-300 truncate">{entry.action}</span>
                            </div>
                            <span className={`font-medium tabular-nums flex-shrink-0 ${entry.amount < 0 ? 'text-zinc-300' : 'text-emerald-300'}`}>
                                {entry.amount > 0 ? '+' : ''}{entry.amount}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function CancelSubscriptionModal({
    planLabel, renewalDate, cancelling, cancelError, onClose, onConfirm,
}: {
    planLabel: string;
    renewalDate: string | null;
    cancelling: boolean;
    cancelError: string | null;
    onClose: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0a0d12] p-5 shadow-2xl shadow-black/60">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/[0.08]">
                        <AlertTriangle className="h-4 w-4 text-amber-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-white">Cancel subscription?</h3>
                        <p className="mt-0.5 text-[11.5px] text-zinc-500">Stops future renewals — your plan stays active until the end of the cycle.</p>
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-[12px] text-zinc-300">
                    Your <span className="font-semibold text-white">{planLabel}</span> plan stays active until{' '}
                    <span className="font-medium text-white">{renewalDate || 'the end of your billing period'}</span>.
                    After that you'll be downgraded to Free. Remaining credits stay usable until then.
                </div>

                {cancelError && (
                    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11.5px] text-red-300">
                        {cancelError}
                    </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                    <button
                        onClick={onClose}
                        disabled={cancelling}
                        className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]"
                    >
                        Keep my plan
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={cancelling}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] py-2 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/[0.15]"
                    >
                        {cancelling ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Cancelling…</>
                        ) : (
                            'Cancel subscription'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
