// AI Chat Tools Definition & Executor
// These tools are injected into the Gemini API so the AI can "call" them to perform deep diagnosis.
import { getValidAccessToken } from '@/lib/googleApi';

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
        name: 'get_analytics_breakdown',
        description: `Fetch Google Analytics 4 (GA4) data for traffic analysis. Use when the user asks about traffic trends, sources, devices, demographics, or user behavior that ISN'T already in the dashboard context.

WHEN TO USE:
- "Why did my traffic drop?" → dimension="date", range=90
- "Where does my traffic come from?" → dimension="sources"
- "Mobile vs Desktop bounce rate?" → dimension="devices"
- "Which countries are most valuable?" → dimension="countries"
- "Who is linking to me?" → dimension="referrers"
- "What are the entry pages?" → dimension="entryPages"
- "Weekend vs weekday traffic?" → dimension="date", range=30 (then analyze the pattern)
- "Is my viral traffic sticking?" → dimension="sources" (check bounce rates)

DO NOT USE IF the dashboard context already has this data. Check first.`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                dimension: {
                    type: 'STRING' as const,
                    enum: ['date', 'sources', 'devices', 'countries', 'referrers', 'entryPages', 'browsers', 'os', 'languages', 'channels', 'pages'],
                    description: 'The dimension to break down',
                },
                propertyId: {
                    type: 'STRING' as const,
                    description: 'GA4 property ID. Use the one from [AVAILABLE PROPERTIES] list.',
                },
                range: {
                    type: 'INTEGER' as const,
                    description: 'Number of days to look back. Default 28. Use 90 for trend analysis, 7 for recent changes.',
                },
            },
            required: ['dimension', 'propertyId'],
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
];

export interface GscContext {
    googleAccessToken?: string;
    googleRefreshToken?: string;
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
                    signal: AbortSignal.timeout(10000),
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

    if (name === 'get_analytics_breakdown') {
        // Call our own internal analytics API
        const { dimension, propertyId, range } = args;
        try {
            const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

            // We need to get a valid Google token to pass to our analytics API
            let token = '';
            if (gscContext?.googleAccessToken || gscContext?.googleRefreshToken) {
                token = await getValidAccessToken(gscContext.googleAccessToken, gscContext.googleRefreshToken);
            }

            if (!token) {
                return { error: 'Google account not connected. Cannot fetch analytics data.' };
            }

            const section = dimension || 'overview';
            const days = range || 28;
            const url = `${baseUrl}/api/analytics?section=${section}&propertyId=${encodeURIComponent(propertyId || '')}&range=${days}`;

            const response = await fetch(url, {
                headers: {
                    'Cookie': '', // Internal call, auth handled differently
                    'x-google-token': token,
                },
                signal: AbortSignal.timeout(15000),
            });

            if (!response.ok) {
                return { error: `Analytics API returned ${response.status}. The GA4 property may not be accessible.` };
            }

            const data = await response.json();

            // Compress the data into CSV format for token efficiency
            let csvOutput = '';
            if (Array.isArray(data)) {
                // It's a list (sources, devices, etc.)
                const keys = data.length > 0 ? Object.keys(data[0]) : [];
                csvOutput = keys.join(',') + '\n' + data.slice(0, 30).map((row: any) =>
                    keys.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(',')
                ).join('\n');
            } else if (data.kpis) {
                csvOutput = `KPIs: ${JSON.stringify(data.kpis)}\n`;
                if (data.traffic) csvOutput += `Traffic trend: ${data.traffic.slice(0, 14).map((t: any) => `${t.date}:${t.activeUsers}u/${t.sessions}s`).join(' | ')}\n`;
            }

            return {
                result: {
                    dimension,
                    range: `${days} days`,
                    rowsReturned: Array.isArray(data) ? data.length : 1,
                    csvData: csvOutput || JSON.stringify(data).slice(0, 3000),
                },
            };
        } catch (e: any) {
            return { error: e.message || 'Failed to fetch analytics data' };
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

        // This tool returns structured analysis context — the AI will then use its reasoning to generate insights
        const queries = existingQueries ? existingQueries.split(',').map((q: string) => q.trim()) : [];
        const pages = existingPages ? existingPages.split(',').map((p: string) => p.trim()) : [];

        const result: Record<string, any> = { analysisType, topic };

        switch (analysisType) {
            case 'keyword_gaps':
                result.instructions = 'Analyze the existing queries list. Identify TOPIC CLUSTERS that are missing. For each existing high-traffic query, suggest related queries the user SHOULD be targeting but likely isn\'t. Focus on long-tail variations and question-based queries.';
                result.existingQueryCount = queries.length;
                result.topQueries = queries.slice(0, 20);
                break;
            case 'content_decay':
                result.instructions = 'Analyze the existing pages list. For each page, assess: is the content likely outdated? Are there queries where position > 15 (decaying)? Recommend content refresh priority.';
                result.existingPages = pages.slice(0, 15);
                break;
            case 'blog_ideas':
                result.instructions = `Generate 5-7 blog post ideas based on: (1) the user's existing top queries (what they already rank for), (2) semantic gaps (related topics they DON'T have), (3) question-based formats ("How to...", "Why does..."). For each idea, include: title, target keyword, estimated difficulty, and content angle.`;
                result.topQueries = queries.slice(0, 15);
                break;
            case 'one_thing_today':
                result.instructions = 'Based on ALL available data (GSC + GA4), determine the SINGLE highest-impact action the user can take TODAY. Consider: CTR fixes, striking distance keywords, content decay, technical issues, quick wins. Present ONE clear task with estimated impact.';
                result.topQueries = queries.slice(0, 10);
                result.existingPages = pages.slice(0, 10);
                break;
            case 'authority_check':
                result.instructions = `Check if the user has existing authority/rankings related to "${topic || 'the topic'}". Look for: related queries they already rank for, relevant pages, keyword clusters, and semantic proximity. Rate authority 1-10.`;
                result.topQueries = queries.slice(0, 20);
                result.existingPages = pages.slice(0, 15);
                break;
            case 'translation_analysis':
                result.instructions = 'Analyze traffic by country/language from the dashboard context. Suggest whether translation would be valuable: which languages, estimated traffic gain, and content prioritization.';
                break;
            case 'competitor_analysis':
                result.instructions = `For the competitor "${topic || 'the competitor'}", use your knowledge to: (1) estimate their likely top keywords, (2) identify content types they likely have that the user doesn't, (3) suggest specific pieces of content to create to compete. Note: this uses AI reasoning, not live data.`;
                result.topQueries = queries.slice(0, 20);
                break;
        }

        return { result };
    }

    return { error: `Tool "${name}" not found. Available tools: get_search_performance, calculate_revenue_impact, get_analytics_breakdown, run_page_audit, generate_content_strategy` };
}
