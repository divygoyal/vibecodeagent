'use client';

import { useSession } from 'next-auth/react';
import { getSafeRedirectUrl } from '@/lib/checkout';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    CheckCircle2, Coins, Bot, Zap, TrendingUp, Shield,
    History, AlertTriangle, X, Loader2, ArrowRight, Check,
    Minus, Sparkles, Lightbulb, GitBranch, Users, Globe, Layers,
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
    /** Short tagline shown under the plan name. */
    blurb: string;
    /** "Best for" persona — drives the green tag at the top of each card. */
    bestFor: string;
    /** Per-message cost for credit-economics framing on the page. */
    costPerMsg: string;
    /** Cost framing — what you'd typically save vs. agency fees / tools at this tier. */
    valueLine: string;
}

const PLAN_CONFIG: Record<string, PlanInfo> = {
    free: {
        label: 'Free', icon: Zap, credits: 0, price: '$0',
        blurb: 'Browse the dashboard — no AI',
        bestFor: 'Trying TrafficClaw',
        costPerMsg: '—',
        valueLine: 'See your data; AI is locked',
    },
    starter: {
        label: 'Starter', icon: Zap, credits: 50, price: '$9',
        blurb: 'Solo founders, side projects',
        bestFor: 'Indie maker · 1 site',
        costPerMsg: '$0.18 / AI message',
        valueLine: 'One CTR fix from this tier ≈ recovers your $9 in week one',
    },
    growth: {
        label: 'Growth', icon: TrendingUp, credits: 150, price: '$19',
        blurb: 'Small businesses scaling SEO',
        bestFor: 'Founder + ops · up to 3 sites',
        costPerMsg: '$0.13 / AI message',
        valueLine: '$19/mo replaces $200/mo of analyst tools — 3× the volume of Starter for 2× the price',
    },
    pro: {
        label: 'Pro', icon: Shield, credits: 300, price: '$29',
        blurb: 'Agencies, serious operators',
        bestFor: 'Multi-site · agency · power users',
        costPerMsg: '$0.10 / AI message',
        valueLine: 'Cheapest per-message tier + Telegram bot for daily mobile alerts',
    },
};

/** Detailed feature list per tier — drives the card bullets AND the comparison table. */
const SUBSCRIPTION_PLANS = [
    {
        key: 'starter',
        productId: 'pdt_0NaLMLyWwiO355QaGlQwq',
        features: [
            { label: '50 AI credits / month', highlight: true, icon: Coins },
            { label: 'Full dashboard (analytics + SEO)', icon: Layers },
            { label: 'AEO & schema audits', icon: Sparkles },
            { label: 'Site audit reports (50+ checks)', icon: Check },
            { label: '1 connected site', icon: Globe },
            { label: 'Daily AI briefing', icon: Zap },
            { label: 'Email support', icon: Users },
        ],
    },
    {
        key: 'growth',
        productId: 'pdt_0NaLMM1bLW9wAbmxcsebm',
        features: [
            { label: '150 AI credits / month', highlight: true, icon: Coins },
            { label: 'Everything in Starter', icon: Check },
            { label: 'Priority AI queue (faster responses)', icon: Zap },
            { label: 'Up to 3 connected sites', icon: Globe },
            { label: 'Cross-source insights (Deploy ↔ Traffic)', icon: GitBranch },
            { label: 'Strategic root-cause diagnoses', icon: Lightbulb },
            { label: 'Surprise-engine cross-source insights', icon: Sparkles },
        ],
        recommended: true,
    },
    {
        key: 'pro',
        productId: 'pdt_0NaLMM4r23kncRahthuyj',
        features: [
            { label: '300 AI credits / month', highlight: true, icon: Coins },
            { label: 'Everything in Growth', icon: Check },
            { label: 'Telegram bot — alerts on the go', highlight: true, icon: Bot },
            { label: 'Unlimited connected sites', icon: Globe },
            { label: 'Priority support (24h response)', icon: Users },
            { label: 'Beta features (early access)', icon: Sparkles },
            { label: 'Cheapest per-message rate ($0.10)', icon: TrendingUp },
        ],
        telegramBot: true,
    },
];

/** Comparison matrix — drives the side-by-side table below the cards.
 *  `value` per plan is either a string (rendered as text) or boolean (✓ / —). */
const COMPARISON_GROUPS: Array<{
    title: string;
    rows: Array<{ feature: string; free: string | boolean; starter: string | boolean; growth: string | boolean; pro: string | boolean }>;
}> = [
    {
        title: 'AI capabilities',
        rows: [
            { feature: 'AI credits / month', free: '0', starter: '50', growth: '150', pro: '300' },
            { feature: 'Cost per AI message', free: '—', starter: '$0.18', growth: '$0.13', pro: '$0.10' },
            { feature: 'Strategic diagnoses (root-cause)', free: false, starter: 'Basic', growth: 'Full', pro: 'Full' },
            { feature: 'Cross-source insights (deploy × traffic)', free: false, starter: false, growth: true, pro: true },
            { feature: 'Surprise-engine "did you know" findings', free: false, starter: 'Limited', growth: true, pro: true },
            { feature: 'AI response priority', free: '—', starter: 'Standard', growth: 'Priority', pro: 'Priority' },
        ],
    },
    {
        title: 'Data & coverage',
        rows: [
            { feature: 'Connected sites', free: '1', starter: '1', growth: '3', pro: 'Unlimited' },
            { feature: 'GA4 + Search Console', free: true, starter: true, growth: true, pro: true },
            { feature: 'Schema / AEO visibility audit', free: false, starter: true, growth: true, pro: true },
            { feature: 'Page-level CWV / PageSpeed batch', free: false, starter: 'On-demand', growth: 'Auto-cached', pro: 'Auto-cached' },
            { feature: 'Cohort retention + journey analysis', free: false, starter: false, growth: true, pro: true },
            { feature: 'GitHub deploy correlation', free: false, starter: false, growth: true, pro: true },
        ],
    },
    {
        title: 'Workflow & alerts',
        rows: [
            { feature: 'Daily AI briefing', free: false, starter: true, growth: true, pro: true },
            { feature: 'Site audit reports (50+ checks)', free: 'View only', starter: true, growth: true, pro: true },
            { feature: 'Telegram bot — mobile alerts', free: false, starter: false, growth: false, pro: true },
            { feature: 'Beta feature access', free: false, starter: false, growth: false, pro: true },
        ],
    },
    {
        title: 'Support',
        rows: [
            { feature: 'Email support', free: false, starter: true, growth: true, pro: true },
            { feature: 'Priority response (24h)', free: false, starter: false, growth: false, pro: true },
            { feature: 'Cancel anytime', free: true, starter: true, growth: true, pro: true },
        ],
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
                                        : p.recommended
                                            ? 'border-cyan-400/20 bg-[#0a0d12] hover:border-cyan-400/40 ring-1 ring-cyan-500/[0.08]'
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
                                <p className="mt-1.5 text-[10.5px] text-emerald-300/90 font-medium uppercase tracking-wide">
                                    Best for: <span className="text-emerald-200/90 normal-case font-semibold">{info.bestFor}</span>
                                </p>

                                <div className="mt-4 flex items-baseline gap-1">
                                    <span className="text-[28px] font-semibold tabular-nums text-white leading-none">
                                        {info.price}
                                    </span>
                                    <span className="text-[11px] text-zinc-500">/ mo</span>
                                </div>
                                <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                                    {info.credits} AI credits / month
                                </div>
                                <div className="mt-0.5 text-[10.5px] text-zinc-500">
                                    {info.costPerMsg}
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
                                        const FeatureIcon = f.icon || Check;
                                        return (
                                            <li
                                                key={i}
                                                className={`flex items-start gap-2 text-[11.5px] ${
                                                    f.highlight ? 'text-zinc-100 font-medium' : 'text-zinc-300'
                                                }`}
                                            >
                                                <FeatureIcon
                                                    className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${
                                                        f.highlight ? 'text-cyan-300' : 'text-zinc-500'
                                                    }`}
                                                />
                                                <span>{f.label}</span>
                                            </li>
                                        );
                                    })}
                                </ul>

                                {/* Per-tier value framing — helps the user judge ROI */}
                                <p className="mt-4 pt-4 border-t border-white/[0.05] text-[10.5px] leading-relaxed text-zinc-500">
                                    {info.valueLine}
                                </p>
                            </article>
                        );
                    })}
                </div>
                <p className="text-center text-[10.5px] text-zinc-600">
                    Secure payments by Dodo Payments · Cancel anytime · Switch tiers freely
                </p>
            </section>

            {/* Compare-everything table — clearer side-by-side decision-making */}
            <ComparisonTable currentPlan={plan} />

            {/* Plan FAQ — addresses the questions that keep users from upgrading */}
            <PlanFaq />

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

function ComparisonTable({ currentPlan }: { currentPlan: string }) {
    // Highlight the user's current plan column so they can see what they have at a glance.
    const currentCol = currentPlan === 'starter' ? 'starter'
        : currentPlan === 'growth' ? 'growth'
        : currentPlan === 'pro' ? 'pro'
        : 'free';

    const renderCell = (val: string | boolean) => {
        if (val === true) return <Check className="h-3.5 w-3.5 text-emerald-300 mx-auto" />;
        if (val === false) return <Minus className="h-3.5 w-3.5 text-zinc-700 mx-auto" />;
        return <span className="tabular-nums text-zinc-200">{val}</span>;
    };

    const colHeader = (key: 'free' | 'starter' | 'growth' | 'pro', label: string) => (
        <th
            key={key}
            className={`px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${
                currentCol === key
                    ? 'bg-cyan-500/[0.06] text-[#7AD9DA] border-b border-cyan-400/30'
                    : 'text-zinc-400 border-b border-white/[0.06]'
            }`}
        >
            <div className="flex flex-col items-center gap-0.5">
                <span>{label}</span>
                {currentCol === key && (
                    <span className="text-[8.5px] font-bold tracking-wider rounded-full bg-cyan-400/15 text-cyan-200 px-1.5 py-0">
                        Your plan
                    </span>
                )}
            </div>
        </th>
    );

    return (
        <section className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.05]">
                <h2 className="text-[13px] font-semibold text-white">Compare every feature</h2>
                <p className="mt-0.5 text-[11.5px] text-zinc-500">Pick the tier that matches your scale — switch up or down anytime.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[640px]">
                    <thead>
                        <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">Feature</th>
                            {colHeader('free', 'Free')}
                            {colHeader('starter', 'Starter $9')}
                            {colHeader('growth', 'Growth $19')}
                            {colHeader('pro', 'Pro $29')}
                        </tr>
                    </thead>
                    <tbody>
                        {COMPARISON_GROUPS.flatMap((group) => [
                            <tr key={`group-${group.title}`}>
                                <td colSpan={5} className="px-4 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 bg-white/[0.01]">
                                    {group.title}
                                </td>
                            </tr>,
                            ...group.rows.map((row, i) => (
                                <tr key={`${group.title}-${i}`} className="border-t border-white/[0.04]">
                                    <td className="px-4 py-2.5 text-zinc-300">{row.feature}</td>
                                    <td className={`px-3 py-2.5 text-center ${currentCol === 'free' ? 'bg-cyan-500/[0.03]' : ''}`}>{renderCell(row.free)}</td>
                                    <td className={`px-3 py-2.5 text-center ${currentCol === 'starter' ? 'bg-cyan-500/[0.03]' : ''}`}>{renderCell(row.starter)}</td>
                                    <td className={`px-3 py-2.5 text-center ${currentCol === 'growth' ? 'bg-cyan-500/[0.03]' : ''}`}>{renderCell(row.growth)}</td>
                                    <td className={`px-3 py-2.5 text-center ${currentCol === 'pro' ? 'bg-cyan-500/[0.03]' : ''}`}>{renderCell(row.pro)}</td>
                                </tr>
                            )),
                        ])}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
    {
        q: 'What counts as one credit?',
        a: 'One AI message = one credit. Tool calls (audits, schema checks, GA4 reports) inside a message are free — only the user-visible message counts. Briefings + auto-generated insights also use credits.',
    },
    {
        q: 'What happens to my credits if I cancel or downgrade?',
        a: 'Cancellation keeps your plan active until the end of the billing cycle — credits stay usable. Downgrades take effect at the next renewal; remaining credits roll into the new tier (capped at the new monthly limit).',
    },
    {
        q: 'Can I upgrade mid-cycle?',
        a: 'Yes — upgrades are instant and prorated. New credits land in your account within seconds of payment.',
    },
    {
        q: 'Why pick Growth over Starter?',
        a: '3× the credits at 2× the price ($0.13 vs $0.18 per message), priority AI queue, cross-source insights (deploy ↔ traffic), and up to 3 sites. The line where most growing businesses land.',
    },
    {
        q: 'Why pick Pro over Growth?',
        a: 'Telegram bot for mobile alerts, unlimited sites, cheapest per-message rate ($0.10), priority support, and beta-feature early access. Built for agencies and operators running multiple properties.',
    },
    {
        q: 'Is the data secure?',
        a: 'OAuth tokens stay encrypted server-side. Payments handled by Dodo Payments — we never see your card. Your GA4/GSC data is read-only and never shared.',
    },
];

function PlanFaq() {
    return (
        <section className="rounded-2xl border border-white/[0.06] bg-[#0a0d12] p-5">
            <h2 className="text-[13px] font-semibold text-white">Frequently asked</h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">If something's unclear, ask — credits are flexible.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {FAQ_ITEMS.map((item, i) => (
                    <details key={i} className="group rounded-xl border border-white/[0.05] bg-white/[0.015] open:border-white/[0.10] transition-colors">
                        <summary className="cursor-pointer list-none px-4 py-3 flex items-start justify-between gap-3 text-[12px] font-medium text-zinc-200 hover:text-white">
                            <span>{item.q}</span>
                            <span className="flex-shrink-0 text-zinc-500 group-open:rotate-45 transition-transform text-base leading-none">+</span>
                        </summary>
                        <p className="px-4 pb-3.5 text-[11.5px] leading-relaxed text-zinc-400">{item.a}</p>
                    </details>
                ))}
            </div>
        </section>
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
