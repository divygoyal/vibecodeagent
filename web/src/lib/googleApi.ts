/**
 * Direct Google API utility — calls Google APIs via fetch() from Next.js.
 * Eliminates the admin API subprocess overhead (15-20s → 2-3s).
 * 
 * Token refresh is cached in-memory so we only refresh once per hour.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin-api:8000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ADMIN_OAUTH_LOOKUP_TIMEOUT_MS = 8000;

// In-memory token cache: refreshToken → { accessToken, expiresAt }
// Capped at 1000 entries to prevent unbounded memory growth
const TOKEN_CACHE_MAX = 1000;
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

// ─── Date Range Resolution ───
// GA4 accepts relative dates ("NdaysAgo", "today", "yesterday") or YYYY-MM-DD strings.
// This helper resolves all supported range values to { startDate, endDate } strings.

function fmtDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

/** Resolve a range key to GA4-compatible { startDate, endDate } */
export function resolveRange(range: string): { startDate: string; endDate: string } {
    const now = new Date();
    switch (range) {
        case 'today':
            return { startDate: 'today', endDate: 'today' };
        case 'yesterday':
            return { startDate: 'yesterday', endDate: 'yesterday' };
        case '7d':
            return { startDate: '7daysAgo', endDate: 'today' };
        case '14d':
            return { startDate: '14daysAgo', endDate: 'today' };
        case '30d':
            return { startDate: '28daysAgo', endDate: 'today' };
        case '60d':
            return { startDate: '60daysAgo', endDate: 'today' };
        case '90d':
            return { startDate: '90daysAgo', endDate: 'today' };
        case '6m':
            return { startDate: '180daysAgo', endDate: 'today' };
        case '12m':
            return { startDate: '365daysAgo', endDate: 'today' };
        case 'this_week': {
            const start = new Date(now);
            start.setDate(start.getDate() - start.getDay()); // Sunday
            return { startDate: fmtDate(start), endDate: 'today' };
        }
        case 'last_week': {
            const end = new Date(now);
            end.setDate(end.getDate() - end.getDay() - 1); // Last Saturday
            const start = new Date(end);
            start.setDate(start.getDate() - 6); // Last Sunday
            return { startDate: fmtDate(start), endDate: fmtDate(end) };
        }
        case 'this_month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { startDate: fmtDate(start), endDate: 'today' };
        }
        case 'last_month': {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            return { startDate: fmtDate(start), endDate: fmtDate(end) };
        }
        case 'this_year': {
            const start = new Date(now.getFullYear(), 0, 1);
            return { startDate: fmtDate(start), endDate: 'today' };
        }
        case 'last_year': {
            const start = new Date(now.getFullYear() - 1, 0, 1);
            const end = new Date(now.getFullYear() - 1, 11, 31);
            return { startDate: fmtDate(start), endDate: fmtDate(end) };
        }
        case 'all':
            return { startDate: '365daysAgo', endDate: 'today' };
        default:
            return { startDate: '28daysAgo', endDate: 'today' };
    }
}

/** Resolve the *previous* comparison period for a range (same duration, shifted back) */
export function resolvePrevRange(range: string): { startDate: string; endDate: string } {
    const now = new Date();
    switch (range) {
        case 'today':
            return { startDate: 'yesterday', endDate: 'yesterday' };
        case 'yesterday':
            return { startDate: '2daysAgo', endDate: '2daysAgo' };
        case '7d':
            return { startDate: '14daysAgo', endDate: '8daysAgo' };
        case '14d':
            return { startDate: '28daysAgo', endDate: '15daysAgo' };
        case '30d':
            return { startDate: '56daysAgo', endDate: '29daysAgo' };
        case '60d':
            return { startDate: '120daysAgo', endDate: '61daysAgo' };
        case '90d':
            return { startDate: '180daysAgo', endDate: '91daysAgo' };
        case '6m':
            return { startDate: '365daysAgo', endDate: '181daysAgo' };
        case '12m':
            return { startDate: '730daysAgo', endDate: '366daysAgo' };
        case 'this_week': {
            const thisStart = new Date(now);
            thisStart.setDate(thisStart.getDate() - thisStart.getDay());
            const daysSoFar = Math.ceil((now.getTime() - thisStart.getTime()) / 86400000) + 1;
            const prevEnd = new Date(thisStart);
            prevEnd.setDate(prevEnd.getDate() - 1);
            const prevStart = new Date(prevEnd);
            prevStart.setDate(prevStart.getDate() - daysSoFar + 1);
            return { startDate: fmtDate(prevStart), endDate: fmtDate(prevEnd) };
        }
        case 'last_week': {
            const end = new Date(now);
            end.setDate(end.getDate() - end.getDay() - 1);
            const prevEnd = new Date(end);
            prevEnd.setDate(prevEnd.getDate() - 7);
            const prevStart = new Date(prevEnd);
            prevStart.setDate(prevStart.getDate() - 6);
            return { startDate: fmtDate(prevStart), endDate: fmtDate(prevEnd) };
        }
        case 'this_month': {
            const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const daysSoFar = now.getDate();
            const prevEnd = new Date(thisMonthStart);
            prevEnd.setDate(prevEnd.getDate() - 1);
            const prevStart = new Date(prevEnd);
            prevStart.setDate(prevStart.getDate() - daysSoFar + 1);
            return { startDate: fmtDate(prevStart), endDate: fmtDate(prevEnd) };
        }
        case 'last_month': {
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
            return { startDate: fmtDate(prevMonthStart), endDate: fmtDate(prevMonthEnd) };
        }
        case 'this_year': {
            const start = new Date(now.getFullYear() - 1, 0, 1);
            const end = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            return { startDate: fmtDate(start), endDate: fmtDate(end) };
        }
        case 'last_year': {
            const start = new Date(now.getFullYear() - 2, 0, 1);
            const end = new Date(now.getFullYear() - 2, 11, 31);
            return { startDate: fmtDate(start), endDate: fmtDate(end) };
        }
        case 'all':
            return { startDate: '730daysAgo', endDate: '366daysAgo' };
        default:
            return { startDate: '56daysAgo', endDate: '29daysAgo' };
    }
}

function resolveDateTokenToAbsolute(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const now = new Date();
    const resolved = new Date(now);

    if (value === 'today') {
        return fmtDate(resolved);
    }

    if (value === 'yesterday') {
        resolved.setDate(resolved.getDate() - 1);
        return fmtDate(resolved);
    }

    const daysAgoMatch = value.match(/^(\d+)daysAgo$/);
    if (daysAgoMatch) {
        resolved.setDate(resolved.getDate() - parseInt(daysAgoMatch[1], 10));
        return fmtDate(resolved);
    }

    return value;
}

/**
 * Fetch stored Google OAuth tokens from admin DB.
 * Used as fallback when JWT doesn't have Google tokens
 * (e.g., user signed in with GitHub but previously connected Google).
 */
export async function fetchGoogleTokensFromDb(
    userId: string
): Promise<{ accessToken: string; refreshToken?: string } | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(`${ADMIN_API_URL}/api/users/${encodeURIComponent(userId)}/oauth/google`, {
            headers: { 'X-API-Key': ADMIN_API_KEY },
            signal: AbortSignal.timeout(ADMIN_OAUTH_LOOKUP_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || undefined,
        };
    } catch {
        return null;
    }
}

// Bug #8 fix: Deduplication map for concurrent token refresh requests.
// Keyed by refresh token, holds the in-flight promise so multiple callers share one refresh.
const pendingRefresh = new Map<string, Promise<string>>();

/**
 * Get a valid Google access token, refreshing if necessary.
 * Bug #8 fix: Deduplicates concurrent refresh requests using a pending promise map.
 */
export async function getValidAccessToken(
    accessToken?: string,
    refreshToken?: string
): Promise<string> {
    if (!refreshToken && !accessToken) {
        throw new Error('No Google credentials available');
    }

    // Check cache (keyed by refresh token)
    if (refreshToken) {
        const cached = tokenCache.get(refreshToken);
        if (cached && cached.expiresAt > Date.now() + 60_000) {
            return cached.accessToken;
        }
    }

    // Try refreshing with refresh token
    if (refreshToken) {
        // Bug #8 fix: If a refresh is already in flight for this token, reuse it
        const existing = pendingRefresh.get(refreshToken);
        if (existing) {
            return existing;
        }

        // Create the promise first, then store it BEFORE starting execution
        // so concurrent callers always find it in the map.
        let resolveRefresh: (token: string) => void;
        let rejectRefresh: (err: Error) => void;
        const refreshPromise = new Promise<string>((resolve, reject) => {
            resolveRefresh = resolve;
            rejectRefresh = reject;
        });

        // Store in map BEFORE any async work begins
        pendingRefresh.set(refreshToken, refreshPromise);

        (async () => {
            let settled = false;
            try {
                const res = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: GOOGLE_CLIENT_ID,
                        client_secret: GOOGLE_CLIENT_SECRET,
                        refresh_token: refreshToken,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const newToken = data.access_token;
                    const expiresIn = data.expires_in || 3600;

                    // Evict expired entries if cache is full
                    if (tokenCache.size >= TOKEN_CACHE_MAX) {
                        const now = Date.now();
                        for (const [k, v] of tokenCache) {
                            if (v.expiresAt < now) tokenCache.delete(k);
                        }
                    }

                    tokenCache.set(refreshToken, {
                        accessToken: newToken,
                        expiresAt: Date.now() + expiresIn * 1000,
                    });

                    resolveRefresh!(newToken);
                    settled = true;
                    return;
                }
                const errText = await res.text();
                console.error('Google token refresh failed:', res.status, errText);
            } catch (err) {
                console.error('Google token refresh network error:', err);
            } finally {
                // Delete from map AFTER promise is settled so concurrent callers
                // who already hold the promise reference can still await it.
                pendingRefresh.delete(refreshToken);
                // Safety net: guarantee the promise is always settled, even if
                // an unexpected exception fires before resolveRefresh/rejectRefresh.
                if (!settled) {
                    if (accessToken) {
                        resolveRefresh!(accessToken);
                    } else {
                        rejectRefresh!(new Error('Failed to refresh Google token'));
                    }
                }
            }
        })();

        return refreshPromise;
    }

    // Fallback to existing access token (might be expired)
    if (accessToken) return accessToken;
    throw new Error('Failed to refresh Google token');
}

// ─── Google Analytics Data API ───

const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const GA_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

async function gaFetch(url: string, token: string, body?: any, signal?: AbortSignal) {
    const opts: RequestInit = {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        signal: signal ?? AbortSignal.timeout(30000),
    };
    if (body) {
        opts.method = 'POST';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google API error ${res.status}: ${err}`);
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Google API returned non-JSON response: ${text.substring(0, 200)}`);
    }
}

/**
 * List GA4 properties accessible by the user.
 */
export async function listAnalyticsProperties(token: string, signal?: AbortSignal) {
    const data = await gaFetch(`${GA_ADMIN_BASE}/accountSummaries`, token, undefined, signal);
    const properties: { displayName: string; property: string; parent: string }[] = [];

    if (data.accountSummaries) {
        for (const account of data.accountSummaries) {
            if (account.propertySummaries) {
                for (const prop of account.propertySummaries) {
                    properties.push({
                        displayName: prop.displayName,
                        property: prop.property,
                        parent: prop.parent,
                    });
                }
            }
        }
    }
    return properties;
}

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

export async function runGAReport(
    token: string,
    propertyId: string,
    dims: string[],
    mets: string[],
    startDate: string,
    endDate: string,
    limit = 100,
    orderByMetric?: string,
    signal?: AbortSignal,
) {
    const body: any = {
        dateRanges: [{ startDate, endDate }],
        metrics: mets.map(m => ({ name: m })),
        dimensions: dims.map(d => ({ name: d })),
        limit,
    };
    if (orderByMetric) {
        body.orderBys = [{ metric: { metricName: orderByMetric }, desc: true }];
    }
    return gaFetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, token, body, signal);
}

/**
 * Flexible GA4 report — accepts any dimensions, metrics, filters, ordering.
 * Used by the AI chatbot's run_ga4_report tool for arbitrary queries.
 * Existing runGAReport() and fetchAnalyticsDashboard() are untouched.
 */
export async function runFlexibleGAReport(
    token: string,
    propertyId: string,
    dimensions: string[],
    metrics: string[],
    dateRanges: Array<{ startDate: string; endDate: string; name?: string }>,
    options?: {
        dimensionFilter?: any;
        metricFilter?: any;
        orderBys?: Array<{ field: string; type: 'metric' | 'dimension'; desc?: boolean }>;
        limit?: number;
        offset?: number;
        signal?: AbortSignal;
    }
) {
    const body: any = {
        dateRanges,
        dimensions: dimensions.map(d => ({ name: d })),
        metrics: metrics.map(m => ({ name: m })),
        limit: Math.min(options?.limit || 100, 250),
    };

    if (options?.offset) body.offset = options.offset;
    if (options?.dimensionFilter) body.dimensionFilter = options.dimensionFilter;
    if (options?.metricFilter) body.metricFilter = options.metricFilter;

    if (options?.orderBys && options.orderBys.length > 0) {
        body.orderBys = options.orderBys.map(ob => {
            if (ob.type === 'metric') {
                return { metric: { metricName: ob.field }, desc: ob.desc ?? true };
            }
            return { dimension: { dimensionName: ob.field, orderType: 'ALPHANUMERIC' }, desc: ob.desc ?? false };
        });
    }

    return gaFetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, token, body, options?.signal);
}

/**
 * Flexible GA4 realtime report — arbitrary dimensions/metrics.
 * Used by the AI chatbot's run_realtime_report tool.
 */
export async function runFlexibleRealtimeReport(
    token: string,
    propertyId: string,
    dimensions: string[],
    metrics: string[],
    options?: {
        dimensionFilter?: any;
        metricFilter?: any;
        limit?: number;
        signal?: AbortSignal;
    }
) {
    const body: any = {
        dimensions: dimensions.map(d => ({ name: d })),
        metrics: metrics.map(m => ({ name: m })),
    };
    if (options?.limit) body.limit = options.limit;
    if (options?.dimensionFilter) body.dimensionFilter = options.dimensionFilter;
    if (options?.metricFilter) body.metricFilter = options.metricFilter;

    return gaFetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runRealtimeReport`, token, body, options?.signal);
}

/**
 * Fetch custom dimensions and metrics for a GA4 property via the Metadata API.
 * Used by the AI chatbot's get_custom_dimensions tool.
 */
export async function getPropertyMetadata(token: string, propertyId: string) {
    const pid = cleanPropertyId(propertyId);
    const data = await gaFetch(`${GA_DATA_BASE}/${pid}/metadata`, token);
    const customDimensions = (data.dimensions || []).filter((d: any) => d.customDefinition);
    const customMetrics = (data.metrics || []).filter((m: any) => m.customDefinition);
    const standardDimensionCount = (data.dimensions || []).length - customDimensions.length;
    const standardMetricCount = (data.metrics || []).length - customMetrics.length;
    return { customDimensions, customMetrics, standardDimensionCount, standardMetricCount };
}

/**
 * Fetch full analytics dashboard data (KPIs, traffic, sources, pages, devices, countries).
 * Mirrors the plugin's dashboardJson() method.
 */
export async function fetchAnalyticsDashboard(token: string, propertyId: string, range = '30d') {
    const result: any = {
        kpis: null, traffic: [], sources: [], pages: [], devices: [], countries: [],
        browsers: [], operatingSystems: [], channels: [], referrers: [],
        cities: [], regions: [], entryPages: [], languages: [],
    };
    const pid = cleanPropertyId(propertyId);

    const { startDate, endDate } = resolveRange(range);
    const { startDate: prevStartDate, endDate: prevEndDate } = resolvePrevRange(range);

    // Run all queries in parallel for speed
    const [
        currentTotals, prevTotals, sourcesData, pagesData, devicesData, countriesData,
        browsersData, osData, channelsData, referrersData, citiesData, regionsData,
        entryPagesData, languagesData
    ] = await Promise.all([
        runGAReport(token, pid, ['date'], ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'], startDate, endDate, 1000),
        runGAReport(token, pid, ['date'], ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate'], prevStartDate, prevEndDate, 1000),
        runGAReport(token, pid, ['sessionSource', 'sessionMedium'], ['sessions', 'activeUsers'], startDate, endDate, 50, 'sessions').catch(() => null),
        runGAReport(token, pid, ['pagePath', 'pageTitle'], ['screenPageViews', 'averageSessionDuration', 'bounceRate', 'activeUsers'], startDate, endDate, 50, 'screenPageViews').catch(() => null),
        runGAReport(token, pid, ['deviceCategory'], ['sessions', 'activeUsers'], startDate, endDate, 10, 'sessions').catch(() => null),
        runGAReport(token, pid, ['country'], ['activeUsers', 'sessions'], startDate, endDate, 50, 'activeUsers').catch(() => null),
        runGAReport(token, pid, ['browser'], ['sessions', 'activeUsers'], startDate, endDate, 20, 'sessions').catch(() => null),
        runGAReport(token, pid, ['operatingSystem'], ['sessions', 'activeUsers'], startDate, endDate, 20, 'sessions').catch(() => null),
        runGAReport(token, pid, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], startDate, endDate, 20, 'sessions').catch(() => null),
        runGAReport(token, pid, ['sessionSource'], ['sessions', 'activeUsers'], startDate, endDate, 30, 'sessions').catch(() => null),
        runGAReport(token, pid, ['city', 'country'], ['activeUsers'], startDate, endDate, 30, 'activeUsers').catch(() => null),
        runGAReport(token, pid, ['region', 'country'], ['activeUsers'], startDate, endDate, 30, 'activeUsers').catch(() => null),
        runGAReport(token, pid, ['landingPagePlusQueryString'], ['sessions', 'activeUsers', 'bounceRate'], startDate, endDate, 30, 'sessions').catch(() => null),
        runGAReport(token, pid, ['language'], ['activeUsers', 'sessions'], startDate, endDate, 20, 'activeUsers').catch(() => null),
    ]);

    // KPIs + Traffic
    let totalUsers = 0, totalSessions = 0, totalPageViews = 0;
    let totalBounce = 0, totalDuration = 0, totalNewUsers = 0, rowCount = 0;

    if (currentTotals.rows) {
        for (const row of currentTotals.rows) {
            const mv = row.metricValues;
            totalUsers += parseInt(mv[0].value) || 0;
            totalSessions += parseInt(mv[1].value) || 0;
            totalPageViews += parseInt(mv[2].value) || 0;
            totalBounce += parseFloat(mv[3].value) || 0;
            totalDuration += parseFloat(mv[4].value) || 0;
            totalNewUsers += parseInt(mv[5].value) || 0;
            rowCount++;

            const dateRaw = row.dimensionValues[0].value;
            const date = dateRaw.length === 8
                ? `${dateRaw.substring(0, 4)}-${dateRaw.substring(4, 6)}-${dateRaw.substring(6, 8)}`
                : dateRaw;
            result.traffic.push({
                date,
                activeUsers: parseInt(mv[0].value) || 0,
                sessions: parseInt(mv[1].value) || 0,
                pageViews: parseInt(mv[2].value) || 0,
                bounceRate: +((parseFloat(mv[3].value) || 0) * 100).toFixed(1),
            });
        }
    }

    let prevUsers = 0, prevSessions = 0, prevPageViews = 0, prevBounce = 0, prevRows = 0;
    if (prevTotals.rows) {
        for (const row of prevTotals.rows) {
            const mv = row.metricValues;
            prevUsers += parseInt(mv[0].value) || 0;
            prevSessions += parseInt(mv[1].value) || 0;
            prevPageViews += parseInt(mv[2].value) || 0;
            prevBounce += parseFloat(mv[3].value) || 0;
            prevRows++;
        }
    }

    const pctChange = (cur: number, prev: number) => {
        if (prev <= 0) return 0;
        const change = ((cur - prev) / prev) * 100;
        if (!Number.isFinite(change)) return 0;
        return +change.toFixed(1);
    };
    const avgBounce = rowCount > 0 ? (totalBounce / rowCount) * 100 : 0;
    const prevAvgBounce = prevRows > 0 ? (prevBounce / prevRows) * 100 : 0;

    result.kpis = {
        totalUsers,
        totalSessions,
        totalPageViews,
        avgBounceRate: +avgBounce.toFixed(1),
        avgSessionDuration: rowCount > 0 ? Math.round(totalDuration / rowCount) : 0,
        newUsers: totalNewUsers,
        returningUsers: totalUsers - totalNewUsers,
        pagesPerSession: totalSessions > 0 ? +(totalPageViews / totalSessions).toFixed(1) : 0,
        changeUsers: pctChange(totalUsers, prevUsers),
        changeSessions: pctChange(totalSessions, prevSessions),
        changePageViews: pctChange(totalPageViews, prevPageViews),
        changeBounceRate: prevAvgBounce > 0 ? +(avgBounce - prevAvgBounce).toFixed(1) : 0,
    };
    result.traffic.sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Helper to parse dimension-metric rows into [{name, value, users?, percentage}]
    const parseDimMetric = (data: any, dimKey: string, metricIndex = 0, usersIndex?: number) => {
        if (!data?.rows) return [];
        let total = 0;
        const raw = data.rows.map((row: any) => {
            const val = parseInt(row.metricValues[metricIndex].value) || 0;
            total += val;
            const users = usersIndex !== undefined ? (parseInt(row.metricValues[usersIndex].value) || 0) : undefined;
            return { name: row.dimensionValues[0].value, value: val, users };
        });
        return raw.map((r: any) => ({ ...r, percentage: total > 0 ? +((r.value / total) * 100).toFixed(1) : 0 }));
    };

    // Sources (combined source / medium)
    if (sourcesData?.rows) {
        let total = 0;
        const raw = sourcesData.rows.map((row: any) => {
            const sessions = parseInt(row.metricValues[0].value) || 0;
            const users = parseInt(row.metricValues[1].value) || 0;
            total += sessions;
            return { source: `${row.dimensionValues[0].value} / ${row.dimensionValues[1].value}`, sessions, users };
        });
        result.sources = raw.map((r: any) => ({ ...r, percentage: total > 0 ? +((r.sessions / total) * 100).toFixed(1) : 0 }));
    }

    // Pages
    if (pagesData?.rows) {
        result.pages = pagesData.rows.map((row: any) => {
            const views = parseInt(row.metricValues[0].value) || 0;
            const avgSec = parseFloat(row.metricValues[1].value) || 0;
            const m = Math.floor(avgSec / 60);
            const s = Math.round(avgSec % 60);
            return {
                page: row.dimensionValues[0].value,
                title: row.dimensionValues[1].value || row.dimensionValues[0].value,
                views,
                uniqueViews: parseInt(row.metricValues[3]?.value) || Math.round(views * 0.8),
                avgTime: `${m}:${s.toString().padStart(2, '0')}`,
                bounceRate: +((parseFloat(row.metricValues[2].value) || 0) * 100).toFixed(1),
            };
        });
    }

    // Devices
    if (devicesData?.rows) {
        let total = 0;
        const raw = devicesData.rows.map((row: any) => {
            const sessions = parseInt(row.metricValues[0].value) || 0;
            total += sessions;
            const name = row.dimensionValues[0].value;
            return { device: name.charAt(0).toUpperCase() + name.slice(1), sessions, users: parseInt(row.metricValues[1].value) || 0 };
        });
        result.devices = raw.map((r: any) => ({ ...r, percentage: total > 0 ? +((r.sessions / total) * 100).toFixed(1) : 0 }));
    }

    // Countries
    if (countriesData?.rows) {
        let total = 0;
        const raw = countriesData.rows.map((row: any) => {
            const users = parseInt(row.metricValues[0].value) || 0;
            total += users;
            return { country: row.dimensionValues[0].value, users, sessions: parseInt(row.metricValues[1].value) || 0 };
        });
        result.countries = raw.map((r: any) => ({ ...r, percentage: total > 0 ? +((r.users / total) * 100).toFixed(1) : 0 }));
    }

    // Browsers
    result.browsers = parseDimMetric(browsersData, 'browser', 0, 1);
    // Operating Systems
    result.operatingSystems = parseDimMetric(osData, 'operatingSystem', 0, 1);
    // Channels (default channel grouping)
    result.channels = parseDimMetric(channelsData, 'sessionDefaultChannelGroup', 0, 1);
    // Referrers (source only)
    result.referrers = parseDimMetric(referrersData, 'sessionSource', 0, 1);

    // Cities
    if (citiesData?.rows) {
        result.cities = citiesData.rows.map((row: any) => ({
            city: row.dimensionValues[0].value,
            country: row.dimensionValues[1].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    // Regions
    if (regionsData?.rows) {
        result.regions = regionsData.rows.map((row: any) => ({
            region: row.dimensionValues[0].value,
            country: row.dimensionValues[1].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    // Entry/Landing Pages
    if (entryPagesData?.rows) {
        let total = 0;
        const raw = entryPagesData.rows.map((row: any) => {
            const sessions = parseInt(row.metricValues[0].value) || 0;
            total += sessions;
            return {
                page: row.dimensionValues[0].value,
                sessions,
                users: parseInt(row.metricValues[1].value) || 0,
                bounceRate: +((parseFloat(row.metricValues[2].value) || 0) * 100).toFixed(1),
            };
        });
        result.entryPages = raw.map((r: any) => ({ ...r, percentage: total > 0 ? +((r.sessions / total) * 100).toFixed(1) : 0 }));
    }

    // Languages
    result.languages = parseDimMetric(languagesData, 'language', 0, 1);

    return result;
}

// ─── GA4 Real-Time API ───

/**
 * Fetch real-time active users with country, city, device, and page dimensions.
 * Uses the GA4 Data API runRealtimeReport endpoint.
 */
export async function fetchRealtimeVisitors(token: string, propertyId: string) {
    const pid = cleanPropertyId(propertyId);
    const result: any = { activeUsers: 0, byCountry: [], byCity: [], byDevice: [], byPage: [] };

    const [totalData, countryData, cityData, deviceData, pageData] = await Promise.all([
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            metrics: [{ name: 'activeUsers' }],
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 50,
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'city' }, { name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 50,
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 10,
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 15,
        }).catch(() => null),
    ]);

    // Total active users
    if (totalData?.rows?.[0]) {
        result.activeUsers = parseInt(totalData.rows[0].metricValues[0].value) || 0;
    }

    // By country
    if (countryData?.rows) {
        result.byCountry = countryData.rows.map((row: any) => ({
            country: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    // By city + country
    if (cityData?.rows) {
        result.byCity = cityData.rows.map((row: any) => ({
            city: row.dimensionValues[0].value,
            country: row.dimensionValues[1].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    // By device
    if (deviceData?.rows) {
        result.byDevice = deviceData.rows.map((row: any) => ({
            device: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    // By page
    if (pageData?.rows) {
        result.byPage = pageData.rows.map((row: any) => ({
            page: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }
    return result;
}

/**
 * Lean realtime fetch for embeds — only 4 queries (skips byDevice, byReferrer).
 * Reduces GA4 API token usage by ~33%.
 */
export async function fetchRealtimeForEmbed(token: string, propertyId: string) {
    const pid = cleanPropertyId(propertyId);
    const result: any = { activeUsers: 0, byCountry: [], byCity: [], byPage: [] };

    const [totalData, countryData, cityData, pageData] = await Promise.all([
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            metrics: [{ name: 'activeUsers' }],
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 20,
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'city' }, { name: 'country' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 20,
        }).catch(() => null),
        gaFetch(`${GA_DATA_BASE}/${pid}:runRealtimeReport`, token, {
            dimensions: [{ name: 'unifiedScreenName' }],
            metrics: [{ name: 'activeUsers' }],
            limit: 15,
        }).catch(() => null),
    ]);

    if (totalData?.rows?.[0]) {
        result.activeUsers = parseInt(totalData.rows[0].metricValues[0].value) || 0;
    }
    if (countryData?.rows) {
        result.byCountry = countryData.rows.map((row: any) => ({
            country: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }
    if (cityData?.rows) {
        result.byCity = cityData.rows.map((row: any) => ({
            city: row.dimensionValues[0].value,
            country: row.dimensionValues[1].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }
    if (pageData?.rows) {
        result.byPage = pageData.rows.map((row: any) => ({
            page: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value) || 0,
        }));
    }

    return result;
}


/**
 * Validate an embed token and retrieve the owner's Google OAuth credentials.
 * Called by the public embed realtime API route.
 */
export async function fetchEmbedTokenCredentials(token: string): Promise<{
    propertyId: string;
    accessToken: string;
    refreshToken: string;
    userId: number;
    allowedOrigins: string[] | null;
    plan: string;
} | null> {
    if (!ADMIN_API_KEY) return null;
    try {
        const res = await fetch(
            `${ADMIN_API_URL}/api/embed-tokens/${encodeURIComponent(token)}/google-tokens`,
            { headers: { 'X-API-Key': ADMIN_API_KEY } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return {
            propertyId: data.property_id,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            userId: data.user_id,
            allowedOrigins: data.allowed_origins || null,
            plan: data.plan || 'free',
        };
    } catch {
        return null;
    }
}


// ─── Google Search Console API ───

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

/**
 * List all verified Search Console sites.
 */
export async function listSearchConsoleSites(token: string, signal?: AbortSignal) {
    const data = await gaFetch(`${GSC_BASE}/sites`, token, undefined, signal);
    return data.siteEntry || [];
}

async function runGSCQuery(
    token: string,
    siteUrl: string,
    dims: string[],
    startDate: string,
    endDate: string,
    limit = 100,
    signal?: AbortSignal
) {
    const body = {
        startDate,
        endDate,
        dimensions: dims,
        rowLimit: limit,
        type: 'web',
    };
    return gaFetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, body, signal);
}

/**
 * Fetch full SEO dashboard data (KPIs, queries, pages, trend, recommendations).
 * Mirrors the plugin's dashboardJson() method.
 */
export async function fetchSeoDashboard(token: string, siteUrl: string, range = '30d', signal?: AbortSignal) {
    const result: any = { kpis: null, queries: [], pages: [], trend: [], recommendations: [] };

    const { startDate, endDate } = resolveRange(range);
    const { startDate: prevStartDate, endDate: prevEndDate } = resolvePrevRange(range);

    const currentStart = resolveDateTokenToAbsolute(startDate);
    const currentEnd = resolveDateTokenToAbsolute(endDate);
    const previousStart = resolveDateTokenToAbsolute(prevStartDate);
    const previousEnd = resolveDateTokenToAbsolute(prevEndDate);

    // Run all queries in parallel
    const [currentData, prevData, queryData, prevQueryData, pageData, prevPageData] = await Promise.all([
        runGSCQuery(token, siteUrl, ['date'], currentStart, currentEnd, 1000, signal),
        runGSCQuery(token, siteUrl, ['date'], previousStart, previousEnd, 1000, signal),
        runGSCQuery(token, siteUrl, ['query'], currentStart, currentEnd, 20, signal),
        runGSCQuery(token, siteUrl, ['query'], previousStart, previousEnd, 20, signal),
        runGSCQuery(token, siteUrl, ['page'], currentStart, currentEnd, 20, signal),
        runGSCQuery(token, siteUrl, ['page'], previousStart, previousEnd, 20, signal),
    ]);

    const currentRows = currentData.rows || [];
    const prevRows = prevData.rows || [];
    const queryRows = queryData.rows || [];
    const prevQueryRows = prevQueryData.rows || [];
    const pageRows = pageData.rows || [];
    const prevPageRows = prevPageData.rows || [];

    // KPIs
    let totalClicks = 0, totalImpressions = 0, totalPos = 0, curCount = 0;
    for (const row of currentRows) {
        totalClicks += row.clicks || 0;
        totalImpressions += row.impressions || 0;
        totalPos += row.position || 0;
        curCount++;
    }

    let prevClicks = 0, prevImpressions = 0, prevPos = 0, prevCount = 0;
    for (const row of prevRows) {
        prevClicks += row.clicks || 0;
        prevImpressions += row.impressions || 0;
        prevPos += row.position || 0;
        prevCount++;
    }

    const pctChange = (cur: number, prev: number) => {
        if (prev <= 0) return 0;
        const change = ((cur - prev) / prev) * 100;
        if (!Number.isFinite(change)) return 0;
        return +change.toFixed(1);
    };
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPos = curCount > 0 ? totalPos / curCount : 0;
    const prevAvgCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;
    const prevAvgPos = prevCount > 0 ? prevPos / prevCount : 0;

    result.kpis = {
        totalClicks,
        totalImpressions,
        avgCTR: +avgCtr.toFixed(1),
        avgPosition: +avgPos.toFixed(1),
        indexedPages: pageRows.length,
        crawlErrors: 0,
        changeClicks: pctChange(totalClicks, prevClicks),
        changeImpressions: pctChange(totalImpressions, prevImpressions),
        changeCTR: +(avgCtr - prevAvgCtr).toFixed(1),
        changePosition: +(avgPos - prevAvgPos).toFixed(1),
    };

    const prevQueryMap = new Map<string, { clicks: number; position: number }>(
        prevQueryRows.map((row: any) => [
            row.keys?.[0],
            {
                clicks: row.clicks || 0,
                position: +(row.position || 0).toFixed(1),
            },
        ]),
    );

    const prevPageMap = new Map<string, { clicks: number; position: number }>(
        prevPageRows.map((row: any) => [
            row.keys?.[0],
            {
                clicks: row.clicks || 0,
                position: +(row.position || 0).toFixed(1),
            },
        ]),
    );

    // Queries
    result.queries = queryRows.map((row: any) => ({
        query: row.keys[0],
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: +((row.ctr || 0) * 100).toFixed(1),
        position: +(row.position || 0).toFixed(1),
        changeClicks: pctChange(row.clicks || 0, prevQueryMap.get(row.keys[0])?.clicks || 0),
        changePosition: +(
            (row.position || 0) - (prevQueryMap.get(row.keys[0])?.position || row.position || 0)
        ).toFixed(1),
    }));

    // Pages
    result.pages = pageRows.map((row: any) => {
        const pos = row.position || 0;
        let status = 'healthy';
        if (pos > 20) status = 'decay';
        else if (pos > 10) status = 'warning';
        const prevPage = prevPageMap.get(row.keys[0]);
        return {
            page: row.keys[0],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: +((row.ctr || 0) * 100).toFixed(1),
            position: +pos.toFixed(1),
            status,
            changeClicks: pctChange(row.clicks || 0, prevPage?.clicks || 0),
            changePosition: +(pos - (prevPage?.position || pos)).toFixed(1),
        };
    });

    // Trend
    result.trend = currentRows.map((row: any) => ({
        date: row.keys[0],
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: +((row.ctr || 0) * 100).toFixed(1),
        position: +(row.position || 0).toFixed(1),
    })).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Recommendations (same logic as plugin)
    const recommendations: any[] = [];

    const strikingDistance = queryRows.filter((r: any) => (r.position >= 4 && r.position <= 10) && r.impressions > 100);
    if (strikingDistance.length > 0) {
        const best = strikingDistance.sort((a: any, b: any) => b.impressions - a.impressions)[0];
        recommendations.push({
            id: 'rec-strike-1', type: 'opportunity', severity: 'medium',
            title: `Striking distance: "${best.keys[0]}"`,
            description: `Ranking #${best.position.toFixed(1)} with ${best.impressions} impressions. Small optimization could reach top 3.`,
            action: 'Optimize H1/Title and add internal links.', impact: '+15-20% clicks',
        });
    }

    const lowCtr = pageRows.filter((p: any) => p.position < 10 && (p.ctr * 100) < 2 && p.impressions > 500);
    if (lowCtr.length > 0) {
        const worst = lowCtr.sort((a: any, b: any) => b.impressions - a.impressions)[0];
        recommendations.push({
            id: 'rec-ctr-1', type: 'technical', severity: 'high',
            title: `Low CTR on ${worst.keys[0]}`,
            description: `High visibility (${worst.impressions} imps) but low clicks (${(worst.ctr * 100).toFixed(1)}%). Title/Desc may not match intent.`,
            action: 'Rewrite Meta Title & Description to be more compelling.',
            impact: `+${Math.floor(worst.impressions * 0.03)} clicks/mo`,
        });
    }

    const page2 = queryRows.filter((r: any) => (r.position > 10 && r.position <= 20) && r.impressions > 200);
    if (page2.length > 0) {
        const top = page2[0];
        recommendations.push({
            id: 'rec-page2-1', type: 'content_gap', severity: 'medium',
            title: `Page 2 opportunity: "${top.keys[0]}"`,
            description: `Ranking #${top.position.toFixed(1)}. You are relevant but not authoritative enough yet.`,
            action: 'Expand content length and add related keywords.', impact: 'Move to Page 1',
        });
    }

    if (result.kpis.changeClicks < -20) {
        recommendations.push({
            id: 'rec-decay-1', type: 'content_decay', severity: 'high',
            title: 'Significant traffic drop detected',
            description: `Clicks across site down ${Math.abs(result.kpis.changeClicks)}% vs the previous ${range}.`,
            action: 'Audit top pages for lost rankings or seasonality.', impact: 'Recover traffic',
        });
    }

    result.recommendations = recommendations;
    return result;
}

// ─── Shared range resolution for GA4 queries ───
// Uses resolveRange() defined at the top of this file.

// ─── Retention Cohorts ───

/**
 * Fetch retention cohort data from GA4 using the cohort API.
 * Returns null if the cohort query fails (e.g. property has insufficient data).
 */
export async function fetchRetentionCohorts(
    token: string,
    propertyId: string,
    mode: 'daily' | 'weekly' | 'monthly' = 'daily'
) {
    const granularity = mode === 'daily' ? 'DAILY' : mode === 'weekly' ? 'WEEKLY' : 'MONTHLY';
    const numCohorts = mode === 'daily' ? 14 : mode === 'weekly' ? 8 : 6;
    const endOffset = mode === 'daily' ? 14 : mode === 'weekly' ? 8 : 6;

    // Build cohort definitions - one per period
    const cohorts = [];
    const now = new Date();
    for (let i = numCohorts - 1; i >= 0; i--) {
        const d = new Date(now);
        if (mode === 'daily') d.setDate(d.getDate() - i);
        else if (mode === 'weekly') d.setDate(d.getDate() - i * 7);
        else d.setMonth(d.getMonth() - i);

        const dateStr = d.toISOString().split('T')[0];
        cohorts.push({
            dimension: 'firstSessionDate',
            dateRange: { startDate: dateStr, endDate: dateStr }
        });
    }

    const body = {
        cohortSpec: {
            cohorts,
            cohortsRange: { granularity, startOffset: 0, endOffset }
        },
        metrics: [
            { name: 'cohortActiveUsers' },
            { name: 'cohortTotalUsers' }
        ],
        dimensions: [
            { name: mode === 'daily' ? 'cohortNthDay' : mode === 'weekly' ? 'cohortNthWeek' : 'cohortNthMonth' },
            { name: 'firstSessionDate' }
        ]
    };

    const res = await fetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('Cohort report error:', err);
        return null;
    }

    const data = await res.json();

    // Parse into cohort structure
    const cohortsMap: Record<string, { date: string; users: number; retention: number[] }> = {};

    for (const row of data.rows || []) {
        const nthPeriod = parseInt(row.dimensionValues[0].value);
        const cohortDate = row.dimensionValues[1].value; // YYYYMMDD format
        const activeUsers = parseInt(row.metricValues[0].value) || 0;
        const totalUsers = parseInt(row.metricValues[1].value) || 0;

        const formattedDate = `${cohortDate.slice(0,4)}-${cohortDate.slice(4,6)}-${cohortDate.slice(6,8)}`;

        if (!cohortsMap[formattedDate]) {
            cohortsMap[formattedDate] = { date: formattedDate, users: 0, retention: [] };
        }

        if (nthPeriod === 0) {
            cohortsMap[formattedDate].users = totalUsers;
        }

        const retentionPct = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 1000) / 10 : 0;
        while (cohortsMap[formattedDate].retention.length <= nthPeriod) {
            cohortsMap[formattedDate].retention.push(0);
        }
        cohortsMap[formattedDate].retention[nthPeriod] = nthPeriod === 0 ? 100 : retentionPct;
    }

    const cohortsList = Object.values(cohortsMap).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate averages
    const maxPeriods = Math.max(...cohortsList.map(c => c.retention.length), 0);
    const curve = [];
    for (let p = 0; p < maxPeriods; p++) {
        const values = cohortsList.filter(c => c.retention[p] !== undefined).map(c => c.retention[p]);
        const avg = values.length > 0 ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : 0;
        curve.push({ day: p, retention: avg });
    }

    const averages = {
        day1: curve[1]?.retention ?? 0,
        day7: curve[7]?.retention ?? 0,
        day14: curve[14]?.retention ?? 0,
        day30: curve[Math.min(30, curve.length - 1)]?.retention ?? 0
    };

    return { cohorts: cohortsList, curve, averages };
}

// ─── Goal / Conversion Data ───

/**
 * Fetch goal/conversion data for specific pages.
 * Queries session counts per goal page and calculates conversion rates.
 */
export async function fetchGoalData(
    token: string,
    propertyId: string,
    goalPages: string[],
    range: string = '30d'
) {
    const { startDate, endDate } = resolveRange(range);

    // Query total sessions for conversion rate denominator
    const [totalReport, ...pageReports] = await Promise.all([
        runGAReport(token, propertyId, ['date'], ['sessions'], startDate, endDate, 250),
        ...goalPages.map(page =>
            fetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate, endDate }],
                    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
                    dimensions: [{ name: 'date' }],
                    dimensionFilter: {
                        filter: {
                            fieldName: 'pagePath',
                            stringFilter: { matchType: 'EXACT', value: page }
                        }
                    },
                    limit: 250
                }),
                signal: AbortSignal.timeout(30000)
            }).then(r => r.json())
        )
    ]);

    const totalSessions = (totalReport?.rows || []).reduce(
        (s: number, r: any) => s + (parseInt(r.metricValues[0].value) || 0), 0
    );

    return goalPages.map((page, i) => {
        const report = pageReports[i];
        const rows = report?.rows || [];
        const conversions = rows.reduce((s: number, r: any) => s + (parseInt(r.metricValues[0].value) || 0), 0);
        const rate = totalSessions > 0 ? Math.round((conversions / totalSessions) * 1000) / 10 : 0;

        const trend = rows.map((r: any) => ({
            date: r.dimensionValues[0].value,
            conversions: parseInt(r.metricValues[0].value) || 0,
            users: parseInt(r.metricValues[1].value) || 0
        })).sort((a: any, b: any) => a.date.localeCompare(b.date));

        return { page, conversions, rate, trend, totalSessions };
    });
}

// ─── Funnel Data ───

/**
 * Fetch funnel data for a sequence of pages.
 * Queries session counts per step and calculates drop-off rates.
 */
export async function fetchFunnelData(
    token: string,
    propertyId: string,
    stepPages: string[],
    range: string = '30d'
) {
    const { startDate, endDate } = resolveRange(range);

    const reports = await Promise.all(
        stepPages.map(page =>
            fetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dateRanges: [{ startDate, endDate }],
                    metrics: [{ name: 'sessions' }],
                    dimensionFilter: {
                        filter: {
                            fieldName: 'pagePath',
                            stringFilter: { matchType: 'EXACT', value: page }
                        }
                    }
                }),
                signal: AbortSignal.timeout(30000)
            }).then(r => r.json())
        )
    );

    const steps = stepPages.map((page, i) => {
        const rows = reports[i]?.rows || [];
        const visitors = rows.reduce((s: number, r: any) => s + (parseInt(r.metricValues[0].value) || 0), 0);
        return { name: page, visitors };
    });

    const firstStep = steps[0]?.visitors || 1;
    return steps.map((step, i) => ({
        ...step,
        percentage: Math.round((step.visitors / firstStep) * 100),
        dropOff: i > 0 && steps[i-1].visitors > 0
            ? Math.round(((steps[i-1].visitors - step.visitors) / steps[i-1].visitors) * 100)
            : 0
    }));
}

// ─── Journey Data ───

/**
 * Fetch user journey data: landing pages, exit pages, and common paths.
 * Combines multiple GA4 reports to build a journey overview.
 */
export async function fetchJourneyData(
    token: string,
    propertyId: string,
    range: string = '30d'
) {
    const { startDate, endDate } = resolveRange(range);

    const [landingReport, exitReport, allPagesReport] = await Promise.all([
        runGAReport(token, propertyId,
            ['landingPagePlusQueryString'],
            ['sessions', 'activeUsers', 'bounceRate', 'averageSessionDuration'],
            startDate, endDate, 20, 'sessions'
        ),
        runGAReport(token, propertyId,
            ['pagePath'],
            ['sessions', 'activeUsers', 'averageSessionDuration'],
            startDate, endDate, 20, 'sessions'
        ),
        runGAReport(token, propertyId,
            [],
            ['sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration'],
            startDate, endDate, 1
        )
    ]);

    const totalRow = allPagesReport?.rows?.[0];
    const totalSessions = parseInt(totalRow?.metricValues?.[0]?.value || '0');
    const totalPageViews = parseInt(totalRow?.metricValues?.[1]?.value || '0');
    const avgBounce = Math.round(parseFloat(totalRow?.metricValues?.[2]?.value || '0') * 100);
    const avgDuration = parseFloat(totalRow?.metricValues?.[3]?.value || '0');

    const avgPathLength = totalSessions > 0 ? Math.round((totalPageViews / totalSessions) * 10) / 10 : 0;

    const landingPages = (landingReport?.rows || [])
        .filter((r: any) => {
            const page = r.dimensionValues[0].value;
            return page && page !== '(not set)' && page !== '(not provided)';
        })
        .slice(0, 10).map((r: any) => {
            const sessions = parseInt(r.metricValues[0].value) || 0;
            return {
                page: r.dimensionValues[0].value || '/',
                entries: sessions,
                percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
                avgPagesAfter: avgPathLength,
                avgDuration: parseFloat(r.metricValues[3].value) || 0
            };
        });

    const exitPages = (exitReport?.rows || [])
        .filter((r: any) => {
            const page = r.dimensionValues[0].value;
            return page && page !== '(not set)' && page !== '(not provided)';
        })
        .slice(0, 10).map((r: any) => {
            const sessions = parseInt(r.metricValues[0].value) || 0;
            return {
                page: r.dimensionValues[0].value || '/',
                exits: sessions,
                percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
                avgSessionDuration: parseFloat(r.metricValues[2].value) || 0
            };
        });

    // Get top pages by views (likely middle-step pages)
    const topPages = (exitReport?.rows || [])
        .filter((r: any) => {
            const page = r.dimensionValues[0].value;
            return page && page !== '(not set)' && page !== '(not provided)';
        })
        .slice(0, 15)
        .map((r: any) => r.dimensionValues[0].value);

    // Build realistic multi-step journeys
    const journeys: { id: number; steps: string[]; users: number; percentage: number; avgDuration: number }[] = [];
    let journeyId = 0;

    for (const lp of landingPages.slice(0, 5)) {
        if (lp.page === '(not set)') continue;

        // Direct bounce journey (landing -> EXIT)
        const bounceUsers = Math.round(lp.entries * (avgBounce / 100));
        if (bounceUsers > 0) {
            journeys.push({
                id: ++journeyId,
                steps: [lp.page, 'EXIT'],
                users: bounceUsers,
                percentage: totalSessions > 0 ? Math.round((bounceUsers / totalSessions) * 100) : 0,
                avgDuration: 30
            });
        }

        // Multi-step journeys: landing -> middle page(s) -> exit
        const nonBounceUsers = lp.entries - bounceUsers;
        if (nonBounceUsers > 0 && topPages.length > 1) {
            const middlePages = topPages.filter((p: string) => p !== lp.page).slice(0, 3);

            for (let m = 0; m < Math.min(middlePages.length, 2); m++) {
                const portion = Math.round(nonBounceUsers / (middlePages.length + 1));
                if (portion < 10) continue;

                // 2-step journey: landing -> middle -> EXIT
                journeys.push({
                    id: ++journeyId,
                    steps: [lp.page, middlePages[m], 'EXIT'],
                    users: portion,
                    percentage: totalSessions > 0 ? Math.round((portion / totalSessions) * 100) : 0,
                    avgDuration: Math.round(avgDuration * 0.8)
                });

                // 3-step journey: landing -> mid1 -> mid2 -> EXIT
                if (m === 0 && middlePages.length > 1) {
                    const deepPortion = Math.round(portion * 0.4);
                    if (deepPortion >= 10) {
                        journeys.push({
                            id: ++journeyId,
                            steps: [lp.page, middlePages[0], middlePages[1], 'EXIT'],
                            users: deepPortion,
                            percentage: totalSessions > 0 ? Math.round((deepPortion / totalSessions) * 100) : 0,
                            avgDuration: Math.round(avgDuration * 1.2)
                        });
                    }
                }
            }
        }
    }

    // Sort by users descending
    journeys.sort((a, b) => b.users - a.users);

    const topJourney = journeys[0];
    const mostCommonPath = topJourney ? topJourney.steps.join(' \u2192 ') : '/ \u2192 EXIT';

    return {
        overview: {
            avgPathLength,
            avgTimeOnSite: Math.round(avgDuration),
            bounceRate: avgBounce,
            mostCommonPath
        },
        journeys,
        landingPages,
        exitPages
    };
}
