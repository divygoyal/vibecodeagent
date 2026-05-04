'use client';

import { memo, useEffect, useState } from 'react';

const THINKING_PHASES = [
    'Warming up brain cells...',
    'Scanning your data...',
    'Crunching the numbers...',
    'Connecting the dots...',
    'Hunting for insights...',
    'Downloading intelligence...',
    'Processing at light speed...',
    'Reading the data tea leaves...',
    'Asking the data gods...',
    'Decoding the matrix...',
    'Robot brain go brrrr...',
    'Consulting the algorithm overlords...',
    'Performing digital gymnastics...',
    'Brewing data espresso...',
] as const;

const TOOL_LABELS: Record<string, string> = {
    get_search_performance: 'Digging through search data...',
    run_ga4_report: 'Querying your analytics...',
    run_page_audit: 'Running PageSpeed Insights...',
    run_site_audit: 'Auditing 50+ HTML/SEO checks...',
    inspect_url: 'Asking Google about indexing...',
    cross_source_diagnose: 'Cross-referencing GA4 + GSC + commits...',
    get_alerts: 'Triaging anomalies...',
    run_funnel_analysis: 'Mapping funnel drop-offs...',
    run_journey_analysis: 'Tracing user journeys...',
    run_cohort_retention: 'Computing retention curves...',
    analyze_pr_seo_diff: 'Reading PR diff for SEO regressions...',
    compute_site_health_score: 'Rolling up health score...',
    write_dashboard_annotation: 'Saving annotation to dashboard...',
    calculate_revenue_impact: 'Counting potential dollars...',
    generate_content_strategy: 'Cooking up content ideas...',
    analyze_keyword_clusters: 'Clustering your keywords...',
    compare_time_periods: 'Comparing time periods...',
    find_cannibalization: 'Checking for cannibalization...',
    suggest_internal_links: 'Finding linking opportunities...',
    generate_meta_tags: 'Crafting meta tags...',
    run_realtime_report: 'Checking who\'s online now...',
    get_custom_dimensions: 'Discovering custom tracking...',
};

/**
 * Pulsing-orb thinking indicator with cycling phases. When activeTool is
 * set, swaps to a tool-specific label. Extracted from AIChatbot.tsx.
 */
export const ThinkingIndicator = memo(function ThinkingIndicator({ activeTool }: { activeTool?: string }) {
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setPhase(p => (p + 1) % THINKING_PHASES.length), 2500);
        return () => clearInterval(timer);
    }, []);

    const message = activeTool ? (TOOL_LABELS[activeTool] || 'Running analysis...') : THINKING_PHASES[phase];

    return (
        <div className="flex justify-start">
            <div className="flex items-center gap-3 px-1 py-2">
                <div className="relative flex-shrink-0 w-6 h-6">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 opacity-80" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <span className="text-[13px] text-zinc-400">{message}</span>
            </div>
        </div>
    );
});
