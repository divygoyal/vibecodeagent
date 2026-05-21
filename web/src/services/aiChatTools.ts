// AI Chat Tools Definition & Executor
// These tools are injected into the Gemini API so the AI can "call" them to perform deep diagnosis.
import {
    getValidAccessToken,
    runFlexibleGAReport,
    runFlexibleRealtimeReport,
    getPropertyMetadata,
    inspectGscUrl,
    fetchFunnelData,
    fetchJourneyData,
    fetchRetentionCohorts,
} from '@/lib/googleApi';
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
    getPullRequestFiles,
} from '@/lib/githubApi';
import { computeAlerts } from '@/lib/alertEngine';
import { runSiteAudit } from '@/lib/siteAudit';
import { inspectPageHtml } from '@/lib/pageInspect';
import { wrapUntrusted } from '@/lib/chatSafety';
import { detectTopInsights } from '@/lib/insightEngine';
import { analyzePageIntentMismatch } from '@/lib/pageIntentMismatch';
import { fetchSerpCompetitors } from '@/lib/braveSearch';

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

EFFICIENCY: One call. Quota: 2000/day per property. The chat route caps to 3 inspections per conversation.

NOTE: This returns Google's metadata about the page (is it indexed? mobile-friendly? schema valid?). It does NOT return the page's actual HTML — for that use \`fetch_page_html\`.`,
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
        name: 'fetch_page_html',
        description: `Fetch a public URL and parse its actual HTML. Returns the real on-page content the user shipped: title, meta description, canonical, EVERY h1/h2/h3 (so you can flag duplicate H1s), parsed JSON-LD blocks + detected schema.org types, Open Graph + Twitter Card fields, hreflang map, internal/external link counts + sample anchor texts, image alt-text coverage, robots meta, page weight in KB.

WHEN TO USE — REQUIRED before any of these:
- Recommending changes to a SPECIFIC page's title or meta description (you need to read the current ones first).
- Diagnosing a schema / structured-data issue (you need the JSON-LD blocks parsed).
- Analyzing on-page SEO for a URL the user named.
- Suggesting internal-link / anchor-text changes (you need the current anchors).
- Comparing what's on the page vs. what the user thinks is on the page.

WHEN NOT TO USE:
- "Is /X indexed?" → use \`inspect_url\` (Google's view, not the HTML).
- Performance / Core Web Vitals → use \`run_page_audit\`.
- Generic SEO health score → use \`compute_site_health_score\`.

Combine with inspect_url when both Google's view AND the page content matter. Cap at 3 calls per conversation to respect the user's origin.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                url: {
                    type: 'STRING' as const,
                    description: 'Full https:// URL of the page to fetch and parse. Must be a public URL on the user\'s site.',
                },
            },
            required: ['url'],
        },
    },
    {
        name: 'analyze_page_intent_mismatch',
        description: `Determine whether a page is ranking for queries it actually satisfies. Returns the page's top GSC queries (last 28 days), the page's current title/H1/meta/first-paragraph excerpt, a Jaccard token-overlap score between the two, an impression-weighted CTR vs. the position benchmark, and a categorical diagnosis (aligned / partial_mismatch / severe_mismatch / inconclusive).

WHEN TO USE — REQUIRED before recommending title/meta/H1/schema changes when ANY of these is true:
- A page has page-1 rankings (avg position ≤ 10) but CTR is more than 3 percentage points below the position benchmark.
- A page has hundreds of impressions but <10 clicks total (the classic /mcp pattern).
- The user asks "why is /X leaking traffic" or "this page gets impressions but no clicks".

WHY THIS MATTERS: at the magnitudes seen in production (CTR >5× below benchmark at page-1 positions), the cause is almost never title/meta — it's intent fit. The page is appearing for queries it doesn't satisfy, so users skip it in the SERP regardless of the title. A title rewrite on a severely-mismatched page is wasted work. This tool tells you which problem you have.

OUTPUT: returns { diagnosis, signals[], pageQueries[], pageContent, overlapScore, ctrGapPercentagePoints, ... }. Read \`diagnosis\` first; if 'severe_mismatch', do NOT recommend a title rewrite — recommend either re-targeting the page (rewrite content to match the queries) or accepting the queries aren't worth chasing.

Capped at 5 calls per conversation. Combine with \`fetch_page_html\` when the user wants the full on-page audit, but for the leak-diagnosis question this tool alone is sufficient.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: {
                    type: 'STRING' as const,
                    description: 'GSC site URL from [AVAILABLE SITES] (e.g. "sc-domain:example.com" or "https://example.com/").',
                },
                pageUrl: {
                    type: 'STRING' as const,
                    description: 'Full https:// URL of the page to analyze. Must be a verified URL on the site.',
                },
            },
            required: ['siteUrl', 'pageUrl'],
        },
    },
    {
        name: 'fetch_serp_competitors',
        description: `Fetch the top organic search results for a query from Brave Search (real SERP, not scraped). Use this when the user wants to know what the pages beating them look like — title structure, snippet copy, content angle — so you can give CONCRETE rewrite suggestions instead of generic advice.

WHEN TO USE:
- "Why is /X ranking #6 when /competitor.com ranks #1 for the same query?"
- "What does my title need to look like to beat the current page-1 results for <query>?"
- "Show me the SERP for <query> — I want to know what's there."
- COMPARISON intent — backing up "your title is weak" with "the #3 result for this query uses <structure>".

WHEN NOT TO USE:
- The user's own page analysis — use \`fetch_page_html\` for that.
- "Should I rank for X?" type strategic questions — answer from the user's site data first.
- Generic SEO advice — this tool only helps when you'll cite a SPECIFIC competitor's structure.

OUTPUT: { query, country, results: [{ rank, title, url, description, favicon?, age? }], source: "brave" }. Brave's web index, real organic results. Capped at 3 calls per conversation (free-tier quota defense). Results cached 24h per (query, country, limit).

NEVER cite a competitor URL or title structure you haven't actually pulled from this tool.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                query: {
                    type: 'STRING' as const,
                    description: 'The search query (max 400 chars).',
                },
                limit: {
                    type: 'INTEGER' as const,
                    description: 'How many results to return (default 10, max 20). Use 5 for "just the top results", 10-15 for "page 1", 20 for thorough analysis.',
                },
                country: {
                    type: 'STRING' as const,
                    description: 'ISO 2-letter country code (default "us"). Use the country that matches the user\'s target market when the site has regional focus.',
                },
            },
            required: ['query'],
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
    // ═══════════════════════════════════════════════════════════════
    // PHASE B-4 — funnel, journey, cohort, PR-SEO-diff, site-health, annotation
    // ═══════════════════════════════════════════════════════════════
    {
        name: 'run_funnel_analysis',
        description: `Run a multi-step conversion funnel against GA4. Pass an ordered list of page paths (e.g. ["/pricing", "/checkout", "/thank-you"]) and the tool returns visitors, % of step 1, and drop-off % per step.

WHEN TO USE: "Where do users drop in my checkout?" / "How many visitors reach /thank-you?" / "Drop-off between /signup and /onboarding?" — questions that ask about progression through a sequence of pages.

DO NOT use for single-page metrics — use run_ga4_report instead.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: { type: 'STRING' as const, description: 'GA4 property ID from [AVAILABLE PROPERTIES].' },
                stepPages: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const },
                    description: 'Ordered list of page paths (2–8 steps). Step 1 = top of funnel.',
                },
                range: { type: 'STRING' as const, description: 'Date range like "30d", "7d", "90d". Default "30d".' },
            },
            required: ['propertyId', 'stepPages'],
        },
    },
    {
        name: 'run_journey_analysis',
        description: `Surface user journey patterns: top landing pages, top exit pages, and the most-traveled paths through the site. Combines several GA4 reports.

WHEN TO USE: "Where do users start?" / "Where do they leave?" / "What are the common paths through my site?" / "Why are users not getting to my CTA?"`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: { type: 'STRING' as const, description: 'GA4 property ID from [AVAILABLE PROPERTIES].' },
                range: { type: 'STRING' as const, description: 'Date range like "30d". Default "30d".' },
            },
            required: ['propertyId'],
        },
    },
    {
        name: 'run_cohort_retention',
        description: `Compute cohort retention curves (% of users from each cohort still active on day N / week N / month N). Distinguishes "traffic dropped" from "we broke retention" — competitor blind spot.

WHEN TO USE: "Are returning users sticking?" / "What's my D7 retention?" / "Did the redesign hurt repeat visits?"`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                propertyId: { type: 'STRING' as const, description: 'GA4 property ID from [AVAILABLE PROPERTIES].' },
                mode: {
                    type: 'STRING' as const,
                    enum: ['daily', 'weekly', 'monthly'],
                    description: 'Cohort granularity. Default "daily" (last 14 cohorts).',
                },
            },
            required: ['propertyId'],
        },
    },
    {
        name: 'analyze_pr_seo_diff',
        description: `Pull a Pull Request's file diff and flag SEO-meaningful changes: <head> meta/title/canonical edits, robots.txt changes, _redirects/next.config edits, JSON-LD schema changes, sitemap edits, noindex toggles. Returns ranked findings with the relevant patch snippets.

WHEN TO USE: "Did PR #123 break SEO?" / "What changed in PR #456 that could affect ranking?" / Used internally by cross_source_diagnose when a suspect PR is identified.

REQUIRES: GitHub connected + repo specified. Do NOT call without [Repo:] tag set.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                repo: { type: 'STRING' as const, description: 'Repo as "owner/repo".' },
                prNumber: { type: 'INTEGER' as const, description: 'Pull Request number.' },
            },
            required: ['repo', 'prNumber'],
        },
    },
    {
        name: 'find_top_money_move',
        description: `Return the SINGLE highest-$/mo opportunity (or top N ranked by $) from the deterministic insightEngine. Computed from the enriched dashboard snapshot — covers CTR leaks, striking-distance keywords, cannibalization, content decay, mobile gap, branded overdependence, position regressions, and page-2 breakthroughs. Each insight comes pre-loaded with: page URL, query, evidence numbers, $/mo lost estimate, projected click gain, effort minutes, difficulty, and (when available) the page's CURRENT title/meta/H1 so you can recommend a specific rewrite.

WHEN TO USE:
- "What is the ONE thing I should do today to grow?" / "biggest leak" / "highest-impact fix" / "where do I focus first?"
- DEEP_DIVE intent — this is the tool you call FIRST. It returns the receipt-ready payload.
- Whenever you need to pick a SINGLE concrete move with $-math attached.

EFFICIENCY: 0 API calls — pure deterministic computation on the already-enriched snapshot. Always cheaper than searching the snapshot yourself for the highest-value pattern.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                limit: {
                    type: 'INTEGER' as const,
                    description: 'How many ranked insights to return. Default 1 (just THE top move). Use 5 only when the user explicitly asked for "top N opportunities".',
                },
                category: {
                    type: 'STRING' as const,
                    enum: ['ctr_leak', 'striking_distance', 'cannibalization', 'content_decay', 'mobile_gap', 'branded_overdependence', 'new_query_opportunity', 'position_regression', 'page_2_breakthrough', 'untapped_geo'],
                    description: 'Optional: restrict to a single insight category. Default: any.',
                },
                minMonthlyValue: {
                    type: 'NUMBER' as const,
                    description: 'Optional: minimum $/mo threshold. Default 30.',
                },
                excludeInsightIds: {
                    type: 'ARRAY' as const,
                    items: { type: 'STRING' as const },
                    description: 'Optional: insight IDs to hard-exclude (in addition to thread-state-tracked recently-surfaced IDs which are excluded automatically). Use when the user explicitly asks for "a different angle" or "something else".',
                },
            },
            required: [],
        },
    },
    {
        name: 'compute_site_health_score',
        description: `Aggregate health-roll-up: combines run_site_audit (HTML/SEO checks) + get_alerts (anomalies) + recent commit count → single 0-100 score with sub-scores per dimension. Gives executives one number; gives the chat a cheap "is anything on fire?" entry point.

WHEN TO USE: "Give me my SEO health score" / "Is everything OK?" / "Quick health check" / first-look question on a site.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                siteUrl: { type: 'STRING' as const, description: 'Full URL to audit (e.g., https://example.com).' },
                repo: { type: 'STRING' as const, description: 'Optional "owner/repo" — when present, contributes a "deploy velocity" sub-score from recent commits.' },
            },
            required: ['siteUrl'],
        },
    },
    {
        name: 'write_dashboard_annotation',
        description: `Persist the chat's verdict back to the user's dashboard as an annotation pinned at a specific date. Builds a shared, time-anchored knowledge base — chat answers stop being ephemeral.

WHEN TO USE: after delivering a diagnostic verdict ("Drop began Apr 12; PR #42 was the cause") OR when the user explicitly asks "save this", "log this", "remember this", "annotate this".

DO NOT spam — at most ONE annotation per chat response.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                date: { type: 'STRING' as const, description: 'YYYY-MM-DD — the date the annotation should anchor to (the event date, not today).' },
                title: { type: 'STRING' as const, description: 'Short title (≤80 chars).' },
                description: { type: 'STRING' as const, description: 'Longer body (≤500 chars).' },
                category: {
                    type: 'STRING' as const,
                    enum: ['deploy', 'algorithm_update', 'campaign', 'incident', 'verdict', 'custom'],
                    description: 'Category. Default "verdict" (chat-generated).',
                },
                propertyId: { type: 'STRING' as const, description: 'Optional GA4 property to scope the annotation to.' },
            },
            required: ['date', 'title'],
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
    /** Pre-computed enriched snapshot (winners-losers, cannibalization, mobile-gap, page-meta,
     *  ranked insights, branded split). When present, find_top_money_move serves directly from
     *  this without re-fetching GSC. Built by chatSnapshot.buildEnrichedSnapshot() in route.ts. */
    enrichedSnapshot?: any;
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
    find_top_money_move: (a) => {
        if (a.limit !== undefined && (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 10)) return 'limit must be an integer between 1 and 10';
        if (a.minMonthlyValue !== undefined && (typeof a.minMonthlyValue !== 'number' || a.minMonthlyValue < 0)) return 'minMonthlyValue must be a non-negative number';
        if (a.excludeInsightIds !== undefined && !Array.isArray(a.excludeInsightIds)) return 'excludeInsightIds must be an array of strings';
        return null;
    },
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
    run_funnel_analysis: (a) => {
        if (typeof a.propertyId !== 'string' || !a.propertyId) return 'propertyId is required';
        if (!Array.isArray(a.stepPages) || a.stepPages.length < 2) return 'stepPages must be an array of at least 2 page paths';
        if (a.stepPages.length > 8) return 'stepPages capped at 8 steps — collapse intermediate steps';
        for (const p of a.stepPages) if (typeof p !== 'string' || !p.startsWith('/')) return `stepPages entries must be absolute paths (e.g. "/checkout"); got "${p}"`;
        return null;
    },
    run_journey_analysis: (a) => {
        if (typeof a.propertyId !== 'string' || !a.propertyId) return 'propertyId is required';
        return null;
    },
    run_cohort_retention: (a) => {
        if (typeof a.propertyId !== 'string' || !a.propertyId) return 'propertyId is required';
        if (a.mode && !['daily', 'weekly', 'monthly'].includes(a.mode)) return 'mode must be daily | weekly | monthly';
        return null;
    },
    analyze_pr_seo_diff: (a) => {
        if (typeof a.repo !== 'string' || !a.repo) return 'repo is required';
        if (!Number.isInteger(a.prNumber) || a.prNumber <= 0) return 'prNumber must be a positive integer';
        return null;
    },
    compute_site_health_score: (a) => {
        if (typeof a.siteUrl !== 'string' || !/^https?:\/\//.test(a.siteUrl)) return 'siteUrl must be a full URL (https://…)';
        return null;
    },
    write_dashboard_annotation: (a) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) return 'date must be YYYY-MM-DD';
        if (typeof a.title !== 'string' || !a.title.trim()) return 'title is required';
        if (a.title.length > 80) return 'title must be ≤80 chars';
        if (a.description && a.description.length > 500) return 'description must be ≤500 chars';
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
    // find_top_money_move — DEEP_DIVE-grade ranked insights (no API call)
    //   Reads gscContext.enrichedSnapshot (built once per turn in route.ts)
    //   and returns the top-N insights pre-ranked by $/mo lost.
    // ═══════════════════════════════════════════════════════════════
    if (name === 'find_top_money_move') {
        try {
            const limit = Math.min(Math.max(args.limit || 1, 1), 10);
            const minValue = typeof args.minMonthlyValue === 'number' ? args.minMonthlyValue : 30;
            const categoryFilter: string | undefined = args.category;
            const explicitExcludeIds: string[] = Array.isArray(args.excludeInsightIds) ? args.excludeInsightIds : [];

            // Prefer the enriched snapshot built in route.ts. When absent (e.g., tools
            // invoked outside the chat route), fall back to recomputing from raw context.
            const snap = gscContext?.enrichedSnapshot;
            let insights = snap?.insights;
            if (!Array.isArray(insights)) {
                insights = detectTopInsights({
                    seoContext: gscContext?.seoContext,
                    analyticsContext: gscContext?.analyticsContext,
                    winnersLosers: snap?.winnersLosers,
                    cannibalization: snap?.cannibalization,
                    mobileGap: snap?.mobileGap,
                    brand: snap?.brand,
                    pageMeta: snap?.pageMeta,
                }, 10);
            }

            // Hard exclusion: prior-surfaced IDs from thread state PLUS any IDs the
            // model explicitly asked to exclude. Soft demotion already handles the
            // ranker, but DEEP_DIVE persona can request hard skip when the user is
            // explicitly chasing a different angle.
            const excludeSet = new Set<string>([
                ...(snap?.recentlySurfacedIds || []),
                ...explicitExcludeIds,
            ]);

            const filtered = insights
                .filter((i: any) => !excludeSet.has(i.id))
                .filter((i: any) => i.monthlyValueLost >= minValue || i.isStrategic === true || i.category === 'branded_overdependence')
                .filter((i: any) => !categoryFilter || i.category === categoryFilter)
                .slice(0, limit);

            if (filtered.length === 0) {
                // Honest no-result path — let the model say "nothing significant" instead
                // of fabricating something.
                return {
                    result: {
                        task: 'No insight cleared the minimum-value threshold. Tell the user honestly: "Your data is healthy — no obvious money leak right now. Closest opportunity is X with $Y/mo." Then deep-dive that opportunity.',
                        expectedFormat: 'Plain-prose acknowledgment + the closest insight (which may be below threshold). DO NOT invent a leak that does not exist.',
                        topInsights: [],
                        closestBelowThreshold: insights[0] || null,
                        snapshotComputedAt: snap?.computedAt || null,
                    },
                };
            }

            const topInsight = filtered[0];
            const isTopStrategic = topInsight.isStrategic === true;

            return {
                result: {
                    task: isTopStrategic
                        ? 'The top insight is STRATEGIC (root-cause growth blocker). Narrate in the DEEP_DIVE shape but ADAPT: 🎯 The diagnosis (name the root cause, not a $ figure) → 📊 Receipts (the distribution/breakdown that proves it) → 🧭 The cost of not fixing (what stays the same if ignored — not $/mo math) → 🔧 The fix (specific pages or actions, not meta rewrites) → 🔮 What\'s adjacent (cross-source observation).'
                        : 'The top insight is TACTICAL ($-quantifiable SEO fix). Narrate in the DEEP_DIVE shape: 🎯 The move (name URL/keyword + $/mo) → 📊 Receipts table (numbers from evidence) → 💰 The math (current → target → lift, with the $ formula) → 🔧 The fix (with before/after when fix.before is set) → 🔮 What\'s adjacent.',
                    expectedFormat: isTopStrategic
                        ? 'Markdown sections in the order above. Receipts is a table showing the breakdown that proves the diagnosis (e.g., intent-class distribution, channel mix, content vs conversion views). NO $-math section — replace with 🧭 cost-of-inaction prose. Fix names specific pages/actions, not meta tweaks.'
                        : 'Markdown sections in the order above. Receipts must be a table with the exact evidence numbers. The fix MUST name the URL and (when available) show before/after meta-tag text.',
                    insightKind: isTopStrategic ? 'strategic' : 'tactical',
                    insightCount: filtered.length,
                    topInsights: filtered,
                    snapshotComputedAt: snap?.computedAt || null,
                    note: isTopStrategic
                        ? 'Top insight is STRATEGIC — these are root-cause growth blockers, not tactical fixes. Do NOT call run_site_audit; the proof is in the snapshot. Do NOT compute $/mo math (none meaningful here). The "wow" is in the diagnosis itself.'
                        : (topInsight.fix.before
                            ? 'Page-meta was fetched — fix.before contains the page\'s current title/description/H1. Use them in your before/after comparison.'
                            : 'Page-meta NOT fetched for this insight. If recommending a meta rewrite, you must call run_site_audit on the page URL first to get the current title before suggesting a replacement.'),
                },
            };
        } catch (e: any) {
            return { error: 'money_move_failed', message: e?.message || 'Insight detection failed.' };
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

    if (name === 'fetch_page_html') {
        // Fetches the user's public URL and parses its HTML so the model can
        // ground recommendations in actual on-page content. Returns a blank
        // record (with `error` set) instead of throwing on network failure —
        // a structured "couldn't reach the page" result is more useful to
        // Gemini than a tool error.
        try {
            const url = typeof args.url === 'string' ? args.url.trim() : '';
            if (!url) return { error: 'invalid_args', message: 'url is required' };
            const data = await inspectPageHtml(url);
            if (!data.fetched) {
                return {
                    result: {
                        task: 'Tell the user the page could not be fetched and why. Suggest one specific next step (try a different URL, check that the page is public, retry).',
                        url: data.url,
                        statusCode: data.statusCode,
                        error: data.error,
                        fetched: false,
                    },
                };
            }
            return {
                result: {
                    task: 'Use this real on-page content to ground every recommendation. Quote the actual title / meta / H1 / schema fields when proposing changes. Never claim a field is "missing" without first checking the relevant section here.',
                    expectedFormat: 'When recommending a meta rewrite, show CURRENT vs PROPOSED. When flagging schema gaps, name the exact missing JSON-LD field. When suggesting anchor changes, reference sampleInternalAnchors.',
                    url: data.url,
                    statusCode: data.statusCode,
                    pageWeightKb: data.pageWeightKb,
                    title: data.title,
                    metaDescription: data.metaDescription,
                    canonical: data.canonical,
                    robotsMeta: data.robotsMeta,
                    noindex: data.noindex,
                    nofollow: data.nofollow,
                    headings: data.headings,
                    schemaTypes: data.schemaTypes,
                    jsonLdCount: data.jsonLd.length,
                    jsonLd: data.jsonLd,
                    openGraph: data.openGraph,
                    twitterCard: data.twitterCard,
                    hreflang: data.hreflang,
                    wordCount: data.wordCount,
                    internalLinks: data.internalLinks,
                    externalLinks: data.externalLinks,
                    sampleInternalAnchors: data.sampleInternalAnchors,
                    images: data.images,
                },
            };
        } catch (e: any) {
            return { error: 'fetch_failed', message: e?.message || 'Failed to fetch the page.' };
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
    // PHASE B-4 — funnel / journey / cohort
    // ═══════════════════════════════════════════════════════════════
    if (name === 'run_funnel_analysis') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }
        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const steps = await fetchFunnelData(token, args.propertyId, args.stepPages, args.range || '30d');
            return {
                result: {
                    task: 'Identify the BIGGEST drop step. Quantify lost users. Recommend ONE specific fix for that step.',
                    expectedFormat: '🎯 VERDICT — The drop is at step N (X→Y, -Z%). Then a markdown table: | # | Step | Visitors | % of step 1 | Drop-off |. Then ⚡ ACTION line.',
                    propertyId: args.propertyId,
                    range: args.range || '30d',
                    steps,
                    biggestDrop: steps.reduce((worst: any, s: any, i: number) =>
                        i > 0 && s.dropOff > (worst?.dropOff || 0) ? { stepIndex: i, name: s.name, dropOff: s.dropOff, lostUsers: (steps[i - 1].visitors - s.visitors) } : worst
                        , null),
                },
            };
        } catch (e: any) {
            return { error: 'funnel_failed', message: e?.message || 'Failed to fetch funnel data.' };
        }
    }

    if (name === 'run_journey_analysis') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }
        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const journey = await fetchJourneyData(token, args.propertyId, args.range || '30d');
            return {
                result: {
                    task: 'State (1) where users land most, (2) where they leak out, (3) the highest-impact path with a fix. Cite exact percentages.',
                    expectedFormat: '🎯 VERDICT line. Then 3 short sections: **Top Landings** (table), **Top Exits** (table), **Top Paths** (numbered list). End with ⚡ ACTION.',
                    propertyId: args.propertyId,
                    range: args.range || '30d',
                    journey,
                },
            };
        } catch (e: any) {
            return { error: 'journey_failed', message: e?.message || 'Failed to fetch journey data.' };
        }
    }

    if (name === 'run_cohort_retention') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected.' };
        }
        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const data = await fetchRetentionCohorts(token, args.propertyId, args.mode || 'daily');
            if (!data) return { error: 'no_cohort_data', message: 'GA4 returned no cohort data — property may have insufficient history.' };
            return {
                result: {
                    task: 'Read the retention curve. Is it healthy (>20% D7) or leaking (<10% D7)? Compare against typical SaaS/content benchmarks. Prescribe ONE retention move.',
                    expectedFormat: '🎯 VERDICT — D1 X% / D7 Y% / D30 Z% — [healthy|leaking|catastrophic]. Then 1-line interpretation. End with ⚡ ACTION.',
                    propertyId: args.propertyId,
                    mode: args.mode || 'daily',
                    averages: data.averages,
                    curve: data.curve,
                    cohortCount: data.cohorts.length,
                },
            };
        } catch (e: any) {
            return { error: 'cohort_failed', message: e?.message || 'Failed to fetch cohort retention.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE B-4 — analyze_pr_seo_diff
    //   Fetches a PR's file diff and flags SEO-meaningful changes.
    // ═══════════════════════════════════════════════════════════════
    if (name === 'analyze_pr_seo_diff') {
        const ghToken = await getValidGithubToken(gscContext?.githubAccessToken, gscContext?.userId);
        if (!ghToken) {
            return { error: 'github_not_connected', response: 'GitHub is not connected. Click Connect GitHub in Settings, then retry.' };
        }
        try {
            const filesR = await getPullRequestFiles(ghToken, { repo: args.repo, prNumber: args.prNumber });
            if ('error' in filesR) return { error: filesR.error, message: (filesR as any).message };
            const files = filesR.data || [];

            // Heuristics for SEO-meaningful files. Each rule contributes a category + severity.
            const SEO_RULES: { match: RegExp; category: string; severity: 'critical' | 'high' | 'med'; why: string }[] = [
                { match: /(^|\/)robots\.txt$/i, category: 'crawl_control', severity: 'critical', why: 'robots.txt change directly affects crawler access' },
                { match: /(^|\/)sitemap.*\.(xml|ts|js|tsx|jsx)$/i, category: 'sitemap', severity: 'high', why: 'sitemap change affects discovery + indexation signal' },
                { match: /(^|\/)_redirects$|(^|\/)(next|nuxt|astro|vercel)\.config\.(js|ts|mjs)$/i, category: 'redirects_config', severity: 'high', why: 'redirect/header config can introduce 301 chains or noindex headers' },
                { match: /(^|\/)next-sitemap\.config\.(js|ts)$/i, category: 'sitemap', severity: 'high', why: 'sitemap generator config' },
                { match: /(layout|head|metadata)\.(t|j)sx?$/i, category: 'meta_head', severity: 'high', why: 'page <head> / metadata definition' },
                { match: /\.(html?|hbs|liquid|ejs|pug)$/i, category: 'html_template', severity: 'med', why: 'static HTML template — may contain meta/title/canonical/JSON-LD' },
                { match: /schema|jsonld|json-ld|structured-?data/i, category: 'schema_jsonld', severity: 'high', why: 'structured data file — affects rich-results eligibility' },
                { match: /(^|\/)public\/(robots|sitemap)/i, category: 'crawl_control', severity: 'critical', why: 'public crawler-control asset' },
            ];

            const PATCH_RULES: { match: RegExp; severity: 'critical' | 'high' | 'med'; why: string }[] = [
                { match: /noindex|nofollow/i, severity: 'critical', why: 'noindex/nofollow directive added or modified' },
                { match: /<title[^>]*>|next\/head|metadata\s*[:=]\s*\{|export\s+const\s+metadata/i, severity: 'high', why: 'page title or metadata edit' },
                { match: /canonical/i, severity: 'high', why: 'canonical URL change' },
                { match: /og:title|og:description|twitter:card/i, severity: 'med', why: 'social meta change — affects share previews + crawl signals' },
                { match: /Disallow:|Allow:|User-agent:/i, severity: 'critical', why: 'robots.txt directive change' },
                { match: /application\/ld\+json|@context|@type/i, severity: 'high', why: 'JSON-LD structured data edit' },
                { match: /redirect[s]?\s*[:=(]|status:\s*30[1278]/i, severity: 'high', why: 'redirect rule edit' },
            ];

            const findings: any[] = [];
            for (const f of files) {
                const fileHits: { kind: string; severity: string; why: string }[] = [];
                for (const r of SEO_RULES) if (r.match.test(f.filename)) fileHits.push({ kind: 'file_path', severity: r.severity, why: r.why });
                if (f.patch) {
                    for (const r of PATCH_RULES) if (r.match.test(f.patch)) fileHits.push({ kind: 'patch_content', severity: r.severity, why: r.why });
                }
                if (fileHits.length > 0) {
                    const topSev = fileHits.some(h => h.severity === 'critical') ? 'critical' : fileHits.some(h => h.severity === 'high') ? 'high' : 'med';
                    findings.push({
                        filename: f.filename,
                        status: f.status,
                        additions: f.additions,
                        deletions: f.deletions,
                        severity: topSev,
                        signals: fileHits,
                        // Wrap the patch — it's untrusted external content (PR author wrote it).
                        patch_excerpt: f.patch ? wrapUntrusted(f.patch.slice(0, 1500), `pr-${args.prNumber}-${f.filename}`) : null,
                    });
                }
            }

            findings.sort((a, b) => {
                const order = { critical: 0, high: 1, med: 2 } as const;
                return (order[a.severity as keyof typeof order] ?? 99) - (order[b.severity as keyof typeof order] ?? 99);
            });

            return {
                result: {
                    task: 'For each finding, state PLAINLY: did this PR likely break SEO? Cite the file + signal. End with ✅ SAFE / 🟡 REVIEW NEEDED / 🔴 LIKELY REGRESSION.',
                    expectedFormat: 'Markdown table: | Severity | File | Signal | Why |. Then VERDICT line. Quote at most 1 patch excerpt to support the verdict.',
                    repo: args.repo,
                    prNumber: args.prNumber,
                    filesChanged: files.length,
                    seoMeaningfulFiles: findings.length,
                    findings: findings.slice(0, 12),
                    note: findings.length === 0
                        ? 'No SEO-meaningful files touched in this PR. The change is content/UI/internal-only as far as SEO heuristics can tell.'
                        : null,
                },
            };
        } catch (e: any) {
            return { error: 'pr_diff_failed', message: e?.message || 'PR diff analysis failed.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE B-4 — compute_site_health_score
    //   Aggregates: site audit (HTML/SEO) + alerts (anomalies) + deploy velocity
    // ═══════════════════════════════════════════════════════════════
    if (name === 'compute_site_health_score') {
        try {
            const auditP = runSiteAudit(args.siteUrl).catch((e: any) => ({ _failed: true, message: e?.message || 'audit failed' } as any));
            const alerts = computeAlerts(gscContext?.seoContext, gscContext?.analyticsContext);
            let deployScore = 50;
            let deployNote = 'No repo linked — skipping deploy velocity sub-score.';
            let recentCommitCount = 0;
            if (args.repo) {
                try {
                    const ghToken = await getValidGithubToken(gscContext?.githubAccessToken, gscContext?.userId);
                    if (ghToken) {
                        const since = new Date(Date.now() - 30 * 86400_000).toISOString();
                        const commitsR = await getRecentCommits(ghToken, { repo: args.repo, since, per_page: 100 });
                        if (!('error' in commitsR)) {
                            recentCommitCount = (commitsR.data || []).length;
                            // 0 = stagnant (50), 1-5 = slow (60), 6-20 = healthy (85), 21+ = active (95)
                            deployScore = recentCommitCount === 0 ? 50
                                : recentCommitCount <= 5 ? 60
                                    : recentCommitCount <= 20 ? 85
                                        : 95;
                            deployNote = `${recentCommitCount} commits in last 30 days.`;
                        }
                    }
                } catch { /* swallow */ }
            }
            const audit = await auditP;
            const auditScore = audit && !(audit as any)._failed ? (audit as any).score : 0;
            const auditFailed = !!(audit as any)._failed;

            // Anomaly sub-score: start at 100, dock per critical/warning alert.
            const critCount = alerts.filter((a) => a.severity === 'critical').length;
            const warnCount = alerts.filter((a) => a.severity === 'warning').length;
            const anomalyScore = Math.max(0, 100 - critCount * 25 - warnCount * 10);

            // Final composite: 50% on-page audit, 35% anomalies, 15% deploy velocity.
            const overall = Math.round(auditScore * 0.5 + anomalyScore * 0.35 + deployScore * 0.15);
            const verdict = overall >= 85 ? 'EXCELLENT' : overall >= 70 ? 'HEALTHY' : overall >= 55 ? 'AT RISK' : overall >= 40 ? 'STRUGGLING' : 'CRITICAL';

            return {
                result: {
                    task: 'Lead with one sentence: "Health Score: N/100 — VERDICT." Then list the 2-3 sub-scores driving it. End with ⚡ TOP 3 FIXES (ranked by impact).',
                    expectedFormat: '🎯 VERDICT — score + label. Then a markdown table: | Sub-score | Value | Why |. Then ⚡ TOP 3 FIXES (numbered).',
                    siteUrl: args.siteUrl,
                    repo: args.repo || null,
                    overall,
                    verdict,
                    subScores: {
                        onPageAudit: auditScore,
                        anomalies: anomalyScore,
                        deployVelocity: deployScore,
                    },
                    weights: { onPageAudit: 0.5, anomalies: 0.35, deployVelocity: 0.15 },
                    drivers: {
                        criticalAlerts: critCount,
                        warningAlerts: warnCount,
                        recentCommits: recentCommitCount,
                        deployNote,
                        auditFailed,
                        topAuditIssues: !auditFailed ? (audit as any).issues?.filter((i: any) => i.severity === 'critical' || i.severity === 'warning').slice(0, 5) : [],
                        topAlerts: alerts.slice(0, 5),
                    },
                },
            };
        } catch (e: any) {
            return { error: 'health_score_failed', message: e?.message || 'Site health score computation failed.' };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE B-4 — write_dashboard_annotation
    //   Persists chat verdicts back to the user's dashboard timeline.
    // ═══════════════════════════════════════════════════════════════
    if (name === 'write_dashboard_annotation') {
        if (!ADMIN_API_KEY || !gscContext?.userId) {
            return { error: 'admin_not_configured', message: 'Admin API not configured — annotation cannot be persisted.' };
        }
        try {
            const res = await fetch(`${ADMIN_API_URL}/api/annotations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                body: JSON.stringify({
                    user_identifier: gscContext.userId,
                    date: args.date,
                    title: args.title.slice(0, 80),
                    description: (args.description || '').slice(0, 500),
                    category: args.category || 'verdict',
                    property_id: args.propertyId,
                    color: args.category === 'incident' ? '#ef4444' : args.category === 'deploy' ? '#22d3ee' : args.category === 'algorithm_update' ? '#f59e0b' : '#a855f7',
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                return { error: 'annotation_write_failed', message: `Admin returned ${res.status}: ${errText.slice(0, 200)}` };
            }
            const data = await res.json().catch(() => ({}));
            return {
                result: {
                    task: 'Confirm to the user that the annotation is saved. Mention the date + title. Suggest one related follow-up.',
                    expectedFormat: 'One short paragraph: "✅ Saved an annotation for {date}: \\"{title}\\". You\'ll see it on charts going forward."',
                    saved: true,
                    annotationId: data.id || data.annotation_id || null,
                    date: args.date,
                    title: args.title,
                    category: args.category || 'verdict',
                },
            };
        } catch (e: any) {
            return { error: 'annotation_write_failed', message: e?.message || 'Annotation write failed.' };
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
                case 'get_file_contents': {
                    // B7-lite: file content from a public repo can be attacker-controlled
                    // (e.g. a malicious commit on a fork containing prompt-injection text).
                    // Wrap in <untrusted_content> so the system prompt's anti-injection rule
                    // applies. The model still gets the content — it just won't follow
                    // instructions inside it.
                    const r = await getFileContents(token, args as { repo: string; path: string; ref?: string });
                    if (r && typeof r === 'object' && 'error' in r) {
                        return { error: r.error, response: (r as any).message || r.error };
                    }
                    const data = (r as any).data;
                    if (data?.content) {
                        data.content = wrapUntrusted(data.content, `${args.repo}:${args.path}`);
                    }
                    return { result: data };
                }
            }
        } catch (e: any) {
            return { error: 'github_tool_failed', response: e?.message || 'GitHub tool execution failed.' };
        }
    }

    if (name === 'analyze_page_intent_mismatch') {
        if (!gscContext?.googleAccessToken && !gscContext?.googleRefreshToken) {
            return { error: 'Google Account not connected. Connect it in Integrations settings.' };
        }
        try {
            const token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            const { siteUrl, pageUrl } = args;
            if (!siteUrl || !pageUrl) {
                return { error: 'invalid_args', message: 'Both siteUrl and pageUrl are required.', toolName: name };
            }
            const result = await analyzePageIntentMismatch({ token, siteUrl, pageUrl });
            return { result };
        } catch (e: any) {
            return { error: 'analyze_page_intent_mismatch_failed', response: e?.message || 'Intent mismatch analysis failed.' };
        }
    }

    if (name === 'fetch_serp_competitors') {
        try {
            const { query, limit, country } = args;
            if (!query) {
                return { error: 'invalid_args', message: 'query is required.', toolName: name };
            }
            const result = await fetchSerpCompetitors({ query, limit, country });
            return { result };
        } catch (e: any) {
            return { error: 'fetch_serp_competitors_failed', response: e?.message || 'SERP fetch failed.' };
        }
    }

    return { error: `Tool "${name}" not found.` };
}

// Normalize the GithubResult discriminated union into the {result, error} shape
// the chat route already understands.
function forwardGithubResult(r: any) {
    if (r && typeof r === 'object' && 'error' in r) {
        return { error: r.error, response: r.message || r.error };
    }
    return { result: r?.data ?? r };
}
