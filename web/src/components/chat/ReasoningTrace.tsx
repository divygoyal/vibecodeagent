'use client';

import { memo, useEffect, useState } from 'react';

/**
 * Claude-style live reasoning trace.
 *
 * Instead of a static pulsing orb with cycling phrases, this component shows
 * an actual narration of what the model is doing — a growing list of lines
 * that fade in as events arrive (planning → tool starts → tool results →
 * streamed reasoning text).
 *
 * Lines are passed in via props (parent owns the array — built up from SSE
 * events). Each line gets a soft fade-in so the trace feels alive.
 *
 * Visual:
 *   • Italic muted text on a subtle vertical guide (3px left rule)
 *   • Active line gets a blinking caret
 *   • Empty trace falls back to a cycling placeholder so the user always
 *     has something to watch
 */

const FALLBACK_PHRASES = [
    'Reading the question…',
    'Pulling your data…',
    'Crunching numbers…',
    'Looking for patterns…',
    'Connecting the dots…',
    'Drafting the verdict…',
] as const;

export interface TraceLine {
    text: string;
    /** Used for stable React keys when lines stream in. */
    id: string;
}

interface ReasoningTraceProps {
    lines: TraceLine[];
    /** True while the assistant is still working — drives fallback phrase
     *  cycling and the blinking caret on the latest line. */
    active: boolean;
}

export const ReasoningTrace = memo(function ReasoningTrace({ lines, active }: ReasoningTraceProps) {
    const [phase, setPhase] = useState(0);
    useEffect(() => {
        if (!active || lines.length > 0) return;
        const t = setInterval(() => setPhase(p => (p + 1) % FALLBACK_PHRASES.length), 2200);
        return () => clearInterval(t);
    }, [active, lines.length]);

    // Show a fallback cycling phrase only when there are no real lines yet.
    // Cap to LAST 3 lines so the trace doesn't grow into a wall of text on
    // tool-heavy turns. Older lines slide off the top, opacity fades from
    // 0.35 (oldest) → 1.0 (newest) — rolling-status-update pattern.
    const hasLines = lines.length > 0;
    const VISIBLE_MAX = 3;
    const visibleLines = hasLines
        ? lines.slice(-VISIBLE_MAX)
        : [{ id: 'fb-' + phase, text: FALLBACK_PHRASES[phase] }];

    return (
        <div className="flex justify-start">
            <div className="relative pl-3 my-1 max-w-[88%]">
                {/* Vertical guide rule */}
                <div className="absolute left-0 top-1 bottom-1 w-px bg-gradient-to-b from-zinc-600/0 via-zinc-500/40 to-zinc-600/0" />
                <div className="space-y-1">
                    {visibleLines.map((line, i) => {
                        const isLast = i === visibleLines.length - 1;
                        const N = visibleLines.length;
                        // Linear fade: position 0 (oldest) = 0.35, last = 1.0.
                        const opacity = hasLines && N > 1
                            ? 0.35 + (0.65 * i) / (N - 1)
                            : 1;
                        return (
                            <div
                                key={line.id}
                                className="text-[13px] text-zinc-400 leading-relaxed flex items-start gap-1.5"
                                style={{
                                    animation: 'tcReasoningFade 0.32s ease-out',
                                    opacity,
                                }}
                            >
                                <span className="mt-1 w-1 h-1 rounded-full bg-zinc-500 flex-shrink-0" />
                                <span className="italic">{line.text}</span>
                                {active && isLast && (
                                    <span className="inline-block w-[2px] h-3.5 bg-zinc-400 align-middle ml-0.5 animate-pulse rounded-full" style={{ animationDuration: '1s' }} />
                                )}
                            </div>
                        );
                    })}
                </div>
                <style jsx>{`
                    @keyframes tcReasoningFade {
                        from { opacity: 0; transform: translateY(2px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        </div>
    );
});

/* ─────────────────────────────────────────────────────────────────
 * Helpers — humanize tool names + result previews into one-line traces.
 * Used by AIChatbot's SSE handlers when pushing into the trace array.
 * ────────────────────────────────────────────────────────────────── */

const TOOL_NARRATION: Record<string, string> = {
    get_search_performance: 'Querying Google Search Console',
    run_ga4_report: 'Pulling GA4 data',
    run_page_audit: 'Running PageSpeed Insights',
    run_site_audit: 'Auditing 50+ on-page SEO checks',
    inspect_url: 'Asking Google about indexing',
    cross_source_diagnose: 'Cross-referencing GA4, GSC, and recent commits',
    get_alerts: 'Triaging anomalies in your data',
    run_funnel_analysis: 'Mapping the conversion funnel',
    run_journey_analysis: 'Tracing user journey paths',
    run_cohort_retention: 'Computing retention curves',
    analyze_pr_seo_diff: 'Reading the PR diff for SEO regressions',
    compute_site_health_score: 'Rolling up your site health score',
    write_dashboard_annotation: 'Saving the verdict to your dashboard',
    calculate_revenue_impact: 'Computing revenue impact',
    generate_content_strategy: 'Drafting content strategy',
    analyze_keyword_clusters: 'Clustering your keywords',
    compare_time_periods: 'Comparing the two periods',
    find_cannibalization: 'Checking for keyword cannibalization',
    suggest_internal_links: 'Mapping internal-link opportunities',
    generate_meta_tags: 'Writing meta tags',
    run_realtime_report: 'Pulling realtime users',
    get_custom_dimensions: 'Discovering your custom dimensions',
};

export function narrateToolStart(name: string): string {
    return TOOL_NARRATION[name] || `Calling ${name}`;
}

export function narrateToolResult(name: string, result: unknown): string {
    if (!result) return 'Done.';
    if (typeof result === 'string') return 'Got the response.';
    if (typeof result === 'object') {
        const r = result as any;
        if (r.note && typeof r.note === 'string' && r.note.length < 120) return r.note;
        if (r.summary && typeof r.summary === 'string' && r.summary.length < 160) return r.summary;
        if (r.totalActiveUsers != null) return `${r.totalActiveUsers} active users right now.`;
        if (Array.isArray(r.alerts)) return `Found ${r.alerts.length} alerts.`;
        if (r.overall != null && r.verdict) return `Site health: ${r.overall}/100 — ${r.verdict}.`;
        if (r.cannibalizedKeywords != null) return `${r.cannibalizedKeywords} cannibalized keywords.`;
        if (r.rowsReturned != null) return `Got ${r.rowsReturned} rows.`;
    }
    // Final fallback — never empty.
    return 'Done.';
}
