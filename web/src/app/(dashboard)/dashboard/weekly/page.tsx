'use client';

/**
 * Weekly Briefing page — Wave 2 / Track 2 of the WEEKLY_BRIEFING_UI_PLAN.
 *
 * Renders the user's last N weekly digest summaries as a tab strip, with
 * the selected week's full briefing (or empty-week fallback) below.
 *
 * Tier model (mirrors plan/page.tsx free-vs-paid pattern):
 *   - Free:        last 8 weeks visible, with "Upgrade for 26 weeks" CTA
 *   - Starter+:    last 26 weeks visible (capped by admin's WEEKLY_DIGEST_RETENTION_WEEKS)
 *
 * The page is self-sufficient — it reuses the workspace context already
 * provided by the dashboard layout (selectedSite + isDemoWorkspace) so
 * the user can switch workspaces from the sidebar and the briefing
 * follows.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { AlertCircle, ArrowRight, MessageSquare, Sparkles } from 'lucide-react';

import EmptyState, { ConnectGoogleState } from '@/components/EmptyState';
import { useContainerStatus, useCredits } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import WeekTabs from '@/components/weekly/WeekTabs';
import WeekSummary from '@/components/weekly/WeekSummary';
import EmptyWeekState from '@/components/weekly/EmptyWeekState';
import {
    digestKey,
    fetchWeeklyDigestDetail,
    fetchWeeklyDigestList,
    isQuietWeek,
    parseDigestKey,
    type DigestDetail,
    type DigestSummary,
} from '@/lib/weeklyDigestClient';

// Tier semantics — mirrors the upgrade copy in the layout sidebar.
const FREE_TIER_LIMIT = 8;
const PAID_TIER_LIMIT = 26;

export default function WeeklyBriefingPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { plan: userPlan } = useCredits();
    const { selectedSite, isDemoWorkspace } = useRegistration();
    const isFree = userPlan === 'free';
    const visibleLimit = isFree ? FREE_TIER_LIMIT : PAID_TIER_LIMIT;

    const [weeks, setWeeks] = useState<DigestSummary[]>([]);
    const [weeksLoading, setWeeksLoading] = useState(true);
    const [weeksError, setWeeksError] = useState<string | null>(null);

    const [selectedKey, setSelectedKey] = useState<string>('');
    const [detail, setDetail] = useState<DigestDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // Filter the weeks list by current site_url where possible. Admin returns
    // ALL weeks for the user if site_url is omitted; we keep that behavior
    // and let the user-side filtering happen here so the user can still see
    // historical weeks if they switch workspace.
    const visibleWeeks = useMemo(() => weeks.slice(0, visibleLimit), [weeks, visibleLimit]);

    // ─── Load week list ───
    const loadList = useCallback(async () => {
        if (!hasGoogleConnection && !isDemoWorkspace) {
            setWeeksLoading(false);
            return;
        }
        setWeeksLoading(true);
        setWeeksError(null);
        try {
            const list = await fetchWeeklyDigestList(visibleLimit, selectedSite || undefined);
            setWeeks(list);
            // Default-select the most-recent week if none is selected, or if
            // the previously-selected key is no longer in the list (e.g. after
            // a workspace switch).
            if (list.length > 0) {
                const stillVisible = selectedKey && list.some(w => digestKey(w.year, w.iso_week) === selectedKey);
                if (!stillVisible) {
                    setSelectedKey(digestKey(list[0].year, list[0].iso_week));
                }
            } else {
                setSelectedKey('');
            }
        } catch (err) {
            setWeeksError(err instanceof Error ? err.message : 'Failed to load weekly briefings');
            setWeeks([]);
        } finally {
            setWeeksLoading(false);
        }
    // selectedKey deliberately omitted from deps — we manage its default
    // selection inside this effect and re-running on selectedKey would
    // double-fetch on every tab click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasGoogleConnection, isDemoWorkspace, visibleLimit, selectedSite]);

    useEffect(() => { void loadList(); }, [loadList]);

    // ─── Load detail for selected week ───
    useEffect(() => {
        if (!selectedKey) {
            setDetail(null);
            return;
        }
        const parsed = parseDigestKey(selectedKey);
        if (!parsed) {
            setDetail(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        setDetailError(null);
        (async () => {
            try {
                const d = await fetchWeeklyDigestDetail(parsed.year, parsed.isoWeek, selectedSite || undefined);
                if (!cancelled) setDetail(d);
            } catch (err) {
                if (!cancelled) {
                    setDetail(null);
                    setDetailError(err instanceof Error ? err.message : 'Failed to load week detail');
                }
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [selectedKey, selectedSite]);

    // ─── Render branches ───

    // 1) Not connected to Google → reuse SEO page's pattern.
    if (!containerLoading && !hasGoogleConnection && !isDemoWorkspace) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <ConnectGoogleState feature="your weekly AI briefing" />
            </div>
        );
    }

    // 2) Initial loading — show skeleton-ish empty state. We avoid the
    //    full-bleed loader because the page already gets a Next.js loading
    //    boundary.
    if ((weeksLoading || containerLoading) && weeks.length === 0) {
        return (
            <div className="min-h-[60vh]">
                <EmptyState
                    variant="loading"
                    title="Loading your weekly briefings…"
                    description="Pulling the most recent weeks from your account"
                />
            </div>
        );
    }

    // 3) Hard error — never crash, always show a friendly recovery path.
    if (weeksError && weeks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center max-w-md mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white mb-2">Couldn&apos;t load weekly briefings</h2>
                    <p className="text-sm text-zinc-400 mb-1">
                        We&apos;ll keep trying — this usually resolves in a few minutes.
                    </p>
                    <p className="text-xs text-zinc-600 mt-2">Error: {weeksError}</p>
                </div>
                <div className="flex flex-col gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => void loadList()}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                    >
                        Try again
                    </button>
                    <button
                        type="button"
                        onClick={() => signIn('google')}
                        className="text-xs text-emerald-400 hover:underline"
                    >
                        Or re-connect your Google account →
                    </button>
                </div>
            </div>
        );
    }

    // 4) First-time / no digests yet — friendly onboarding state.
    if (!weeksLoading && weeks.length === 0) {
        return (
            <div className="space-y-6">
                <Header isFree={isFree} />
                <div className="flex flex-col items-center justify-center text-center py-16 max-w-xl mx-auto space-y-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#14C4E1]/16 to-[#7AD9DA]/16 border border-[#14C4E1]/22 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-[#7AD9DA]" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white">
                            Your first weekly briefing arrives Monday
                        </h2>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            We generate a personalized briefing every Monday morning — a one-liner headline,
                            the three things to do this week, and the metrics that actually moved.
                        </p>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Want a one-shot summary now? Ask the AI for this week&apos;s update.
                        </p>
                    </div>
                    <Link
                        href="/dashboard/ai-chat?q=Give%20me%20this%20week%27s%20update%20%E2%80%94%20what%20moved%2C%20what%20to%20do%20next%2C%20and%20any%20wins%20or%20losses%20I%20should%20know%20about."
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                    >
                        <MessageSquare className="w-4 h-4" />
                        Ask AI for this week&apos;s update
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>
        );
    }

    // 5) Normal path — list of weeks + selected week's detail.
    const quiet = isQuietWeek(detail);

    return (
        <div className="space-y-8">
            <Header isFree={isFree} />

            <WeekTabs
                weeks={visibleWeeks}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                showUpgradeHint={isFree && weeks.length >= FREE_TIER_LIMIT}
                onUpgradeClick={() => { window.location.href = '/dashboard/plan'; }}
            />

            {/* Detail pane */}
            <div className="min-h-[40vh]">
                {detailLoading ? (
                    <EmptyState
                        variant="loading"
                        title="Loading week detail…"
                        description="Reading the snapshot from your archive"
                    />
                ) : detailError ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] p-5 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="text-sm font-semibold text-amber-100 mb-1">
                                Couldn&apos;t load this week&apos;s detail
                            </div>
                            <p className="text-xs text-amber-200/80 leading-relaxed">{detailError}</p>
                        </div>
                    </div>
                ) : quiet ? (
                    <EmptyWeekState digest={detail} />
                ) : detail ? (
                    <WeekSummary digest={detail} />
                ) : (
                    <EmptyWeekState digest={null} />
                )}
            </div>
        </div>
    );
}

/* ─── Page header ─── */
function Header({ isFree }: { isFree: boolean }) {
    return (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500 font-medium mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#7AD9DA]" />
                    Weekly briefing
                </div>
                <h1 className="text-2xl font-bold text-white">
                    What changed this week
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                    A short, action-oriented recap delivered every Monday — pick a week to read it again.
                </p>
            </div>
            {isFree ? (
                <Link
                    href="/dashboard/plan"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/22 bg-gradient-to-r from-violet-500/[0.08] to-purple-500/[0.08] text-xs font-medium text-violet-200 hover:border-violet-500/40 transition-all"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Free plan: last {FREE_TIER_LIMIT} weeks · upgrade for {PAID_TIER_LIMIT}
                </Link>
            ) : null}
        </header>
    );
}
