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
                    console.log(`[AI Chat] GSC query succeeded with variant: ${variant} (${data.rows.length} rows)`);
                    return { response, data, resolvedUrl: variant };
                }
                console.log(`[AI Chat] GSC variant ${variant} returned 0 rows, trying next...`);
            } else {
                console.log(`[AI Chat] GSC variant ${variant} failed with ${response.status}, trying next...`);
            }
        } catch (e: any) {
            console.log(`[AI Chat] GSC variant ${variant} threw: ${e.message}, trying next...`);
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
    console.log(`[AI Chat] Executing tool: ${name}`, args);

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

    return { error: `Tool "${name}" not found. Available tools: get_search_performance, calculate_revenue_impact` };
}
