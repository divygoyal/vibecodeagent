'use client';

import Link from 'next/link';
import { Coins, Sparkles, ArrowUpRight } from 'lucide-react';

interface CreditsCardProps {
    credits: number | null;
    plan: 'free' | 'starter' | 'growth' | 'pro' | string;
    /** When true (collapsed sidebar), render the compact icon-only pill instead. */
    collapsed?: boolean;
    /** When true, applies mobile-touch sizing (min-h-44, larger fonts). */
    mobile?: boolean;
    /** Closes the mobile drawer when the upgrade link is clicked. */
    onNavigate?: () => void;
}

/**
 * Sticky credits card shown directly below the Settings link in the sidebar.
 *
 * Replaces the older "973 msgs" pill with a more useful surface: shows the
 * actual remaining credits, a progress bar, plan badge, and an Upgrade CTA
 * when the user is on Free or running low.
 *
 * Severity coloring:
 *   - < 20 credits  → red (running out)
 *   - < 50 credits  → amber (warn)
 *   - else          → cyan (healthy)
 */
export function CreditsCard({ credits, plan, collapsed = false, mobile = false, onNavigate }: CreditsCardProps) {
    if (credits === null) return null;

    const planMax = plan === 'pro' ? 300 : plan === 'growth' ? 150 : plan === 'starter' ? 50 : 20;
    const pct = planMax > 0 ? Math.max(0, Math.min(100, (credits / planMax) * 100)) : 0;
    const severity: 'low' | 'medium' | 'ok' = credits < 20 ? 'low' : credits < 50 ? 'medium' : 'ok';
    const isFree = plan === 'free';

    // Collapsed sidebar — show only the icon pill
    if (collapsed) {
        return (
            <Link
                href="/dashboard/plan"
                title={`${credits} credits — ${plan}`}
                onClick={onNavigate}
                className={`flex items-center justify-center py-2 rounded-2xl border transition-all hover:opacity-80 ${
                    severity === 'low'
                        ? 'bg-red-500/[0.08] border-red-500/[0.15]'
                        : severity === 'medium'
                            ? 'bg-amber-500/[0.08] border-amber-500/[0.15]'
                            : 'bg-[#14C4E1]/[0.08] border-[#14C4E1]/[0.18]'
                }`}
            >
                <Coins className={`w-4 h-4 ${severity === 'low' ? 'text-red-400' : severity === 'medium' ? 'text-amber-400' : 'text-[#7AD9DA]'}`} />
            </Link>
        );
    }

    const trackBg = severity === 'low'
        ? 'bg-red-500/15'
        : severity === 'medium'
            ? 'bg-amber-500/15'
            : 'bg-[#14C4E1]/15';
    const fillBg = severity === 'low'
        ? 'bg-red-400'
        : severity === 'medium'
            ? 'bg-amber-400'
            : 'bg-[#7AD9DA]';
    const accentText = severity === 'low'
        ? 'text-red-300'
        : severity === 'medium'
            ? 'text-amber-300'
            : 'text-[#7AD9DA]';
    const ctaLabel = isFree ? 'Upgrade & unlock AI' : severity === 'low' ? 'Add credits' : severity === 'medium' ? 'Top up plan' : 'Manage plan';
    const showCta = isFree || severity !== 'ok';

    return (
        <Link
            href="/dashboard/plan"
            onClick={onNavigate}
            className={`group block rounded-2xl border bg-white/[0.02] hover:bg-white/[0.04] transition-all overflow-hidden ${
                severity === 'low'
                    ? 'border-red-500/[0.20] shadow-[0_0_0_1px_rgba(248,113,113,0.05)_inset]'
                    : severity === 'medium'
                        ? 'border-amber-500/[0.18] shadow-[0_0_0_1px_rgba(251,191,36,0.05)_inset]'
                        : 'border-white/[0.07]'
            } ${mobile ? '' : ''}`}
        >
            <div className={`px-3 ${mobile ? 'py-3' : 'py-2.5'}`}>
                {/* Header: credits big number + plan badge */}
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                        <Coins className={`w-3.5 h-3.5 self-center flex-shrink-0 ${accentText}`} />
                        <span className={`${mobile ? 'text-base' : 'text-[15px]'} font-bold tabular-nums leading-none ${accentText}`}>
                            {credits.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-zinc-500 leading-none">credits</span>
                    </div>
                    <span className={`text-[8.5px] font-bold uppercase tracking-wider leading-none px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                        plan === 'pro' ? 'bg-violet-500/15 text-violet-300'
                        : plan === 'growth' ? 'bg-cyan-500/15 text-[#7AD9DA]'
                        : plan === 'starter' ? 'bg-blue-500/15 text-blue-300'
                        : 'bg-zinc-700/40 text-zinc-400'
                    }`}>
                        {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : plan === 'growth' ? 'Growth' : 'Pro'}
                    </span>
                </div>

                {/* Progress bar */}
                <div className={`h-1 w-full rounded-full overflow-hidden ${trackBg}`}>
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${fillBg}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>

                {/* Sub-line: out-of total OR upgrade nudge */}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-zinc-500 tabular-nums">
                        {isFree ? 'No AI credits on Free' : `of ${planMax} this cycle`}
                    </span>
                    {severity === 'low' && !isFree && (
                        <span className="text-red-400 font-medium">Running out</span>
                    )}
                </div>
            </div>

            {/* CTA strip — visible when free OR running low/medium */}
            {showCta && (
                <div className={`flex items-center justify-between gap-2 px-3 py-2 border-t ${
                    isFree
                        ? 'border-violet-500/[0.15] bg-gradient-to-r from-violet-500/[0.06] to-cyan-500/[0.06]'
                        : severity === 'low'
                            ? 'border-red-500/[0.15] bg-red-500/[0.04]'
                            : 'border-amber-500/[0.15] bg-amber-500/[0.04]'
                }`}>
                    <span className={`text-[10.5px] font-semibold flex items-center gap-1 ${
                        isFree ? 'text-violet-300' : severity === 'low' ? 'text-red-300' : 'text-amber-300'
                    }`}>
                        {isFree && <Sparkles className="w-3 h-3" />}
                        {ctaLabel}
                    </span>
                    <ArrowUpRight className={`w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                        isFree ? 'text-violet-400' : severity === 'low' ? 'text-red-400' : 'text-amber-400'
                    }`} />
                </div>
            )}
        </Link>
    );
}
