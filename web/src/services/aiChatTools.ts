// AI Chat Tools Definition & Executor
// These tools are injected into the Gemini API so the AI can "call" them to perform deep diagnosis.
import { getValidAccessToken, runFlexibleGAReport, runFlexibleRealtimeReport, getPropertyMetadata, inspectGscUrl } from '@/lib/googleApi';
import {
    getValidGithubToken,
    listUserRepos,
    searchRepoCode,
    getRepoIssues,
    getPullRequests,
    getRecentCommits,
    getWorkflowRuns,
    getFileContents,
    getRepoHealth,
} from '@/lib/githubApi';
import { computeAlerts } from '@/lib/alertEngine';
import { runSiteAudit } from '@/lib/siteAudit';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

export const AI_CHAT_TOOL_DECLARATIONS = [
    {
        name: 'get_search_performance',
        description: `Query Google Search Console data for deep analysis. Use ONLY when the pre-loaded dashboard data is insufficient.

WHEN TO USE vs NOT USE:
- Dashboard context already has KPIs, top 25 queries, top 15 pages, 14-day trend. USE THAT DATA FIRST.
- Call this tool ONLY for: specific date-range deep dives, device/country breakdowns, filtering high-impression + low-CTR pages, or when the user asks about data NOT in the dashboard.

EFFICIENCY RULES (CRITICAL — you are limited to 5 tool calls per conversation):
- PLAN your query strategy FIRST. Think: "What single query gives me the most insight?"
- Use multi-dimensional queries: dimensions=["query","page"] gets you keyword-page mapping in ONE call.
- Use metricFilters to find anomalies: e.g., impressions > 500 + ctr < 2% finds money pits in ONE call.
- NEVER call the same tool twice with similar parameters. If you got data, ANALYZE it — don't fetch more.

SMART PATTERNS (ONE call each):
- "Why did traffic drop?" → dimensions=["date"] with 90-day range
- "Striking distance" → dimensions=["query"], metricFilters=[{metric:"position", operator:"greaterThan", value:"4"}, {metric:"position", operator:"lessThan", value:"20"}], rowLimit=200
- "Money pits" → dimensions=["page"], metricFilters=[{metric:"impressions", operator:"greaterThan", value:"500"}, {metric:"ctr", operator:"lessThan", value:"2"}], rowLimit=200
- "Mobile vs Desktop" → dimensions=["device"]
- "Country analysis" → dimensions=["country"]`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'The exact site URL from the [AVAILABLE SITES] list. The system will auto-resolve property format variants (sc-domain, https://, with/without trailing slash) so just use the one from the list.',
                },
                startDate: {
                    type: 'STRING' as const,
                    description: 'Start date in YYYY-MM-DD format',
                },
                endDate: {
                    type: 'STRING' as const,
                    description: 'End date in YYYY-MM-DD format',
                },
                dimensions: {
                    type: 'ARRAY' as const,
                    items: {
                        type: 'STRING' as const,
                        enum: ['date', 'query', 'page', 'country', 'device'],
                    },
                    description: 'Combine multiple dimensions for richer data. E.g. ["query","page"] gives keyword→page mapping.',
                },
                rowLimit: {
                    type: 'INTEGER' as const,
                    description: 'Max rows to fetch from API. Default 50. Use 200+ when filtering. Results capped at 50 returned to you.',
                },
                metricFilters: {
                    type: 'ARRAY' as const,
                    items: {
                        type: 'OBJECT' as const,
                        properties: {
                            metric: { type: 'STRING' as const, enum: ['clicks', 'impressions', 'ctr', 'position'] },
                            operator: { type: 'STRING' as const, enum: ['greaterThan', 'lessThan', 'equals'] },
                            value: { type: 'STRING' as const },
                        },
                    },
                    description: 'Post-fetch metric filters. Use aggressively to find anomalies in ONE call.',
                }
            },
            required: ['siteUrl', 'startDate', 'endDate', 'dimensions'],
        },
    },
    {
        name: 'calculate_revenue_impact',
        description: 'Calculates estimated monthly revenue impact of improving position or CTR for a keyword. Use after analyzing GSC data to quantify opportunities. No API call — pure math.',
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                keyword: { type: 'STRING' as const },
                currentPosition: { type: 'NUMBER' as const },
                currentImpressions: { type: 'NUMBER' as const },
                targetPosition: { type: 'NUMBER' as const, description: 'Usually 3 or 1' },
            },
            required: ['keyword', 'currentPosition', 'currentImpressions', 'targetPosition'],
        },
    },
    {
        name: 'run_ga4_report',
        description: `Run a flexible Google Analytics 4 report with ANY combination of dimensions, metrics, filters, and date ranges. This calls the GA4 Data API directly — far more powerful than the old fixed-dimension tool.

WHEN TO USE: When the user asks about traffic, user behavior, conversions, or engagement that ISN'T already in the dashboard context. Check dashboard data FIRST.

COMMON DIMENSIONS:
- Traffic: date, sessionSource, sessionMedium, sessionDefaultChannelGroup, sessionCampaignName
- Content: pagePath, pageTitle, landingPagePlusQueryString, exitPage
- Geography: country, city, region, continent
- Technology: deviceCategory, browser, operatingSystem, screenResolution
- User: newVsReturning, firstSessionDate, userAgeBracket, userGender

COMMON METRICS:
- Users: activeUsers, newUsers, totalUsers
- Sessions: sessions, sessionsPerUser, engagedSessions, engagementRate
- Engagement: screenPageViews, screenPageViewsPerSession, averageSessionDuration, bounceRate, eventCount
- Conversion: conversions, purchaseRevenue, totalRevenue, ecommercePurchases
- Events: eventCount, eventValue, eventsPerSession

EXAMPLE QUERIES:
- "Why did traffic drop?" → dimensions=["date"], metrics=["activeUsers","sessions","screenPageViews"], 90-day range
- "Bounce rate by landing page for organic" → dimensions=["landingPagePlusQueryString"], metrics=["sessions","bounceRate"], filter sessionMedium=organic
- "Mobile vs Desktop" → dimensions=["deviceCategory"], metrics=["sessions","bounceRate","averageSessionDuration"]
- "Top events" → dimensions=["eventName"], metrics=["eventCount","eventValue"]
- "Revenue by country" → dimensions=["country"], metrics=["totalRevenue","ecommercePurchases"]
- "New vs returning" → dimensions=["newVsReturning"], metrics=["activeUsers","sessions","bounceRate"]

DO NOT USE IF the dashboard context already has this data.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: {
                    type: 'STRING' as const,
                    description: 'GA4 property ID from [AVAILABLE PROPERTIES].',
                },
                dimensions: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const },
                    description: 'GA4 dimension API names (e.g. ["date","sessionSource"]). See common dimensions above.',
                },
                metrics: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const },
                    description: 'GA4 metric API names (e.g. ["activeUsers","bounceRate"]). See common metrics above.',
                },
                startDate: {
                    type: 'STRING' as const,
                    description: 'Start date: "YYYY-MM-DD", "today", "yesterday", or "NdaysAgo" (e.g. "90daysAgo")',
                },
                endDate: {
                    type: 'STRING' as const,
                    description: 'End date: "YYYY-MM-DD" or "today"',
                },
                dimensionFilter: {
                    type: 'ARRAY' as const,
                    items: {
                        type: 'OBJECT' as const,
                        properties: {
                            dimension: { type: 'STRING' as const, description: 'Dimension name (e.g. "sessionMedium")' },
                            matchType: { type: 'STRING' as const, enum: ['EXACT', 'CONTAINS', 'BEGINS_WITH', 'ENDS_WITH', 'REGEXP'], description: 'Match type. Default EXACT.' },
                            value: { type: 'STRING' as const, description: 'Value to match' },
                            negate: { type: 'BOOLEAN' as const, description: 'If true, negates the filter (NOT match). Default false.' },
                        },
                    },
                    description: 'Optional dimension filters. All filters are AND-ed. Example: [{"dimension":"sessionMedium","value":"organic"}] for organic traffic only.',
                },
                metricFilter: {
                    type: 'ARRAY' as const,
                    items: {
                        type: 'OBJECT' as const,
                        properties: {
                            metric: { type: 'STRING' as const, description: 'Metric name (e.g. "sessions")' },
                            operator: { type: 'STRING' as const, enum: ['GREATER_THAN', 'LESS_THAN', 'EQUAL'], description: 'Comparison operator' },
                            value: { type: 'STRING' as const, description: 'Numeric threshold as string' },
                        },
                    },
                    description: 'Optional metric filters. All filters are AND-ed. Example: [{"metric":"sessions","operator":"GREATER_THAN","value":"10"}]',
                },
                orderBy: {
                    type: 'STRING' as const,
                    description: 'Metric name to sort by descending (e.g. "sessions"). Default: first metric.',
                },
                limit: {
                    type: 'INTEGER' as const,
                    description: 'Max rows. Default 100, max 250.',
                },
            },
            required: ['propertyId', 'dimensions', 'metrics', 'startDate', 'endDate'],
        },
    },
    {
        name: 'run_page_audit',
        description: `Run a quick PageSpeed Insights audit on a specific URL. Returns Core Web Vitals (LCP, CLS, FID/INP), performance score, and specific recommendations.

WHEN TO USE:
- "Are my Core Web Vitals hurting my ranking?"
- "Why is my site slow on mobile?"
- "Audit the performance of my homepage"
- "Check page speed for /blog/my-post"

Returns: performance score, LCP, CLS, TBT, speed index, FCP, and top improvement opportunities.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                url: {
                    type: 'STRING' as const,
                    description: 'Full URL to audit (e.g., https://example.com/page)',
                },
                strategy: {
                    type: 'STRING' as const,
                    enum: ['mobile', 'desktop'],
                    description: 'Test on mobile or desktop. Default mobile.',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'generate_content_strategy',
        description: `Generate content strategy insights using AI reasoning. No API call needed — uses the existing GSC data context to analyze gaps and opportunities.

WHEN TO USE:
- "What keywords should I target that I don't have pages for?"
- "Give me 5 blog post titles based on what users search for"
- "Which old posts need an update?"
- "Should I translate my site? Into which language?"
- "I want to write about [Topic]. Do I have authority?"
- "What is the ONE thing I should do today to grow?"

This is a computation tool — it processes the injected data and returns strategic insights.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                analysisType: {
                    type: 'STRING' as const,
                    enum: ['keyword_gaps', 'content_decay', 'blog_ideas', 'one_thing_today', 'authority_check', 'translation_analysis', 'competitor_analysis'],
                    description: 'Type of analysis to run',
                },
                topic: {
                    type: 'STRING' as const,
                    description: 'Optional topic or competitor URL for focused analysis',
                },
                existingQueries: {
                    type: 'STRING' as const,
                    description: 'Comma-separated list of current top queries (from dashboard context). Pass the top 20.',
                },
                existingPages: {
                    type: 'STRING' as const,
                    description: 'Comma-separated list of current top pages (from dashboard context). Pass the top 15.',
                },
            },
            required: ['analysisType'],
        },
    },
    {
        name: 'analyze_keyword_clusters',
        description: `Group the user's existing queries into semantic topic clusters. Pure computation — no API calls.

WHEN TO USE:
- "Group my keywords" / "Show my keyword clusters"
- "What topics do I rank for?"
- "Which keyword groups should I focus on?"
- "How is my content organized by topic?"

Pass the top queries from dashboard context. Returns clustered topics with aggregate metrics.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                queries: {
                    type: 'STRING' as const,
                    description: 'JSON array of query objects from dashboard context. Each: {"query":"...","clicks":N,"impressions":N,"ctr":N,"position":N}',
                },
            },
            required: ['queries'],
        },
    },
    {
        name: 'compare_time_periods',
        description: `Compare GSC performance across two time periods side-by-side. Uses 2 GSC API calls.

WHEN TO USE:
- "Compare this week vs last week"
- "How did last month compare to the month before?"
- "Is my performance improving or declining?"
- "Show me before/after [date]"

Returns a comparison table with delta values and percentage changes.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'Site URL from [AVAILABLE SITES]',
                },
                period1Start: { type: 'STRING' as const, description: 'Period 1 start date (YYYY-MM-DD)' },
                period1End: { type: 'STRING' as const, description: 'Period 1 end date (YYYY-MM-DD)' },
                period2Start: { type: 'STRING' as const, description: 'Period 2 start date (YYYY-MM-DD)' },
                period2End: { type: 'STRING' as const, description: 'Period 2 end date (YYYY-MM-DD)' },
                dimensions: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const, enum: ['query', 'page', 'device', 'country'] },
                    description: 'Dimensions to compare. Default ["query"].',
                },
            },
            required: ['siteUrl', 'period1Start', 'period1End', 'period2Start', 'period2End'],
        },
    },
    {
        name: 'find_cannibalization',
        description: `Detect keyword cannibalization — multiple pages ranking for the same query. Uses 1 GSC call with [query, page] dimensions.

WHEN TO USE:
- "Check for cannibalization"
- "Are multiple pages competing for the same keyword?"
- "Which keywords have duplicate ranking pages?"
- "Find internal competition"

Returns queries with 2+ pages ranking, sorted by impression volume.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'Site URL from [AVAILABLE SITES]',
                },
                startDate: { type: 'STRING' as const, description: 'Start date (YYYY-MM-DD)' },
                endDate: { type: 'STRING' as const, description: 'End date (YYYY-MM-DD)' },
                minImpressions: {
                    type: 'INTEGER' as const,
                    description: 'Minimum impressions to consider. Default 10.',
                },
            },
            required: ['siteUrl', 'startDate', 'endDate'],
        },
    },
    {
        name: 'suggest_internal_links',
        description: `Suggest internal linking opportunities based on the user's existing pages and queries. Pure AI reasoning — no API calls.

WHEN TO USE:
- "Suggest internal links"
- "How should I link my pages together?"
- "Find linking opportunities"
- "Improve my internal link structure"

Pass existing pages and queries from dashboard context. Returns linking suggestions with anchor text recommendations.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                pages: {
                    type: 'STRING' as const,
                    description: 'JSON array of page objects. Each: {"page":"...","clicks":N,"impressions":N,"position":N}',
                },
                queries: {
                    type: 'STRING' as const,
                    description: 'JSON array of query objects. Each: {"query":"...","clicks":N,"position":N}',
                },
            },
            required: ['pages'],
        },
    },
    {
        name: 'generate_meta_tags',
        description: `Generate optimized title tag and meta description for a page based on its URL and target keywords. Pure AI generation — no API calls.

WHEN TO USE:
- "Generate meta tags for my homepage"
- "Write a better title tag for /blog/..."
- "Optimize my meta description"
- "Help me with my title and description"

Returns optimized title (under 60 chars) and description (under 155 chars) with keyword placement.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                url: {
                    type: 'STRING' as const,
                    description: 'The page URL to generate meta tags for',
                },
                targetKeywords: {
                    type: 'STRING' as const,
                    description: 'Comma-separated target keywords for this page',
                },
                currentTitle: {
                    type: 'STRING' as const,
                    description: 'Current title tag (if known)',
                },
                currentDescription: {
                    type: 'STRING' as const,
                    description: 'Current meta description (if known)',
                },
                pageType: {
                    type: 'STRING' as const,
                    enum: ['homepage', 'blog', 'product', 'service', 'landing', 'category', 'other'],
                    description: 'Type of page for context',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'run_realtime_report',
        description: `Query GA4 real-time data. Shows who is on the site RIGHT NOW.

WHEN TO USE:
- "Who's on my site right now?"
- "Any visitors from paid campaigns right now?"
- "What pages are people viewing live?"
- "How many active users right now?"

REALTIME DIMENSIONS (only these work):
- country, city, deviceCategory, unifiedScreenName (page), sessionDefaultChannelGroup, platform, operatingSystem

REALTIME METRICS (limited set):
- activeUsers (primary — always include this)

Note: Realtime API is intentionally limited by Google. For historical data, use run_ga4_report instead.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: {
                    type: 'STRING' as const,
                    description: 'GA4 property ID from [AVAILABLE PROPERTIES].',
                },
                dimensions: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const, enum: ['country', 'city', 'deviceCategory', 'unifiedScreenName', 'sessionDefaultChannelGroup', 'platform', 'operatingSystem'] },
                    description: 'Realtime dimensions to break down by.',
                },
                limit: {
                    type: 'INTEGER' as const,
                    description: 'Max rows. Default 20.',
                },
            },
            required: ['propertyId', 'dimensions'],
        },
    },
    {
        name: 'get_custom_dimensions',
        description: `Discover custom dimensions and metrics configured on a GA4 property. Useful to understand what custom tracking the user has set up before running queries.

WHEN TO USE:
- "What custom events do I track?"
- "Show me my custom dimensions"
- "What custom data is available?"
- Before running a run_ga4_report query when the user asks about custom/event-specific data`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: {
                    type: 'STRING' as const,
                    description: 'GA4 property ID from [AVAILABLE PROPERTIES].',
                },
            },
            required: ['propertyId'],
        },
    },
    // ═══════════════════════════════════════════════════════════════
    // GITHUB TOOLS — connect codebase signals to SEO/analytics symptoms
    // ═══════════════════════════════════════════════════════════════
    {
        name: 'list_user_repos',
        description: `List the user's GitHub repositories. Use ONCE at the start of a repo investigation to discover the right repo to drill into.

WHEN TO USE:
- "What repos do I have?" / "Show my repositories"
- First step of any cross-source diagnosis when the user hasn't named a specific repo
- BEFORE calling other GitHub tools that require a repo name

EFFICIENCY: Call once per conversation. The result is enough to pick the right repo for follow-up calls.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                sort: {
                    type: 'STRING' as const,
                    enum: ['updated', 'pushed', 'created', 'full_name'],
                    description: 'Sort order. Default "updated" (most recently active first).',
                },
                per_page: {
                    type: 'INTEGER' as const,
                    description: 'Max repos to fetch. Default 30, max 100.',
                },
            },
            required: [],
        },
    },
    {
        name: 'get_repo_health',
        description: `One-shot summary of a repo: open issues, open PRs, last commit, languages, default branch. Use this BEFORE deeper GitHub calls to scope the problem cheaply.

WHEN TO USE:
- "What's the state of repo X?" / "Give me a health check on X"
- As the FIRST GitHub call after picking a repo from list_user_repos
- Before deciding whether to look at issues, PRs, commits, or workflows

EFFICIENCY: One call returns enough metadata to know whether the repo is active, what it's written in, and where to dig next. Always cheaper than guessing wrong and burning two calls on the wrong tool.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo" (e.g. "trafficclaw/web") or full GitHub URL.',
                },
            },
            required: ['repo'],
        },
    },
    {
        name: 'search_repo_code',
        description: `Search code across the user's repos for a string or symbol. Use to find WHERE a feature/page/template/error string lives in the codebase.

WHEN TO USE:
- "Where is the sitemap generated?" → query="sitemap.xml" or "generateSitemap"
- "Where do we render the pricing page?" → query="/pricing" repo="..."
- After GSC reports a structured-data error → query="application/ld+json" repo="..."
- To locate the file before calling get_file_contents

EFFICIENCY: Always set repo= to scope the search. Without repo=, GitHub code search is slower and noisier.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                query: {
                    type: 'STRING' as const,
                    description: 'Search string. GitHub code-search syntax supported (e.g. "language:ts useEffect").',
                },
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo" to scope the search to a single repo (strongly recommended).',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'get_recent_commits',
        description: `List recent commits, optionally filtered by date range and path. The PRIMARY tool for correlating analytics events (traffic drops, ranking losses, error spikes) with code changes.

WHEN TO USE:
- "What changed under /app/pricing in the last 14 days?" → path="app/pricing" since="14daysAgo"
- "Did anything ship between Apr 20 and May 1?" → since/until
- Cross-source diagnosis: confirm a GA4/GSC drop date, then call this with since=<dropDate - 3d> and path filter

EFFICIENCY: One call with both since/until AND path is far more useful than two unscoped calls. Always cite the SHA and date in the final answer.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo".',
                },
                since: {
                    type: 'STRING' as const,
                    description: 'ISO 8601 timestamp lower bound (e.g. "2026-04-15T00:00:00Z").',
                },
                until: {
                    type: 'STRING' as const,
                    description: 'ISO 8601 timestamp upper bound.',
                },
                path: {
                    type: 'STRING' as const,
                    description: 'Restrict to commits touching this file or directory (e.g. "app/pricing").',
                },
                per_page: {
                    type: 'INTEGER' as const,
                    description: 'Max commits to fetch. Default 30, max 100.',
                },
            },
            required: ['repo'],
        },
    },
    {
        name: 'get_pull_requests',
        description: `List PRs in a repo (open/closed/merged). Use to see what shipped in a window or to find a PR mentioned in a deploy.

WHEN TO USE:
- "What PRs merged last week?" → state="closed", filter merged_at in your head
- "Show open PRs" → state="open"
- After get_recent_commits surfaces interesting commits, call this to get the PR context

EFFICIENCY: state="closed" returns merged + closed-without-merge — check merged_at to differentiate. Use since= to scope the window.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo".',
                },
                state: {
                    type: 'STRING' as const,
                    enum: ['open', 'closed', 'all'],
                    description: 'PR state filter. Default "all".',
                },
                since: {
                    type: 'STRING' as const,
                    description: 'ISO 8601 timestamp; only return PRs updated on/after this. Filter applied client-side.',
                },
                per_page: {
                    type: 'INTEGER' as const,
                    description: 'Max PRs to fetch. Default 30, max 100.',
                },
            },
            required: ['repo'],
        },
    },
    {
        name: 'get_repo_issues',
        description: `List issues in a repo. Use to surface user-reported bugs that match a symptom the user is asking about.

WHEN TO USE:
- "Are there any open bugs about checkout?" → labels="bug", filter title client-side
- "What issues mention slow page load?" → state="all" then read titles
- After identifying a likely root cause from commits/PRs, check if anyone already filed an issue

EFFICIENCY: Filter with labels= when possible. Returns only issues (PRs are excluded — use get_pull_requests for those).`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo".',
                },
                state: {
                    type: 'STRING' as const,
                    enum: ['open', 'closed', 'all'],
                    description: 'Issue state. Default "open".',
                },
                labels: {
                    type: 'STRING' as const,
                    description: 'Comma-separated label filter (e.g. "bug,critical").',
                },
                since: {
                    type: 'STRING' as const,
                    description: 'ISO 8601 timestamp; only return issues updated on/after this.',
                },
                per_page: {
                    type: 'INTEGER' as const,
                    description: 'Max issues to fetch. Default 30, max 100.',
                },
            },
            required: ['repo'],
        },
    },
    {
        name: 'get_workflow_runs',
        description: `List recent GitHub Actions workflow runs (CI/CD). Use to diagnose deploy failures or to confirm a deploy actually happened around a given date.

WHEN TO USE:
- "Why did the last deploy fail?" → status="completed", check conclusion
- "Did a deploy go out on May 1?" → branch="main", filter created_at
- After get_recent_commits identifies a suspect commit, check if its workflow run failed

EFFICIENCY: Filter with status= and branch= aggressively. The result includes conclusion (success/failure/cancelled) so you can pick the failed runs to investigate further.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo".',
                },
                status: {
                    type: 'STRING' as const,
                    enum: ['completed', 'in_progress', 'queued', 'failure', 'success', 'cancelled'],
                    description: 'Workflow run status filter.',
                },
                branch: {
                    type: 'STRING' as const,
                    description: 'Branch name to filter on (e.g. "main").',
                },
                per_page: {
                    type: 'INTEGER' as const,
                    description: 'Max runs to fetch. Default 20, max 100.',
                },
            },
            required: ['repo'],
        },
    },
    {
        name: 'get_file_contents',
        description: `Read the contents of a specific file in a repo. Use AFTER search_repo_code or get_recent_commits has located the file you want to read.

WHEN TO USE:
- "Show me robots.txt" → path="robots.txt"
- "Read the schema generator" → path="<path from search_repo_code>"
- "What does next.config.js look like?" → path="next.config.js"

CONSTRAINTS:
- Files larger than 100KB are rejected — use search_repo_code to find specific lines first.
- Returns up to 6000 chars of content. If truncated, drill into the relevant section.
- Never call this on >2 files in one conversation. Pick the most likely file.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: {
                    type: 'STRING' as const,
                    description: 'Repo as "owner/repo".',
                },
                path: {
                    type: 'STRING' as const,
                    description: 'Path within the repo (e.g. "next.config.js" or "app/pricing/page.tsx").',
                },
                ref: {
                    type: 'STRING' as const,
                    description: 'Optional branch, tag, or commit SHA. Defaults to default branch.',
                },
            },
            required: ['repo', 'path'],
        },
    },
    // ═══════════════════════════════════════════════════════════════
    // ANOMALIES, AUDITS, INDEXING, ORCHESTRATION (Phase A additions)
    // ═══════════════════════════════════════════════════════════════
    {
        name: 'get_alerts',
        description: `Compute structured anomalies (traffic drops, ranking losses, CTR problems, content decay, striking-distance opportunities) from the user's already-loaded GA4 + GSC dashboard data. NO API call — pure deterministic compute on the snapshot.

WHEN TO USE:
- "What's wrong today?" / "Anything broken?" / "Morning briefing"
- BEFORE going hunting in get_search_performance — this gives you the ranked problem list cheaply
- Whenever you need to prioritize what to talk about

EFFICIENCY: 0 API calls, instant. Always cheaper than re-deriving these patterns from raw KPIs in your head.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                severity: {
                    type: 'STRING' as const,
                    enum: ['critical', 'warning', 'info', 'all'],
                    description: 'Filter by severity. Default "all" (returns critical+warning+info, sorted critical-first).',
                },
                category: {
                    type: 'STRING' as const,
                    enum: ['traffic', 'rankings', 'content', 'opportunities'],
                    description: 'Optional category filter.',
                },
            },
            required: [],
        },
    },
    {
        name: 'run_site_audit',
        description: `Run a full HTML/SEO audit on a URL. Returns 50+ checks: title/meta/canonical, H1 hierarchy, image alt coverage, internal/external link counts, structured data presence, page size, response time, status code, and a 0-100 score.

WHEN TO USE:
- "Audit my homepage" / "Why is my SEO bad on /pricing"
- "Check my meta tags" / "Are my images missing alt text?"
- For HTML/on-page checks ALWAYS prefer this over guessing — it fetches the live page.

DO NOT confuse with run_page_audit (that's PageSpeed Insights for performance/Core Web Vitals).`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                url: {
                    type: 'STRING' as const,
                    description: 'Full URL to audit (e.g., https://example.com/pricing).',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'inspect_url',
        description: `Call the Google Search Console URL Inspection API for a single page. Returns Google's authoritative view: indexing status, last crawl time, robots.txt block status, mobile usability, AMP status, and rich-results validation.

WHEN TO USE:
- "Is /pricing indexed?" / "Why isn't this page showing in Google?"
- After a structured-data error is suspected — this confirms what Google actually saw
- Diagnostic step in cross_source_diagnose for symptom=indexing_error

EFFICIENCY: One call. Quota: 2000/day per property. The chat route caps to 3 inspections per conversation.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'GSC site URL (must be a verified property; use the EXACT format from [AVAILABLE SITES]).',
                },
                pageUrl: {
                    type: 'STRING' as const,
                    description: 'Full URL of the page to inspect (must be on the same property as siteUrl).',
                },
            },
            required: ['siteUrl', 'pageUrl'],
        },
    },
    {
        name: 'cross_source_diagnose',
        description: `One-shot orchestrator that diagnoses a symptom by chaining: (1) period comparison to find the change start date, (2) site→repo lookup, (3) recent commits filtered to the affected page in the suspect window, (4) optional URL inspection if symptom is indexing-related. Returns a structured payload with start date, magnitude, suspect commits/PRs, and inspection status.

WHEN TO USE: when the user reports a symptom like "traffic dropped on /pricing", "rankings collapsed", "indexing broken", "CTR cliff" — this is the go-to first call. It saves 4-5 individual tool calls and returns a verdict-ready payload.

DO NOT use it for general questions ("what should I focus on") — use get_alerts for that.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'GSC site URL from [AVAILABLE SITES].',
                },
                symptom: {
                    type: 'STRING' as const,
                    enum: ['traffic_drop', 'ranking_loss', 'indexing_error', 'ctr_drop'],
                    description: 'What the user is reporting.',
                },
                pagePath: {
                    type: 'STRING' as const,
                    description: 'Optional path filter (e.g. "/pricing"). When set, narrows commit search and enables URL inspection.',
                },
                lookbackDays: {
                    type: 'INTEGER' as const,
                    description: 'How many days back to consider as "recent" for finding the start date. Default 14.',
                },
            },
            required: ['siteUrl', 'symptom'],
        },
    },
];

export interface GscContext {
    googleAccessToken?: string;
    googleRefreshToken?: string;
    githubAccessToken?: string;
    userId?: string;
    /** Pre-fetched dashboard SEO data (top queries/pages/kpis/trend). Lets get_alerts and
     *  cross_source_diagnose run without re-querying GSC just to compute anomalies. */
    seoContext?: any;
    /** Pre-fetched dashboard analytics data (kpis/sources/devices/etc.). */
    analyticsContext?: any;
}

/* ───────────────────────────────────────────────────────────────────────
 *  Lightweight tool-arg validation (no Zod dependency).
 *  Returns null on success, or a string describing what's wrong on failure.
 *  The chat route turns failures into an `invalid_args` tool response
 *  which Gemini sees on the next loop iteration so it can self-correct.
 * ──────────────────────────────────────────────────────────────────── */
type ArgValidator = (args: Record<string, any>) => string | null;
const ARG_VALIDATORS: Record<string, ArgValidator> = {
    get_search_performance: (a) => {
        if (typeof a.siteUrl !== 'string' || !a.siteUrl.trim()) return 'siteUrl (string) is required';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.startDate || '')) return 'startDate must be YYYY-MM-DD';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.endDate || '')) return 'endDate must be YYYY-MM-DD';
        if (!Array.isArray(a.dimensions) || a.dimensions.length === 0) return 'dimensions must be a non-empty array';
        const allowed = new Set(['date', 'query', 'page', 'country', 'device']);
        for (const d of a.dimensions) if (!allowed.has(d)) return `dimension "${d}" not in [date,query,page,country,device]`;
        return null;
    },
    run_ga4_report: (a) => {
        if (typeof a.propertyId !== 'string' || !a.propertyId.trim()) return 'propertyId (string) is required';
        if (!Array.isArray(a.dimensions) || a.dimensions.length === 0) return 'dimensions must be a non-empty array';
        if (!Array.isArray(a.metrics) || a.metrics.length === 0) return 'metrics must be a non-empty array';
        if (typeof a.startDate !== 'string' || !a.startDate) return 'startDate is required';
        if (typeof a.endDate !== 'string' || !a.endDate) return 'endDate is required';
        return null;
    },
    run_page_audit: (a) => {
        if (typeof a.url !== 'string' || !/^https?:\/\//.test(a.url)) return 'url must start with http(s)://';
        return null;
    },
    inspect_url: (a) => {
        if (typeof a.siteUrl !== 'string' || !a.siteUrl) return 'siteUrl (string) is required';
        if (typeof a.pageUrl !== 'string' || !/^https?:\/\//.test(a.pageUrl)) return 'pageUrl must start with http(s)://';
        return null;
    },
    run_site_audit: (a) => {
        if (typeof a.url !== 'string' || !a.url) return 'url (string) is required';
        return null;
    },
    cross_source_diagnose: (a) => {
        if (typeof a.siteUrl !== 'string' || !a.siteUrl) return 'siteUrl is required';
        const allowed = new Set(['traffic_drop', 'ranking_loss', 'indexing_error', 'ctr_drop']);
        if (!allowed.has(a.symptom)) return 'symptom must be one of: traffic_drop, ranking_loss, indexing_error, ctr_drop';
        return null;
    },
    get_alerts: () => null, // all params optional
    compare_time_periods: (a) => {
        if (typeof a.siteUrl !== 'string') return 'siteUrl is required';
        for (const k of ['period1Start', 'period1End', 'period2Start', 'period2End']) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(a[k] || '')) return `${k} must be YYYY-MM-DD`;
        }
        return null;
    },
    find_cannibalization: (a) => {
        if (typeof a.siteUrl !== 'string') return 'siteUrl is required';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.startDate || '')) return 'startDate must be YYYY-MM-DD';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.endDate || '')) return 'endDate must be YYYY-MM-DD';
        return null;
    },
    get_repo_health: (a) => (typeof a.repo !== 'string' || !a.repo ? 'repo (owner/name) is required' : null),
    search_repo_code: (a) => (typeof a.query !== 'string' || !a.query ? 'query is required' : null),
    get_recent_commits: (a) => (typeof a.repo !== 'string' || !a.repo ? 'repo is required' : null),
    get_pull_requests: (a) => (typeof a.repo !== 'string' || !a.repo ? 'repo is required' : null),
    get_repo_issues: (a) => (typeof a.repo !== 'string' || !a.repo ? 'repo is required' : null),
    get_workflow_runs: (a) => (typeof a.repo !== 'string' || !a.repo ? 'repo is required' : null),
    get_file_contents: (a) => {
        if (typeof a.repo !== 'string' || !a.repo) return 'repo is required';
        if (typeof a.path !== 'string' || !a.path) return 'path is required';
        return null;
    },
};

export function validateToolArgs(name: string, args: Record<string, any>): string | null {
    const v = ARG_VALIDATORS[name];
    if (!v) return null; // no validator → permissive
    return v(args || {});
}

/**
 * Smart GSC query with automatic property format resolution.
 * Tries all variants: sc-domain, https:// with slash, https:// without slash.
 */
async function queryGSCWithAutoResolve(
    token: string,
    siteUrl: string,
    body: any
): Promise<{ response: Response; data: any; resolvedUrl: string }> {
    // Build all possible URL variants
    const variants: string[] = [siteUrl];

    if (siteUrl.startsWith('sc-domain:')) {
        const domain = siteUrl.replace('sc-domain:', '');
        variants.push(`https://${domain}/`, `https://${domain}`, `http://${domain}/`);
    } else if (siteUrl.startsWith('https://') || siteUrl.startsWith('http://')) {
        // If user gave URL-prefix, also try sc-domain
        const domain = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        variants.push(`sc-domain:${domain}`);
        // Also try with/without trailing slash
        if (siteUrl.endsWith('/')) {
            variants.push(siteUrl.slice(0, -1));
        } else {
            variants.push(siteUrl + '/');
        }
    }

    // Deduplicate
    const uniqueVariants = [...new Set(variants)];

    for (const variant of uniqueVariants) {
        try {
            const response = await fetch(
                `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(variant)}/searchAnalytics/query`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(15000),
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.rows && data.rows.length > 0) {
                    return { response, data, resolvedUrl: variant };
                }
            }
        } catch {
            // Try next variant
        }
    }

    // All variants failed — return structured error
    return {
        response: new Response(null, { status: 404 }),
        data: null,
        resolvedUrl: siteUrl
    };
}

export async function executeAiChatTool(name: string, args: Record<string, any>, gscContext?: GscContext) {

    // A11: validate args before doing any work. Failure surfaces as a structured
    // tool response that Gemini sees and self-corrects on the next loop iteration.
    const validationError = validateToolArgs(name, args || {});
    if (validationError) {
        return { error: 'invalid_args', message: validationError, toolName: name };
    }

    if (name === 'get_search_performance') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const { siteUrl, startDate, endDate, rowLimit, metricFilters } = args;
            let { dimensions } = args;

            if (!dimensions || dimensions.length === 0) dimensions = ['query'];

            const body: any = {
                startDate,
                endDate,
                dimensions,
                rowLimit: Math.min(rowLimit || 50, 500),
                startRow: 0,
                dataState: 'all',
            };

            // Smart auto-resolve: tries all property format variants
            const { data, resolvedUrl } = await queryGSCWithAutoResolve(token, siteUrl, body);

            if (!data || !data.rows) {
                return {
                    result: {
                        siteUrl,
                        triedVariants: true,
                        dateRange: { startDate, endDate },
                        dimensions,
                        totalRowsAvailable: 0,
                        rowsReturned: 0,
                        note: `ZERO DATA returned for "${siteUrl}" (tried all property format variants: sc-domain, https://, with and without trailing slash). Possible causes: (1) The GSC property is verified with a different URL format than provided — check [AVAILABLE SITES] list, (2) The site had no search impressions in this date range, (3) The property is not verified. Tell the user which exact properties are available and ask them to verify.`,
                        csvData: '',
                    },
                };
            }

            let formattedRows = (data.rows || []).map((row: any) => {
                const entry: Record<string, any> = {};
                (dimensions as string[]).forEach((dim: string, i: number) => {
                    entry[dim] = row.keys[i];
                });
                entry.clicks = row.clicks;
                entry.impressions = row.impressions;
                entry.ctr = Math.round(row.ctr * 10000) / 100;
                entry.position = Math.round(row.position * 10) / 10;
                return entry;
            });

            // Apply metric filters
            if (metricFilters && Array.isArray(metricFilters) && metricFilters.length > 0) {
                formattedRows = formattedRows.filter((row: Record<string, any>) => {
                    return metricFilters.every((f: any) => {
                        const val = row[f.metric];
                        const threshold = Number.parseFloat(f.value);
                        if (Number.isNaN(threshold) || val === undefined) return true;
                        if (f.operator === 'greaterThan') return val > threshold;
                        if (f.operator === 'lessThan') return val < threshold;
                        if (f.operator === 'equals') return val === threshold;
                        return true;
                    });
                });
            }

            // Hard cap at 50 rows to save tokens
            const limitedRows = formattedRows.slice(0, 50);

            // Compress to CSV for token efficiency
            const csvRows = limitedRows.map((row: any) => {
                const dims = (dimensions as string[]).map(d => `"${String(row[d]).replace(/"/g, '""')}"`).join(',');
                return `${dims},${row.clicks},${row.impressions},${row.ctr},${row.position}`;
            });
            const csvHeader = `${(dimensions as string[]).join(',')},clicks,impressions,ctr,position`;
            const compressedCsv = [csvHeader, ...csvRows].join('\n');

            // Calculate summary stats for the AI
            let totalClicks = 0, totalImpressions = 0, totalPos = 0;
            for (const row of limitedRows) {
                totalClicks += row.clicks || 0;
                totalImpressions += row.impressions || 0;
                totalPos += row.position || 0;
            }
            const avgPos = limitedRows.length > 0 ? (totalPos / limitedRows.length).toFixed(1) : '0';
            const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';

            return {
                result: {
                    siteUrl: resolvedUrl,
                    dateRange: { startDate, endDate },
                    dimensions,
                    totalRowsAvailable: formattedRows.length,
                    rowsReturned: limitedRows.length,
                    summary: `${totalClicks} clicks, ${totalImpressions} impressions, ${avgCtr}% avg CTR, pos ${avgPos} avg`,
                    note: formattedRows.length > 50 ? 'DATA TRUNCATED to top 50 rows. Use metricFilters to drill down.' : '',
                    csvData: compressedCsv,
                },
                structuredData: {
                    dimensions,
                    rows: limitedRows,
                    totals: { clicks: totalClicks, impressions: totalImpressions, ctr: parseFloat(avgCtr), position: parseFloat(avgPos) },
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to fetch GSC data' };
        }
    }

    if (name === 'calculate_revenue_impact') {
        const { keyword, currentPosition, currentImpressions, targetPosition } = args;

        // Real CTR curve based on industry data
        const ctrCurve: Record<number, number> = {
            1: 0.28, 2: 0.16, 3: 0.11, 4: 0.08, 5: 0.065,
            6: 0.05, 7: 0.04, 8: 0.032, 9: 0.026, 10: 0.022,
        };
        const getCtr = (pos: number) => {
            if (pos <= 0) return 0.28;
            if (pos <= 10) return ctrCurve[Math.round(pos)] || 0.02;
            if (pos <= 20) return 0.01;
            return 0.005;
        };

        const currentCtr = getCtr(currentPosition);
        const targetCtr = getCtr(targetPosition);
        const currentClicks = Math.round(currentImpressions * currentCtr);
        const targetClicks = Math.round(currentImpressions * targetCtr);
        const extraClicks = Math.max(0, targetClicks - currentClicks);

        // Value per click varies by intent
        const estValuePerClick = currentPosition <= 5 ? 3.00 : 2.00;
        const extraRevenue = Math.round(extraClicks * estValuePerClick);

        return {
            result: {
                keyword,
                currentPosition,
                targetPosition,
                currentCTR: `${(currentCtr * 100).toFixed(1)}%`,
                targetCTR: `${(targetCtr * 100).toFixed(1)}%`,
                currentClicks,
                projectedClicks: targetClicks,
                extraClicksPerMonth: extraClicks,
                estimatedRevenueGain: `$${extraRevenue}/month`,
                valuePerClick: `$${estValuePerClick.toFixed(2)}`,
            }
        };
    }

    if (name === 'run_ga4_report') {
        // Flexible GA4 report — calls Data API directly (no internal route overhead)
        const { propertyId, dimensions, metrics, startDate, endDate, dimensionFilter, metricFilter, orderBy, limit } = args;
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const dims = dimensions || ['date'];
            const mets = metrics || ['activeUsers', 'sessions'];

            // Build GA4 FilterExpression from simplified filter array
            let ga4DimFilter: any = undefined;
            if (dimensionFilter && Array.isArray(dimensionFilter) && dimensionFilter.length > 0) {
                const filterExpressions = dimensionFilter.map((f: any) => {
                    const expr: any = {
                        filter: {
                            fieldName: f.dimension,
                            stringFilter: {
                                matchType: f.matchType || 'EXACT',
                                value: f.value,
                            },
                        },
                    };
                    if (f.negate) {
                        return { notExpression: expr };
                    }
                    return expr;
                });
                ga4DimFilter = filterExpressions.length === 1
                    ? filterExpressions[0]
                    : { andGroup: { expressions: filterExpressions } };
            }

            // Build GA4 metric filter from simplified format
            let ga4MetricFilter: any = undefined;
            if (metricFilter && Array.isArray(metricFilter) && metricFilter.length > 0) {
                const filterExpressions = metricFilter.map((f: any) => ({
                    filter: {
                        fieldName: f.metric,
                        numericFilter: {
                            operation: f.operator || 'GREATER_THAN',
                            value: { int64Value: f.value },
                        },
                    },
                }));
                ga4MetricFilter = filterExpressions.length === 1
                    ? filterExpressions[0]
                    : { andGroup: { expressions: filterExpressions } };
            }

            // Build orderBys
            const orderBys = orderBy
                ? [{ field: orderBy, type: 'metric' as const, desc: true }]
                : mets.length > 0
                    ? [{ field: mets[0], type: 'metric' as const, desc: true }]
                    : undefined;

            const data = await runFlexibleGAReport(
                token,
                propertyId,
                dims,
                mets,
                [{ startDate, endDate }],
                {
                    dimensionFilter: ga4DimFilter,
                    metricFilter: ga4MetricFilter,
                    orderBys,
                    limit: Math.min(limit || 100, 250),
                }
            );

            if (!data?.rows || data.rows.length === 0) {
                return {
                    result: {
                        dimensions: dims,
                        metrics: mets,
                        dateRange: { startDate, endDate },
                        rowsReturned: 0,
                        note: 'No data returned. The property may not have data for these dimensions/metrics in this date range.',
                        csvData: '',
                    },
                };
            }

            // Parse response into structured rows
            const dimHeaders = (data.dimensionHeaders || []).map((h: any) => h.name);
            const metHeaders = (data.metricHeaders || []).map((h: any) => h.name);

            const parsedRows = data.rows.map((row: any) => {
                const entry: Record<string, any> = {};
                dimHeaders.forEach((name: string, i: number) => {
                    entry[name] = row.dimensionValues[i]?.value || '';
                });
                metHeaders.forEach((name: string, i: number) => {
                    const raw = row.metricValues[i]?.value || '0';
                    entry[name] = raw.includes('.') ? parseFloat(raw) : parseInt(raw);
                });
                return entry;
            });

            // Cap at 100 rows for token efficiency
            const limitedRows = parsedRows.slice(0, 100);

            // CSV compression
            const allCols = [...dimHeaders, ...metHeaders];
            const csvHeader = allCols.join(',');
            const csvRows = limitedRows.map((row: any) =>
                allCols.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(',')
            );
            const compressedCsv = [csvHeader, ...csvRows].join('\n');

            // Summary stats for metrics
            const summaryParts: string[] = [];
            for (const met of metHeaders) {
                const total = limitedRows.reduce((sum: number, r: any) => sum + (Number(r[met]) || 0), 0);
                const isAvg = met.toLowerCase().includes('rate') || met.toLowerCase().includes('average') || met.toLowerCase().includes('bounce');
                const display = isAvg ? (total / limitedRows.length).toFixed(2) : total.toLocaleString();
                summaryParts.push(`${met}: ${display}`);
            }

            return {
                result: {
                    dimensions: dims,
                    metrics: mets,
                    dateRange: { startDate, endDate },
                    totalRowsAvailable: data.rowCount || parsedRows.length,
                    rowsReturned: limitedRows.length,
                    summary: summaryParts.join(', '),
                    note: parsedRows.length > 100 ? 'DATA TRUNCATED to top 100 rows. Use filters to narrow down.' : '',
                    csvData: compressedCsv,
                },
                structuredData: {
                    dimensions: dimHeaders,
                    rows: limitedRows,
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to fetch GA4 report' };
        }
    }

    if (name === 'run_page_audit') {
        const { url: pageUrl, strategy } = args;
        try {
            const strat = strategy || 'mobile';
            const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(pageUrl)}&strategy=${strat}&category=performance&category=accessibility&category=best-practices&category=seo`;

            const response = await fetch(apiUrl, {
                signal: AbortSignal.timeout(30000), // PSI can take a while
            });

            if (!response.ok) {
                return { error: `PageSpeed Insights returned ${response.status}. URL may be invalid or unreachable.` };
            }

            const data = await response.json();
            const lighthouse = data.lighthouseResult;

            if (!lighthouse) {
                return { error: 'No Lighthouse data returned. The URL may be blocking automated crawlers.' };
            }

            // Extract Core Web Vitals
            const audits = lighthouse.audits || {};
            const categories = lighthouse.categories || {};

            const result: Record<string, any> = {
                url: pageUrl,
                strategy: strat,
                scores: {
                    performance: Math.round((categories.performance?.score || 0) * 100),
                    accessibility: Math.round((categories.accessibility?.score || 0) * 100),
                    bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
                    seo: Math.round((categories.seo?.score || 0) * 100),
                },
                coreWebVitals: {
                    LCP: audits['largest-contentful-paint']?.displayValue || 'N/A',
                    CLS: audits['cumulative-layout-shift']?.displayValue || 'N/A',
                    TBT: audits['total-blocking-time']?.displayValue || 'N/A',
                    FCP: audits['first-contentful-paint']?.displayValue || 'N/A',
                    SpeedIndex: audits['speed-index']?.displayValue || 'N/A',
                    TTI: audits['interactive']?.displayValue || 'N/A',
                },
                verdicts: {
                    LCP: audits['largest-contentful-paint']?.score >= 0.9 ? 'GOOD' : audits['largest-contentful-paint']?.score >= 0.5 ? 'NEEDS_IMPROVEMENT' : 'POOR',
                    CLS: audits['cumulative-layout-shift']?.score >= 0.9 ? 'GOOD' : audits['cumulative-layout-shift']?.score >= 0.5 ? 'NEEDS_IMPROVEMENT' : 'POOR',
                    TBT: audits['total-blocking-time']?.score >= 0.9 ? 'GOOD' : audits['total-blocking-time']?.score >= 0.5 ? 'NEEDS_IMPROVEMENT' : 'POOR',
                },
            };

            // Extract top 5 improvement opportunities
            const opportunities: string[] = [];
            const opportunityAudits = ['render-blocking-resources', 'unused-css-rules', 'unused-javascript',
                'unminified-css', 'unminified-javascript', 'modern-image-formats', 'offscreen-images',
                'efficiently-encode-images', 'server-response-time', 'redirects', 'dom-size',
                'critical-rendering-path', 'uses-optimized-images', 'uses-text-compression'];

            for (const auditId of opportunityAudits) {
                if (audits[auditId] && audits[auditId].score !== null && audits[auditId].score < 0.9) {
                    const savings = audits[auditId].details?.overallSavingsMs;
                    opportunities.push(`${audits[auditId].title}${savings ? ` (save ~${Math.round(savings)}ms)` : ''}`);
                }
            }
            result.topOpportunities = opportunities.slice(0, 6);

            return { result };
        } catch (e: any) {
            return { error: e.message || 'Failed to run PageSpeed audit' };
        }
    }

    if (name === 'generate_content_strategy') {
        const { analysisType, topic, existingQueries, existingPages } = args;

        // A12: structured payload — model gets a clear task + inputs + expected format,
        // no more free-form "instructions" prose that the model used to echo back.
        const queries = existingQueries ? existingQueries.split(',').map((q: string) => q.trim()).filter(Boolean) : [];
        const pages = existingPages ? existingPages.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

        const TASKS: Record<string, { task: string; expectedFormat: string }> = {
            keyword_gaps: {
                task: 'Identify keyword/topic gaps the site does NOT yet rank for but logically should, given its existing topical footprint.',
                expectedFormat: 'Markdown table: | Missing Topic | Suggested Queries (3-5) | Why it matters | Difficulty (Easy/Med/Hard) |',
            },
            content_decay: {
                task: 'For each existing page, estimate decay risk (likely outdated, sliding rankings) and prescribe a refresh priority.',
                expectedFormat: 'Markdown table: | Page | Decay signal | Refresh priority (P0/P1/P2) | Specific action |',
            },
            blog_ideas: {
                task: 'Propose 5-7 net-new blog post ideas that build on existing topical authority.',
                expectedFormat: 'Numbered list. Each item: **Title** · target keyword · primary intent · 1-line angle · est. difficulty (Low/Med/High).',
            },
            one_thing_today: {
                task: 'Pick ONE single action with the highest expected impact TODAY across all available signals.',
                expectedFormat: 'One paragraph: 🎯 [verdict] — [action]. Then 2-3 bullets of evidence with numbers. Then "Expected impact: [revenue/traffic delta]".',
            },
            authority_check: {
                task: `Rate the site's authority on "${topic || '(topic)'}" 0-10 from existing queries and pages.`,
                expectedFormat: '## Authority: N/10 — [verdict]. Bullets: matched queries, matched pages, semantic gaps. Final: "Should you write more on this? YES/NO because…".',
            },
            translation_analysis: {
                task: 'Recommend whether to translate the site, into which languages, and prioritization.',
                expectedFormat: 'Markdown table: | Language | Country evidence | Est. traffic gain | Priority |. Then verdict line.',
            },
            competitor_analysis: {
                task: `Compare against competitor "${topic || '(competitor)'}". Note: no live competitor data — reason from your model knowledge plus the user's existing footprint.`,
                expectedFormat: 'Markdown table: | Their likely strength | User\'s position | Gap | Specific content to create |. Then 1-line verdict.',
            },
        };

        const spec = TASKS[analysisType];
        if (!spec) {
            return { result: { error: `Unknown analysisType "${analysisType}". Allowed: ${Object.keys(TASKS).join(', ')}` } };
        }

        return {
            result: {
                analysisType,
                task: spec.task,
                expectedFormat: spec.expectedFormat,
                inputs: {
                    topic: topic || null,
                    topQueries: queries.slice(0, 20),
                    topPages: pages.slice(0, 15),
                    queryCount: queries.length,
                    pageCount: pages.length,
                },
            },
        };
    }

    if (name === 'analyze_keyword_clusters') {
        try {
            const queries = JSON.parse(args.queries || '[]');
            if (!Array.isArray(queries) || queries.length === 0) {
                return { result: { task: 'No queries provided — ask the user to share their top queries or let dashboard context populate first.', clusters: [] } };
            }

            // Simple semantic clustering by shared words
            const clusters = new Map<string, { queries: any[]; totalClicks: number; totalImpressions: number; avgPosition: number }>();
            for (const q of queries) {
                const words = (q.query || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
                // Use the longest meaningful word as the cluster key
                const clusterKey = words.sort((a: string, b: string) => b.length - a.length)[0] || 'other';
                if (!clusters.has(clusterKey)) {
                    clusters.set(clusterKey, { queries: [], totalClicks: 0, totalImpressions: 0, avgPosition: 0 });
                }
                const cluster = clusters.get(clusterKey)!;
                cluster.queries.push(q);
                cluster.totalClicks += q.clicks || 0;
                cluster.totalImpressions += q.impressions || 0;
            }

            // Calculate averages and sort by total clicks
            const result = Array.from(clusters.entries())
                .map(([topic, data]) => {
                    const posSum = data.queries.reduce((sum: number, q: any) => sum + (q.position || 0), 0);
                    return {
                        topic,
                        queryCount: data.queries.length,
                        totalClicks: data.totalClicks,
                        totalImpressions: data.totalImpressions,
                        avgPosition: Math.round((posSum / data.queries.length) * 10) / 10,
                        topQueries: data.queries.slice(0, 5).map((q: any) => q.query),
                    };
                })
                .sort((a, b) => b.totalClicks - a.totalClicks)
                .slice(0, 15);

            // A12: structured payload — clear task + format spec, no echoed prose.
            return {
                result: {
                    task: 'Identify strong clusters to double down on, weak clusters to improve, and missing topic areas. Prescribe a content move per cluster.',
                    expectedFormat: 'Markdown table: | Cluster | Strength (clicks·avgPos) | Verdict (Double-down / Improve / Drop) | Next move |. Then 1-2 line summary.',
                    totalQueries: queries.length,
                    clusterCount: result.length,
                    clusters: result,
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to cluster keywords' };
        }
    }

    if (name === 'compare_time_periods') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const { siteUrl, period1Start, period1End, period2Start, period2End } = args;
            const dimensions = args.dimensions || ['query'];

            const body = (start: string, end: string) => ({
                startDate: start,
                endDate: end,
                dimensions,
                rowLimit: 100,
                dataState: 'all',
            });

            // Fetch both periods in parallel
            const [result1, result2] = await Promise.all([
                queryGSCWithAutoResolve(token, siteUrl, body(period1Start, period1End)),
                queryGSCWithAutoResolve(token, siteUrl, body(period2Start, period2End)),
            ]);

            const rows1 = (result1.data?.rows || []);
            const rows2 = (result2.data?.rows || []);

            // Build lookup maps
            const buildMap = (rows: any[]) => {
                const map = new Map<string, any>();
                for (const row of rows) {
                    const key = row.keys.join('|');
                    map.set(key, { clicks: row.clicks, impressions: row.impressions, ctr: Math.round(row.ctr * 10000) / 100, position: Math.round(row.position * 10) / 10 });
                }
                return map;
            };

            const map1 = buildMap(rows1);
            const map2 = buildMap(rows2);
            const allKeys = new Set([...map1.keys(), ...map2.keys()]);

            const comparison = Array.from(allKeys).map(key => {
                const p1 = map1.get(key) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
                const p2 = map2.get(key) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
                return {
                    key,
                    period1: p1,
                    period2: p2,
                    deltaClicks: p2.clicks - p1.clicks,
                    deltaImpressions: p2.impressions - p1.impressions,
                    deltaPosition: Math.round((p2.position - p1.position) * 10) / 10,
                };
            })
                .sort((a, b) => Math.abs(b.deltaClicks) - Math.abs(a.deltaClicks))
                .slice(0, 30);

            // Totals
            const sum = (rows: any[], metric: string) => rows.reduce((s: number, r: any) => s + (r[metric] || 0), 0);
            const totals = {
                period1: { clicks: sum(rows1, 'clicks'), impressions: sum(rows1, 'impressions') },
                period2: { clicks: sum(rows2, 'clicks'), impressions: sum(rows2, 'impressions') },
            };

            // CSV output
            const csvHeader = `${dimensions.join(',')},p1_clicks,p1_impressions,p1_position,p2_clicks,p2_impressions,p2_position,delta_clicks`;
            const csvRows = comparison.map(c => {
                return `"${c.key}",${c.period1.clicks},${c.period1.impressions},${c.period1.position},${c.period2.clicks},${c.period2.impressions},${c.period2.position},${c.deltaClicks}`;
            });

            return {
                result: {
                    period1: `${period1Start} to ${period1End}`,
                    period2: `${period2Start} to ${period2End}`,
                    totals,
                    rowsCompared: comparison.length,
                    csvData: [csvHeader, ...csvRows].join('\n'),
                },
                structuredData: {
                    dimensions,
                    rows: comparison.map(c => ({
                        ...Object.fromEntries(c.key.split('|').map((v, i) => [dimensions[i], v])),
                        clicks: c.period2.clicks,
                        impressions: c.period2.impressions,
                        position: c.period2.position,
                        deltaClicks: c.deltaClicks,
                    })),
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to compare periods' };
        }
    }

    if (name === 'find_cannibalization') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const { siteUrl, startDate, endDate, minImpressions } = args;
            const minImp = minImpressions || 10;

            const body = {
                startDate,
                endDate,
                dimensions: ['query', 'page'],
                rowLimit: 500,
                dataState: 'all',
            };

            const { data } = await queryGSCWithAutoResolve(token, siteUrl, body);
            if (!data?.rows) {
                return { result: { note: 'No data returned. Check site URL and date range.', cannibalized: [] } };
            }

            // Group by query, find those with 2+ pages
            const queryMap = new Map<string, { pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[]; totalImpressions: number }>();
            for (const row of data.rows) {
                const query = row.keys[0];
                const page = row.keys[1];
                if (row.impressions < minImp) continue;

                if (!queryMap.has(query)) {
                    queryMap.set(query, { pages: [], totalImpressions: 0 });
                }
                const entry = queryMap.get(query)!;
                entry.pages.push({
                    page,
                    clicks: row.clicks,
                    impressions: row.impressions,
                    ctr: Math.round(row.ctr * 10000) / 100,
                    position: Math.round(row.position * 10) / 10,
                });
                entry.totalImpressions += row.impressions;
            }

            // Filter to only cannibalized queries (2+ pages)
            const cannibalized = Array.from(queryMap.entries())
                .filter(([, v]) => v.pages.length >= 2)
                .sort((a, b) => b[1].totalImpressions - a[1].totalImpressions)
                .slice(0, 20)
                .map(([query, data]) => ({
                    query,
                    pageCount: data.pages.length,
                    totalImpressions: data.totalImpressions,
                    pages: data.pages.sort((a, b) => b.impressions - a.impressions).slice(0, 5),
                }));

            return {
                result: {
                    task: 'Resolve each cannibalized keyword: pick canonical target page, decide which pages to redirect/consolidate, and prescribe content changes.',
                    expectedFormat: 'Markdown table: | Query | Canonical page (winner) | Pages to redirect/merge | Action plan |. Then 1-line summary.',
                    dateRange: `${startDate} to ${endDate}`,
                    cannibalizedKeywords: cannibalized.length,
                    cannibalized,
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to check cannibalization' };
        }
    }

    if (name === 'suggest_internal_links') {
        try {
            const pages = JSON.parse(args.pages || '[]');
            const queries = args.queries ? JSON.parse(args.queries) : [];

            // A12: structured payload — task + format spec, no instructional prose.
            return {
                result: {
                    task: 'Suggest internal linking moves: source → target with anchor text and SEO rationale. Bias toward (a) related-topic links, (b) authority-page → weaker-page link equity flow, (c) related-query consolidation.',
                    expectedFormat: 'Markdown table: | Source page | Target page | Suggested anchor text | Why |. Limit: 6-10 rows. Skip duplicates.',
                    pageCount: pages.length,
                    queryCount: queries.length,
                    pages: pages.slice(0, 20),
                    queries: queries.slice(0, 20),
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to parse page data' };
        }
    }

    if (name === 'generate_meta_tags') {
        const { url, targetKeywords, currentTitle, currentDescription, pageType } = args;
        // A12: structured payload — task + format spec, no echoed prose.
        return {
            result: {
                task: 'Generate optimized title + meta description for this page.',
                rules: {
                    titleMaxChars: 60,
                    descriptionMaxChars: 155,
                    titleFormat: 'Primary keyword near the front, brand name at end after " | ".',
                    descriptionFormat: 'Include primary keyword naturally + a CTA. Compelling, not generic.',
                    pageTypeTone: pageType || 'other',
                },
                expectedFormat: '**3 title variations** (numbered, ≤60 chars each) + **2 description variations** (numbered, ≤155 chars each). If currentTitle/currentDescription are present, add a 1-line "What\'s wrong" note.',
                inputs: {
                    url,
                    targetKeywords: targetKeywords || null,
                    currentTitle: currentTitle || null,
                    currentDescription: currentDescription || null,
                    pageType: pageType || 'other',
                },
            },
        };
    }

    if (name === 'run_realtime_report') {
        const { propertyId, dimensions, limit: rowLimit } = args;
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const dims = dimensions || ['country'];

            const data = await runFlexibleRealtimeReport(
                token,
                propertyId,
                dims,
                ['activeUsers'],
                { limit: Math.min(rowLimit || 20, 50) }
            );

            if (!data?.rows || data.rows.length === 0) {
                return {
                    result: {
                        activeUsers: 0,
                        dimensions: dims,
                        rowsReturned: 0,
                        note: 'No active users right now, or the property may not be accessible.',
                    },
                };
            }

            const dimHeaders = (data.dimensionHeaders || []).map((h: any) => h.name);
            const parsedRows = data.rows.map((row: any) => {
                const entry: Record<string, any> = {};
                dimHeaders.forEach((name: string, i: number) => {
                    entry[name] = row.dimensionValues[i]?.value || '';
                });
                entry.activeUsers = parseInt(row.metricValues[0]?.value || '0');
                return entry;
            });

            const totalActive = parsedRows.reduce((sum: number, r: any) => sum + (r.activeUsers || 0), 0);

            // CSV compression
            const allCols = [...dimHeaders, 'activeUsers'];
            const csvHeader = allCols.join(',');
            const csvRows = parsedRows.map((row: any) =>
                allCols.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(',')
            );

            return {
                result: {
                    totalActiveUsers: totalActive,
                    dimensions: dims,
                    rowsReturned: parsedRows.length,
                    csvData: [csvHeader, ...csvRows].join('\n'),
                },
                structuredData: {
                    dimensions: dimHeaders,
                    rows: parsedRows,
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to fetch realtime data' };
        }
    }

    if (name === 'get_custom_dimensions') {
        const { propertyId } = args;
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }

        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const metadata = await getPropertyMetadata(token, propertyId);

            const customDims = metadata.customDimensions.map((d: any) => ({
                apiName: d.apiName,
                displayName: d.uiName || d.apiName,
                description: d.description || '',
                scope: d.scope || '',
            }));

            const customMets = metadata.customMetrics.map((m: any) => ({
                apiName: m.apiName,
                displayName: m.uiName || m.apiName,
                description: m.description || '',
                type: m.type || '',
            }));

            return {
                result: {
                    propertyId,
                    standardDimensionsAvailable: metadata.standardDimensionCount,
                    standardMetricsAvailable: metadata.standardMetricCount,
                    customDimensionCount: customDims.length,
                    customMetricCount: customMets.length,
                    customDimensions: customDims,
                    customMetrics: customMets,
                    note: customDims.length === 0 && customMets.length === 0
                        ? 'No custom dimensions or metrics configured on this property. You can still use all standard GA4 dimensions and metrics with run_ga4_report.'
                        : 'Use these apiName values in run_ga4_report dimensions/metrics parameters.',
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to fetch property metadata' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // A2 — get_alerts: deterministic anomalies from dashboard snapshot
    // ═══════════════════════════════════════════════════════════════
    if (name === 'get_alerts') {
        try {
            const alerts = computeAlerts(gscContext?.seoContext, gscContext?.analyticsContext);
            const wantSeverity: string = args.severity || 'all';
            const wantCategory: string | undefined = args.category;
            const filtered = alerts.filter((a) => {
                if (wantSeverity !== 'all' && a.severity !== wantSeverity) return false;
                if (wantCategory && a.category !== wantCategory) return false;
                return true;
            });
            return {
                result: {
                    task: 'Triage these alerts. Lead with the most severe; cite the metric and change %. End with a single 🎯 VERDICT line.',
                    expectedFormat: 'For each: ## [emoji per severity] Title — N% change. 1-2 line description with the metric. Then "Action: ..."',
                    counts: {
                        critical: alerts.filter((a) => a.severity === 'critical').length,
                        warning: alerts.filter((a) => a.severity === 'warning').length,
                        info: alerts.filter((a) => a.severity === 'info').length,
                        success: alerts.filter((a) => a.severity === 'success').length,
                        total: alerts.length,
                    },
                    alerts: filtered.slice(0, 20),
                    note: filtered.length === 0
                        ? 'No alerts at this severity/category. Either nothing is wrong, or dashboard data is missing — check the snapshot is loaded.'
                        : null,
                },
            };
        } catch (e: any) {
            return { error: 'compute_failed', message: e?.message || 'Failed to compute alerts.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // A8 — run_site_audit: 50+ HTML/SEO checks via siteAudit.ts
    // ═══════════════════════════════════════════════════════════════
    if (name === 'run_site_audit') {
        try {
            const report = await runSiteAudit(args.url);
            // Trim verbose details — Gemini doesn't need every link/image/script,
            // it needs ranked issues + the meta block.
            const topIssues = report.issues
                .filter((i) => i.severity === 'critical' || i.severity === 'warning')
                .slice(0, 12);
            return {
                result: {
                    task: 'Triage these audit issues; rank by impact; for each issue give a one-line fix.',
                    expectedFormat: 'Markdown table: | Severity | Issue | Why it matters | Fix |. Then a "Site Score: N/100 — [verdict]" line.',
                    url: report.url,
                    score: report.score,
                    statusCode: report.statusCode,
                    responseTimeMs: report.responseTime,
                    summary: report.summary,
                    meta: report.meta,
                    issues: topIssues.map((i) => ({
                        severity: i.severity,
                        category: i.category,
                        title: i.title,
                        description: i.description,
                        recommendation: i.recommendation,
                        value: i.value,
                    })),
                    note: report.issues.length > topIssues.length
                        ? `${report.issues.length - topIssues.length} additional info-level issues omitted for brevity.`
                        : null,
                },
            };
        } catch (e: any) {
            return { error: 'audit_failed', message: e?.message || 'Site audit failed.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // A9 — inspect_url: GSC URL Inspection API (indexing/mobile/rich results)
    // ═══════════════════════════════════════════════════════════════
    if (name === 'inspect_url') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }
        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const data = await inspectGscUrl(token, args.siteUrl, args.pageUrl);
            const result = data?.inspectionResult || {};
            return {
                result: {
                    task: 'Read this URL inspection. State plainly: is the page indexed? When was it last crawled? Any blockers? Any rich-result errors? End with one verdict line.',
                    expectedFormat: '🎯 VERDICT line, then a short bulleted breakdown of (1) coverage, (2) crawl, (3) mobile usability, (4) rich results.',
                    pageUrl: args.pageUrl,
                    indexStatusResult: result.indexStatusResult || null,
                    mobileUsabilityResult: result.mobileUsabilityResult || null,
                    richResultsResult: result.richResultsResult || null,
                    ampResult: result.ampResult || null,
                    inspectionResultLink: result.inspectionResultLink || null,
                },
            };
        } catch (e: any) {
            return { error: 'inspection_failed', message: e?.message || 'GSC URL Inspection API call failed.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // A10 — cross_source_diagnose: one-shot orchestrator
    //   Internally chains: period-compare → site-repo lookup → recent commits → optional inspection.
    //   Counts as 1 chat turn but uses up to 4 internal API calls.
    // ═══════════════════════════════════════════════════════════════
    if (name === 'cross_source_diagnose') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }
        try {
            const lookbackDays = Math.max(7, Math.min(90, args.lookbackDays || 14));
            const today = new Date();
            const isoDate = (d: Date) => d.toISOString().split('T')[0];
            const period2End = isoDate(today);
            const period2Start = isoDate(new Date(today.getTime() - lookbackDays * 86400_000));
            const period1End = isoDate(new Date(today.getTime() - lookbackDays * 86400_000 - 86400_000));
            const period1Start = isoDate(new Date(today.getTime() - lookbackDays * 2 * 86400_000));

            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);

            // Step 1: period comparison to find the change magnitude
            const compareBody = (start: string, end: string) => ({
                startDate: start,
                endDate: end,
                dimensions: args.pagePath ? ['date', 'page'] : ['date'],
                rowLimit: 200,
                dataState: 'all' as const,
            });
            const [p1, p2] = await Promise.allSettled([
                queryGSCWithAutoResolve(token, args.siteUrl, compareBody(period1Start, period1End)),
                queryGSCWithAutoResolve(token, args.siteUrl, compareBody(period2Start, period2End)),
            ]);
            const rows1 = p1.status === 'fulfilled' ? (p1.value.data?.rows || []) : [];
            const rows2 = p2.status === 'fulfilled' ? (p2.value.data?.rows || []) : [];

            // Filter to pagePath if provided (works for [date, page] dimension order)
            const filterByPath = (rows: any[]) =>
                args.pagePath ? rows.filter((r: any) => String(r.keys[1] || '').includes(args.pagePath!)) : rows;
            const r1Filtered = filterByPath(rows1);
            const r2Filtered = filterByPath(rows2);
            const sumClicks = (rows: any[]) => rows.reduce((s: number, r: any) => s + (r.clicks || 0), 0);
            const c1 = sumClicks(r1Filtered);
            const c2 = sumClicks(r2Filtered);
            const deltaClicks = c2 - c1;
            const deltaPct = c1 > 0 ? Math.round((deltaClicks / c1) * 100) : 0;

            // Find the single biggest single-day drop (or rise) within the window
            const dailyMap = new Map<string, number>();
            for (const r of r2Filtered) {
                const date = r.keys[0];
                dailyMap.set(date, (dailyMap.get(date) || 0) + (r.clicks || 0));
            }
            const dailyArr = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            let biggestDrop = { date: period2Start, magnitude: 0 };
            for (let i = 1; i < dailyArr.length; i++) {
                const prev = dailyArr[i - 1][1];
                const curr = dailyArr[i][1];
                if (prev > 0) {
                    const drop = prev - curr;
                    if (drop > biggestDrop.magnitude) {
                        biggestDrop = { date: dailyArr[i][0], magnitude: drop };
                    }
                }
            }
            const startDate = biggestDrop.magnitude > 0 ? biggestDrop.date : period2Start;

            // Step 2: site-repo lookup (best-effort; missing is fine)
            let linkedRepo: string | null = null;
            try {
                if (gscContext.userId && ADMIN_API_KEY) {
                    const linksRes = await fetch(
                        `${ADMIN_API_URL}/api/users/${encodeURIComponent(gscContext.userId)}/site-repo-links`,
                        { headers: { 'X-API-Key': ADMIN_API_KEY }, signal: AbortSignal.timeout(5000) }
                    );
                    if (linksRes.ok) {
                        const data = await linksRes.json();
                        const link = (data.links || []).find((l: any) =>
                            l.site_url === args.siteUrl ||
                            l.site_url === args.siteUrl.replace(/^sc-domain:/, 'https://') + '/' ||
                            String(l.site_url || '').includes(String(args.siteUrl).replace(/^sc-domain:/, ''))
                        );
                        if (link) linkedRepo = link.repo_full_name;
                    }
                }
            } catch { /* swallow — repo lookup is best-effort */ }

            // Step 3: recent commits in the suspect window (only if we found a repo and have a token)
            let suspectCommits: any[] = [];
            if (linkedRepo) {
                try {
                    const ghToken = await getValidGithubToken(gscContext.githubAccessToken, gscContext.userId);
                    if (ghToken) {
                        const since = isoDate(new Date(new Date(startDate).getTime() - 3 * 86400_000));
                        const commitsR = await getRecentCommits(ghToken, {
                            repo: linkedRepo,
                            since: `${since}T00:00:00Z`,
                            until: `${period2End}T23:59:59Z`,
                            path: args.pagePath || undefined,
                            per_page: 15,
                        });
                        if (!('error' in commitsR)) suspectCommits = commitsR.data || [];
                    }
                } catch { /* swallow */ }
            }

            // Step 4: URL inspection (only for indexing-symptom + a specific pagePath)
            let indexingStatus: any = null;
            if (args.symptom === 'indexing_error' && args.pagePath) {
                try {
                    const fullUrl = args.pagePath.startsWith('http')
                        ? args.pagePath
                        : `${args.siteUrl.replace(/^sc-domain:/, 'https://').replace(/\/$/, '')}${args.pagePath.startsWith('/') ? '' : '/'}${args.pagePath}`;
                    const inspectData = await inspectGscUrl(token, args.siteUrl, fullUrl);
                    indexingStatus = inspectData?.inspectionResult?.indexStatusResult || null;
                } catch { /* swallow */ }
            }

            return {
                result: {
                    task: 'State the verdict in ONE sentence (drop magnitude, suspected start date, suspected cause). Then evidence bullets. Then "Action: …".',
                    expectedFormat: '🎯 VERDICT — [drop] on [page] starting [date]. Cause: [PR/commit/index]. \\n\\nEvidence:\\n- …\\n\\nAction: …',
                    siteUrl: args.siteUrl,
                    symptom: args.symptom,
                    pagePath: args.pagePath || null,
                    window: { period1Start, period1End, period2Start, period2End },
                    magnitude: { period1Clicks: c1, period2Clicks: c2, deltaClicks, deltaPct },
                    suspectStartDate: startDate,
                    biggestSingleDayDrop: biggestDrop.magnitude > 0 ? biggestDrop : null,
                    linkedRepo,
                    suspectCommits,
                    indexingStatus,
                    notes: [
                        !linkedRepo ? 'No linked repo for this site — set one up to enable commit correlation.' : null,
                        suspectCommits.length === 0 && linkedRepo ? 'No commits found in the suspect window for this path.' : null,
                    ].filter(Boolean),
                },
            };
        } catch (e: any) {
            return { error: 'diagnose_failed', message: e?.message || 'Cross-source diagnosis failed.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // GITHUB TOOL EXECUTORS
    // ═══════════════════════════════════════════════════════════════
    const GITHUB_TOOLS = new Set([
        'list_user_repos',
        'get_repo_health',
        'search_repo_code',
        'get_recent_commits',
        'get_pull_requests',
        'get_repo_issues',
        'get_workflow_runs',
        'get_file_contents',
    ]);

    if (GITHUB_TOOLS.has(name)) {
        const token = await getValidGithubToken(gscContext?.githubAccessToken, gscContext?.userId);
        if (!token) {
            return {
                error: 'github_not_connected',
                response: 'GitHub is not connected for this account. Ask the user to click "Connect GitHub" in Settings, then retry.',
            };
        }

        try {
            switch (name) {
                case 'list_user_repos':
                    return forwardGithubResult(await listUserRepos(token, args));
                case 'get_repo_health':
                    return forwardGithubResult(await getRepoHealth(token, args as { repo: string }));
                case 'search_repo_code':
                    return forwardGithubResult(await searchRepoCode(token, args as { query: string; repo?: string }));
                case 'get_recent_commits':
                    return forwardGithubResult(await getRecentCommits(token, args as any));
                case 'get_pull_requests':
                    return forwardGithubResult(await getPullRequests(token, args as any));
                case 'get_repo_issues':
                    return forwardGithubResult(await getRepoIssues(token, args as any));
                case 'get_workflow_runs':
                    return forwardGithubResult(await getWorkflowRuns(token, args as any));
                case 'get_file_contents':
                    return forwardGithubResult(await getFileContents(token, args as { repo: string; path: string; ref?: string }));
            }
        } catch (e: any) {
            return { error: 'github_tool_failed', response: e?.message || 'GitHub tool execution failed.' };
        }
    }

    return { error: `Tool "${name}" not found. Available tools: get_search_performance, calculate_revenue_impact, run_ga4_report, run_page_audit, generate_content_strategy, analyze_keyword_clusters, compare_time_periods, find_cannibalization, suggest_internal_links, generate_meta_tags, run_realtime_report, get_custom_dimensions, list_user_repos, get_repo_health, search_repo_code, get_recent_commits, get_pull_requests, get_repo_issues, get_workflow_runs, get_file_contents` };
}

// Normalize the GithubResult discriminated union into the {result, error} shape
// the chat route already understands.
function forwardGithubResult(r: any) {
    if (r && typeof r === 'object' && 'error' in r) {
        return { error: r.error, response: r.message || r.error };
    }
    return { result: r?.data ?? r };
}
