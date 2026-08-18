'use client';

/**
 * EmptyWeekState — fallback for "quiet" weeks with no notable changes.
 *
 * Shown when:
 *   - The selected week's digest has no headline / action items, or
 *   - The headline includes "quiet week" / "no significant changes" markers
 *     (see isQuietWeek() in lib/weeklyDigestClient.ts), or
 *   - The digest itself is null (week not yet generated).
 *
 * Renders:
 *   - Friendly "Quiet week" message
 *   - Striking-distance keywords (pos 11-15) pulled from the snapshot
 *     if present — these are the "almost moved" candidates
 *   - CTA to run a URL audit for new opportunities
 */

import Link from 'next/link';
import { Coffee, Target, ArrowRight, Sparkles } from 'lucide-react';
import type { DigestDetail } from '@/lib/weeklyDigestClient';

interface EmptyWeekStateProps {
    digest: DigestDetail | null;
}

function fmtNum(n: number | null | undefined): string {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

export default function EmptyWeekState({ digest }: EmptyWeekStateProps) {
    const snapshot = digest?.snapshot;
    const queries = snapshot?.queries || snapshot?.topQueries || [];

    // Striking distance: queries at positions 11-15 with ≥50 impressions.
    // These are the "one good edit away from clicks" candidates.
    const strikingDistance = queries
        .filter((q) => {
            const pos = typeof q.position === 'number' ? q.position : 0;
            const imps = typeof q.impressions === 'number' ? q.impressions : 0;
            return pos >= 11 && pos <= 15 && imps >= 50;
        })
        .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
        .slice(0, 5);

    const weekLabel = digest ? `Week ${digest.iso_week}, ${digest.year}` : 'This week';

    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="space-y-3 text-center max-w-xl mx-auto pt-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#14C4E1]/12 to-[#7AD9DA]/12 border border-[#14C4E1]/20 mx-auto">
                    <Coffee className="w-7 h-7 text-[#7AD9DA]" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold leading-tight bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
                    Quiet week — here&apos;s what almost moved
                </h1>
                <p className="text-sm text-zinc-400 leading-relaxed">
                    Nothing dramatic happened in {weekLabel}. That&apos;s a good time to pick at the queries
                    sitting just outside page 1 — small edits compound.
                </p>
            </header>

            {/* Striking distance section */}
            {strikingDistance.length > 0 ? (
                <section>
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-3 flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-[#7AD9DA]" />
                        Striking distance keywords
                    </h2>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <ul className="divide-y divide-white/[0.04]">
                            {strikingDistance.map((q, i) => (
                                <li key={i} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm text-white font-medium truncate" title={q.query}>
                                            {q.query}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 mt-0.5">
                                            pos {typeof q.position === 'number' ? q.position.toFixed(1) : '—'}{' '}
                                            · {fmtNum(q.impressions)} impressions
                                        </div>
                                    </div>
                                    <Link
                                        href={`/dashboard/ai-chat?q=${encodeURIComponent(`How do I move "${q.query}" from position ${q.position?.toFixed(1)} into the top 10?`)}`}
                                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#14C4E1]/22 bg-[#14C4E1]/12 text-xs font-medium text-[#7AD9DA] hover:bg-[#14C4E1]/20 transition-colors"
                                    >
                                        Ask AI
                                        <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            ) : null}

            {/* Audit CTA */}
            <section className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white mb-1">
                            Try a URL audit to find new opportunities
                        </h3>
                        <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                            Audit any URL — your own or a competitor&apos;s — to spot specific fixes you can
                            ship this week.
                        </p>
                        <Link
                            href="/dashboard/audit"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                        >
                            Open URL audit
                            <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
