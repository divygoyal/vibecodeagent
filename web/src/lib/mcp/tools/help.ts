import * as z from 'zod';
import { issuer } from '../config';
import { defineTool, J } from '../toolkit';

const TOPICS = ['overview', 'dates', 'metrics', 'limits', 'troubleshooting', 'privacy', 'health_checks'] as const;

function helpText(topic: (typeof TOPICS)[number]): string {
    const docs = `${issuer()}/ai`;
    switch (topic) {
        case 'dates':
            return `## Dates
- date_range is {preset} or {start_date, end_date}.
- Presets: last_7d, last_14d, last_28d (default), last_30d, last_90d, last_180d, last_365d, this_month, last_month, last_quarter, ytd.
- Dates: YYYY-MM-DD, today, yesterday or NdaysAgo (UTC).
- Windows end at the latest complete day: GA4 yesterday, Search Console two days ago (gsc_search_analytics fresh:true adds partial days).
- compare_to previous_period is the same number of days just before; previous_year is the same dates a year earlier.
- Limits: GA4 ranges up to 800 days (400 with the date dimension); Search Console keeps about 16 months and older starts are moved forward with a warning.`;
        case 'metrics':
            return `## Metrics
- Search Console: clicks; impressions; ctr_pct = clicks / impressions x 100; position = average ranking position (1 is top, lower is better), impression-weighted when combined.
- GA4: sessions; activeUsers (users, not additive across properties); engagementRate (0-1, shown as eng_rate_pct x 100); keyEvents (conversions marked as key events); totalRevenue.
- GA4 Organic Search sessions and Search Console clicks measure different things (sessions vs clicks, all search engines vs Google), so a ratio between 0.4 and 2.5 is normal.
- Deltas like +12.4% compare with the previous period; "new" means the previous value was 0; blank means no data, never zero.
- est_extra_clicks_28d in seo_opportunities is a rough range from typical CTR by position, not a forecast.`;
        case 'limits':
            return `## Limits
- Tool calls share a budget of about 120 cost units per minute per user (light tools 1-2 units, portfolio and health checks more). Over budget, tools return rate_limited with retry_after_s.
- At most 4 calls run at once per user.
- Rows: default 25, maximum 200 per call (gsc_search_analytics, ga4_run_report); 25 per section for movers and opportunities. Results are cut at about 6,000 tokens with a truncation note and next_offset where paging applies.
- URL Inspection: 5 URLs per call, 100 per day and 20 per hour per user.
- Google quotas apply per property and site; when they run low, tools return quota_exhausted with a retry time. Results are cached for 5-30 minutes (realtime 30 seconds).`;
        case 'troubleshooting':
            return `## Troubleshooting
- google_reauth_required: the Google connection expired or was revoked. The user opens TrafficClaw > Connect AI and presses Re-connect Google.
- site_not_found: call list_sites and use a site_id from it. site_not_in_grant: the user shared only some sites with this connection; they can change it by reconnecting.
- ga4_not_connected / gsc_not_connected: the site has only one side; use the other tools or pair it in TrafficClaw.
- queries_excluded: the user chose not to share search queries with this connection; use page-level breakdowns.
- Nothing listed: the Google account has no GA4 or Search Console access.
- Docs: ${docs}`;
        case 'privacy':
            return `## Privacy
- Read-only: no tool changes anything in Google Analytics, Search Console or TrafficClaw.
- Only aggregate numbers, page paths and (unless the user turned them off) search queries are returned; no emails, user IDs, IP addresses or visitor-level data.
- TrafficClaw logs which tool ran, when and for which site, but not arguments or results, and keeps that log for 30 days.
- The user can revoke this connection at any time in TrafficClaw > Connect AI.
- Docs and privacy policy: ${docs}, ${issuer()}/privacy`;
        case 'health_checks':
            return `## site_health checks
- ga4_zero_days: a day in the last 7 with 0 sessions while the 4-week mean is over 20 a day.
- ga4_sudden_drop: 3-day mean under half of the 14 days before.
- ga4_no_key_events: 0 key events with over 500 sessions in 28 days.
- ga4_not_set_share: over 30% of sessions with landing page "(not set)" (single site).
- ga4_gsc_mismatch: GA4 Organic Search sessions / Google clicks outside 0.4-2.5 (single site).
- gsc_clicks_drop: clicks down 25% or more vs the previous 28 days, with at least 100 before.
- gsc_impr_up_ctr_down: impressions up 20%+ while CTR fell 20%+.
- gsc_position_regression: average position worse by 2 or more.
- gsc_sitemap_issues: sitemap errors or warnings, none submitted, or not read for 30 days (single site).
- gsc_homepage_index: URL Inspection of the home page is not PASS (single site, uses inspection budget).
- unpaired_site, data_stale.
Ranking: severity weight (high 3, medium 2, low 1) x estimated clicks or sessions at stake per day.`;
        default:
            return `## TrafficClaw overview
TrafficClaw gives read-only access to the user's Google Analytics 4 properties and Search Console sites, paired by website host.
- Start with list_sites for site ids, then portfolio_summary for an overview of every site.
- One site: site_health (what to fix next), top_movers (what changed), compare_periods, page_detail, seo_opportunities.
- Raw data: gsc_search_analytics, ga4_run_report (field names via ga4_metadata), ga4_realtime, gsc_inspect_url.
- Pairing: GA4 web-stream URLs are matched to Search Console sites by host (www. ignored; sc-domain: covers subdomains). Unmatched items appear as ga4_only or gsc_only.
- Topics: dates, metrics, limits, troubleshooting, privacy, health_checks.`;
    }
}

export const trafficclawHelp = defineTool({
    name: 'trafficclaw_help',
    title: 'TrafficClaw help',
    description: 'Short reference about this server: how sites are paired, date and preset syntax, metric glossary, limits, data freshness, troubleshooting such as reconnecting Google, and privacy. Use when a tool returns an error or when a metric definition is unclear.',
    input: z.object({
        topic: z.enum(TOPICS).default('overview'),
    }).strict(),
    cost: 0.2,
    invoking: 'Reading the help…',
    invoked: 'Help ready',
    output: { data: 'text', props: { topic: J.str } },
    async run(args, ctx) {
        const text = [...ctx.banner(), helpText(args.topic)].join('\n');
        return { text, rows: 0, structured: { topic: args.topic, text } };
    },
});
