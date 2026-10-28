/** Plain-language summaries of the MCP tools, for the app and marketing pages. */
/** `label` is the plain name people read; `name` is the tool name AI apps show (secondary, monospace). */
export const TOOL_SUMMARIES: { name: string; label: string; summary: string; example: string }[] = [
    { name: 'list_sites', label: 'List your sites', summary: 'Every GA4 property and Search Console site you can access, paired by website.', example: 'Which sites can you see?' },
    { name: 'portfolio_summary', label: 'Portfolio summary', summary: 'All your sites side by side: sessions, key events, clicks, impressions and changes.', example: 'How are all my sites doing this month?' },
    { name: 'site_health', label: 'Site health', summary: 'Ranked list of what to fix next, with evidence: tracking gaps, drops, sitemap errors.', example: 'What should I fix first?' },
    { name: 'seo_opportunities', label: 'SEO opportunities', summary: 'Striking-distance queries, low-CTR pages, decaying pages and cannibalization.', example: 'Where are my quick SEO wins?' },
    { name: 'top_movers', label: 'Top movers', summary: 'Pages, queries, channels or countries that gained or lost the most.', example: 'Which pages lost clicks this week?' },
    { name: 'compare_periods', label: 'Compare periods', summary: 'Week over week, month over month or year over year, with optional breakdowns.', example: 'Compare October with September.' },
    { name: 'page_detail', label: 'Page detail', summary: 'One page in depth: engagement, sources, queries, devices and competing pages.', example: 'How is /pricing doing?' },
    { name: 'gsc_search_analytics', label: 'Search Console report', summary: 'Flexible Search Console queries with dimensions, filters and sorting.', example: 'Top queries from mobile in the US?' },
    { name: 'gsc_inspect_url', label: 'Inspect a URL', summary: 'How Google sees a URL: indexing, canonical, last crawl, rich results.', example: 'Is my new blog post indexed?' },
    { name: 'ga4_run_report', label: 'Analytics report', summary: 'Any GA4 report with your choice of metrics, dimensions, filters and two date ranges.', example: 'Sessions by channel for the last 90 days.' },
    { name: 'ga4_realtime', label: 'Realtime visitors', summary: 'Who is on the site right now, by page, country or device.', example: 'How many people are on my site now?' },
    { name: 'ga4_metadata', label: 'Analytics field names', summary: 'Find GA4 field names, including your custom dimensions and metrics.', example: 'Which custom dimensions do I have?' },
    { name: 'trafficclaw_help', label: 'Help and definitions', summary: 'Date syntax, metric definitions, limits and troubleshooting.', example: 'What does avg position mean?' },
];
