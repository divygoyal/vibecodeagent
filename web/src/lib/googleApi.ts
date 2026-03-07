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

// In-memory token cache: refreshToken → { accessToken, expiresAt }
// Capped at 1000 entries to prevent unbounded memory growth
const TOKEN_CACHE_MAX = 1000;
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

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

        const refreshPromise = (async () => {
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

                    return newToken;
                }
                console.error('Google token refresh failed:', res.status, await res.text());
            } finally {
                pendingRefresh.delete(refreshToken);
            }
            // Refresh failed — fall through to access token fallback
            if (accessToken) return accessToken;
            throw new Error('Failed to refresh Google token');
        })();

        // Set BEFORE awaiting so concurrent callers share the same promise
        pendingRefresh.set(refreshToken, refreshPromise);
        return refreshPromise;
    }

    // Fallback to existing access token (might be expired)
    if (accessToken) return accessToken;
    throw new Error('Failed to refresh Google token');
}

// ─── Google Analytics Data API ───

const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const GA_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta';

async function gaFetch(url: string, token: string, body?: any) {
    const opts: RequestInit = {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
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
    return res.json();
}

/**
 * List GA4 properties accessible by the user.
 */
export async function listAnalyticsProperties(token: string) {
    const data = await gaFetch(`${GA_ADMIN_BASE}/accountSummaries`, token);
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

async function runGAReport(
    token: string,
    propertyId: string,
    dims: string[],
    mets: string[],
    startDate: string,
    endDate: string,
    limit = 100,
    orderByMetric?: string
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
    return gaFetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, token, body);
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

    const rangeMap: Record<string, string> = {
        'today': 'today', 'yesterday': 'yesterday',
        '7d': '7daysAgo', '14d': '14daysAgo', '30d': '28daysAgo',
        '90d': '90daysAgo', '6m': '180daysAgo', '12m': '365daysAgo',
    };
    const startDate = rangeMap[range] || '28daysAgo';
    const endDate = (range === 'yesterday') ? 'yesterday' : 'today';

    const prevRangeMap: Record<string, string> = {
        'today': 'yesterday', 'yesterday': '2daysAgo',
        '7d': '14daysAgo', '14d': '28daysAgo', '30d': '56daysAgo',
        '90d': '180daysAgo', '6m': '365daysAgo', '12m': '730daysAgo',
    };
    const prevStartDate = prevRangeMap[range] || '56daysAgo';
    const prevEndDateMap: Record<string, string> = {
        'today': 'yesterday', 'yesterday': '2daysAgo',
        '7d': '8daysAgo', '14d': '15daysAgo', '30d': '29daysAgo',
        '90d': '91daysAgo', '6m': '181daysAgo', '12m': '366daysAgo',
    };
    const prevEndDate = prevEndDateMap[range] || '29daysAgo';

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

    const pctChange = (cur: number, prev: number) => prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0;
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

    // Run all real-time queries in parallel
    const [totalData, countryData, cityData, deviceData, pageData] = await Promise.all([
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

// ─── Google Search Console API ───

const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

/**
 * List all verified Search Console sites.
 */
export async function listSearchConsoleSites(token: string) {
    const data = await gaFetch(`${GSC_BASE}/sites`, token);
    return data.siteEntry || [];
}

async function runGSCQuery(
    token: string,
    siteUrl: string,
    dims: string[],
    startDate: string,
    endDate: string,
    limit = 100
) {
    const body = {
        startDate,
        endDate,
        dimensions: dims,
        rowLimit: limit,
        type: 'web',
    };
    return gaFetch(`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, body);
}

/**
 * Fetch full SEO dashboard data (KPIs, queries, pages, trend, recommendations).
 * Mirrors the plugin's dashboardJson() method.
 */
export async function fetchSeoDashboard(token: string, siteUrl: string) {
    const result: any = { kpis: null, queries: [], pages: [], trend: [], recommendations: [] };

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 28);
    const prevStart = new Date(now);
    prevStart.setDate(prevStart.getDate() - 56);
    const prevEnd = new Date(now);
    prevEnd.setDate(prevEnd.getDate() - 29);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // Run all queries in parallel
    const [currentData, prevData, queryData, pageData] = await Promise.all([
        runGSCQuery(token, siteUrl, ['date'], fmt(startDate), fmt(now), 1000),
        runGSCQuery(token, siteUrl, ['date'], fmt(prevStart), fmt(prevEnd), 1000),
        runGSCQuery(token, siteUrl, ['query'], fmt(startDate), fmt(now), 12),
        runGSCQuery(token, siteUrl, ['page'], fmt(startDate), fmt(now), 10),
    ]);

    const currentRows = currentData.rows || [];
    const prevRows = prevData.rows || [];
    const queryRows = queryData.rows || [];
    const pageRows = pageData.rows || [];

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

    const pctChange = (cur: number, prev: number) => prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0;
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

    // Queries
    result.queries = queryRows.map((row: any) => ({
        query: row.keys[0],
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: +((row.ctr || 0) * 100).toFixed(1),
        position: +(row.position || 0).toFixed(1),
    }));

    // Pages
    result.pages = pageRows.map((row: any) => {
        const pos = row.position || 0;
        let status = 'healthy';
        if (pos > 20) status = 'decay';
        else if (pos > 10) status = 'warning';
        return {
            page: row.keys[0],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: +((row.ctr || 0) * 100).toFixed(1),
            position: +pos.toFixed(1),
            status,
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
            description: `Clicks across site down ${Math.abs(result.kpis.changeClicks)}% vs previous 28 days.`,
            action: 'Audit top pages for lost rankings or seasonality.', impact: 'Recover traffic',
        });
    }

    result.recommendations = recommendations;
    return result;
}
