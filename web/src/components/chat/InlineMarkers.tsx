/**
 * InlineMarkers — pre-processor for the chat-output citation + confidence
 * tags the model is instructed to emit (see route.ts CITATIONS + CONFIDENCE
 * MARKERS block).
 *
 *   [src:<tool>:<id>]            → ` *(src: <human label>)*`        (italic)
 *   [conf:high|med|low]          → ` *●●● / ●●○ / ●○○*`             (italic)
 *
 * We deliberately avoid raw-HTML output: rehype-raw isn't in the dep tree
 * and adding it requires a Docker rebuild. Text replacement keeps the wire
 * information visible and ReactMarkdown-compatible without new deps. A
 * later polish pass can swap to interactive hover-cards once rehype-raw
 * lands; the model side stays unchanged.
 *
 * Pure function — safe to call on any chat content. Empty/missing input
 * returns empty string.
 */

const CITATION_RE = /\[src:([a-z_][a-z0-9_]*):([^\]]+)\]/g;
const CONFIDENCE_RE = /\[conf:(high|med|low)\]/g;

// Tool-name → short human label. Mirrors the executor names in
// services/aiChatTools.ts. Anything missing falls back to the snake_case,
// which is still readable in the citation.
const TOOL_LABEL: Record<string, string> = {
    snapshot: 'snapshot',
    get_search_performance: 'GSC',
    run_ga4_report: 'GA4',
    run_realtime_report: 'GA4 realtime',
    run_page_audit: 'PageSpeed',
    run_site_audit: 'site audit',
    inspect_url: 'GSC inspection',
    fetch_page_html: 'page HTML',
    cross_source_diagnose: 'diagnosis',
    find_cannibalization: 'cannibalization',
    suggest_internal_links: 'internal-link analysis',
    generate_meta_tags: 'meta-tag generator',
    generate_content_strategy: 'content strategy',
    analyze_keyword_clusters: 'keyword clusters',
    compare_time_periods: 'period comparison',
    calculate_revenue_impact: 'revenue model',
    get_alerts: 'alerts',
    compute_site_health_score: 'site health',
    analyze_pr_seo_diff: 'PR SEO diff',
    find_top_money_move: 'top move',
    write_dashboard_annotation: 'annotation',
    get_custom_dimensions: 'custom dimensions',
    list_user_repos: 'GitHub repos',
    get_repo_health: 'repo health',
    search_repo_code: 'repo code search',
    get_recent_commits: 'recent commits',
    get_pull_requests: 'pull requests',
    get_repo_issues: 'repo issues',
    get_workflow_runs: 'workflow runs',
    get_file_contents: 'file contents',
    run_funnel_analysis: 'funnel analysis',
    run_journey_analysis: 'journey analysis',
    run_cohort_retention: 'cohort retention',
};

const CONFIDENCE_DOTS: Record<string, string> = {
    high: '●●●',
    med: '●●○',
    low: '●○○',
};

export function preprocessMarkers(content: string): string {
    if (!content) return content || '';
    return content
        .replace(CITATION_RE, (_match, tool: string, id: string) => {
            const label = TOOL_LABEL[tool] || tool;
            // Trim id to keep inline noise reasonable. The model is instructed
            // to use short ids (kpis, q="..." etc.) but defensively cap.
            const trimmedId = id.length > 40 ? id.slice(0, 40) + '…' : id;
            return ` *(src: ${label} · ${trimmedId})*`;
        })
        .replace(CONFIDENCE_RE, (_match, level: string) => {
            const dots = CONFIDENCE_DOTS[level] ?? CONFIDENCE_DOTS.med;
            const word = level === 'high' ? 'high' : level === 'med' ? 'med' : 'low';
            return ` *${dots} ${word} confidence*`;
        });
}
