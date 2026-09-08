import { resolveRange } from '@/lib/googleApi';
import {
    fetchShareOverviewLive,
    fetchShareOverviewStats,
    fetchShareOverviewTopGeneric,
    fetchShareOverviewTopPages,
} from '@/lib/shareOverviewData';
import type { ShareOverviewFilter } from '@/lib/shareOverviewFilters';
import type { NormalizedShareConfig } from '@/lib/shareTypes';
import { BRAND_NAME } from '@/lib/brand';
import {
    fetchUmamiActiveVisitors,
    fetchUmamiMetrics,
    fetchUmamiPageviews,
    fetchUmamiRealtime,
    fetchUmamiStats,
    isUmamiConfigured,
} from '@/lib/umamiClient';

const DAY_MS = 24 * 60 * 60 * 1000;

type DateWindow = {
    startDate: string;
    endDate: string;
    startAt: number;
    endAt: number;
};

type RawSummary = {
    pageviews: number;
    visitors: number;
    visits: number;
    bounces: number;
    totaltime: number;
};

type DashboardSeriesPoint = {
    date: string;
    pageviews: number;
    visits: number;
};

type BreakdownItem = {
    label: string;
    value: number;
};

type RealtimeSeriesPoint = {
    time: string;
    views: number;
    visitors: number;
};

export type ShareUmamiDashboardData = {
    source: {
        mode: 'trafficclaw' | 'umami' | 'hybrid';
        label: string;
        configured: boolean;
        cutoverAt: string | null;
        message: string | null;
    };
    summary: {
        pageviews: { value: number; change: number | null };
        visitors: { value: number; change: number | null };
        visits: { value: number; change: number | null };
        bounceRate: { value: number; change: number | null };
        visitDuration: { value: number; change: number | null };
    };
    series: DashboardSeriesPoint[];
    breakdowns: {
        pages: BreakdownItem[];
        referrers: BreakdownItem[];
        devices: BreakdownItem[];
        countries: BreakdownItem[];
    };
    realtime: {
        source: 'trafficclaw' | 'umami';
        activeVisitors: number;
        totalViews: number;
        totalVisitors: number;
        series: RealtimeSeriesPoint[];
        pages: BreakdownItem[];
        referrers: BreakdownItem[];
        countries: BreakdownItem[];
    };
};

export type ShareUmamiRealtimeData = ShareUmamiDashboardData['realtime'];

function formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function resolveDateToken(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const resolved = new Date();

    if (value === 'today') {
        return formatDate(resolved);
    }

    if (value === 'yesterday') {
        resolved.setDate(resolved.getDate() - 1);
        return formatDate(resolved);
    }

    const daysAgoMatch = value.match(/^(\d+)daysAgo$/);
    if (daysAgoMatch) {
        resolved.setDate(resolved.getDate() - Number.parseInt(daysAgoMatch[1], 10));
        return formatDate(resolved);
    }

    return value;
}

function parseStart(date: string) {
    return new Date(`${date}T00:00:00.000Z`);
}

function parseEnd(date: string) {
    return new Date(`${date}T23:59:59.999Z`);
}

function resolveWindow(range: string, startDate?: string | null, endDate?: string | null): DateWindow {
    const resolved = range === 'custom' && startDate && endDate
        ? { startDate, endDate }
        : resolveRange(range);

    const resolvedStartDate = resolveDateToken(resolved.startDate);
    const resolvedEndDate = resolveDateToken(resolved.endDate);

    return {
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
        startAt: parseStart(resolvedStartDate).getTime(),
        endAt: parseEnd(resolvedEndDate).getTime(),
    };
}

function getPreviousWindow(window: DateWindow): DateWindow {
    const duration = window.endAt - window.startAt;
    const previousEndAt = window.startAt - 1;
    const previousStartAt = previousEndAt - duration;

    return {
        startDate: formatDate(new Date(previousStartAt)),
        endDate: formatDate(new Date(previousEndAt)),
        startAt: previousStartAt,
        endAt: previousEndAt,
    };
}

function emptySummary(): RawSummary {
    return {
        pageviews: 0,
        visitors: 0,
        visits: 0,
        bounces: 0,
        totaltime: 0,
    };
}

function mergeSummary(left: RawSummary, right: RawSummary): RawSummary {
    return {
        pageviews: left.pageviews + right.pageviews,
        visitors: left.visitors + right.visitors,
        visits: left.visits + right.visits,
        bounces: left.bounces + right.bounces,
        totaltime: left.totaltime + right.totaltime,
    };
}

function summaryToCardData(current: RawSummary, previous: RawSummary) {
    const currentBounceRate = current.visits > 0 ? (current.bounces / current.visits) * 100 : 0;
    const previousBounceRate = previous.visits > 0 ? (previous.bounces / previous.visits) * 100 : 0;
    const currentVisitDuration = current.visits > 0 ? current.totaltime / current.visits : 0;
    const previousVisitDuration = previous.visits > 0 ? previous.totaltime / previous.visits : 0;

    return {
        pageviews: {
            value: current.pageviews,
            change: getPercentChange(current.pageviews, previous.pageviews),
        },
        visitors: {
            value: current.visitors,
            change: getPercentChange(current.visitors, previous.visitors),
        },
        visits: {
            value: current.visits,
            change: getPercentChange(current.visits, previous.visits),
        },
        bounceRate: {
            value: +currentBounceRate.toFixed(1),
            change: getPercentChange(currentBounceRate, previousBounceRate),
        },
        visitDuration: {
            value: +currentVisitDuration.toFixed(0),
            change: getPercentChange(currentVisitDuration, previousVisitDuration),
        },
    };
}

function getPercentChange(current: number, previous: number) {
    if (!previous) {
        return current ? 100 : 0;
    }

    return +((((current - previous) / previous) * 100).toFixed(1));
}

function mergeSeries(parts: DashboardSeriesPoint[][]) {
    const map = new Map<string, DashboardSeriesPoint>();

    parts.flat().forEach((point) => {
        const existing = map.get(point.date);
        if (existing) {
            existing.pageviews += point.pageviews;
            existing.visits += point.visits;
        } else {
            map.set(point.date, { ...point });
        }
    });

    return Array.from(map.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function mergeBreakdowns(parts: BreakdownItem[][], limit = 8) {
    const map = new Map<string, number>();

    parts.flat().forEach((item) => {
        map.set(item.label, (map.get(item.label) || 0) + item.value);
    });

    return Array.from(map.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, limit);
}

function normalizePointDate(value: string) {
    return value.slice(0, 10);
}

function getCutoverStart(config: NormalizedShareConfig) {
    if (!config.umamiEnabledAt) {
        return null;
    }

    const cutover = new Date(config.umamiEnabledAt);
    if (Number.isNaN(cutover.getTime())) {
        return null;
    }

    cutover.setUTCHours(0, 0, 0, 0);
    return cutover.getTime();
}

function splitWindow(window: DateWindow, config: NormalizedShareConfig) {
    const cutoverAt = getCutoverStart(config);
    const hasUmami = Boolean(config.umamiWebsiteId && isUmamiConfigured() && cutoverAt);

    if (!hasUmami || cutoverAt === null) {
        return {
            historical: window,
            umami: null,
            mode: 'trafficclaw' as const,
        };
    }

    if (window.endAt < cutoverAt) {
        return {
            historical: window,
            umami: null,
            mode: 'trafficclaw' as const,
        };
    }

    if (window.startAt >= cutoverAt) {
        return {
            historical: null,
            umami: window,
            mode: 'umami' as const,
        };
    }

    const historicalEnd = cutoverAt - DAY_MS;
    return {
        historical: {
            startDate: window.startDate,
            endDate: formatDate(new Date(historicalEnd)),
            startAt: window.startAt,
            endAt: historicalEnd,
        },
        umami: {
            startDate: formatDate(new Date(cutoverAt)),
            endDate: window.endDate,
            startAt: cutoverAt,
            endAt: window.endAt,
        },
        mode: 'hybrid' as const,
    };
}

async function loadHistoricalWindow(input: {
    accessToken: string;
    propertyId: string;
    window: DateWindow;
    filters: ShareOverviewFilter[];
}) {
    const stats = await fetchShareOverviewStats({
        accessToken: input.accessToken,
        propertyId: input.propertyId,
        range: 'custom',
        interval: 'day',
        startDate: input.window.startDate,
        endDate: input.window.endDate,
        filters: input.filters,
    });

    return {
        summary: {
            pageviews: stats.metrics.total_screen_views,
            visitors: stats.metrics.unique_visitors,
            visits: stats.metrics.total_sessions,
            bounces: Math.round(stats.metrics.total_sessions * (stats.metrics.bounce_rate / 100)),
            totaltime: Math.round(stats.metrics.avg_session_duration * stats.metrics.total_sessions),
        },
        series: stats.series.map((point) => ({
            date: point.date.slice(0, 10),
            pageviews: point.total_screen_views,
            visits: point.total_sessions,
        })),
    };
}

async function loadUmamiWindow(input: {
    websiteId: string;
    window: DateWindow;
    filters: ShareOverviewFilter[];
}) {
    const [stats, pageviews] = await Promise.all([
        fetchUmamiStats({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            filters: input.filters,
        }),
        fetchUmamiPageviews({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            unit: 'day',
            filters: input.filters,
        }),
    ]);

    const pageviewSeries = new Map<string, DashboardSeriesPoint>();

    (pageviews.pageviews || []).forEach((point) => {
        const date = normalizePointDate(point.x);
        pageviewSeries.set(date, {
            date,
            pageviews: point.y,
            visits: 0,
        });
    });

    (pageviews.sessions || []).forEach((point) => {
        const date = normalizePointDate(point.x);
        const existing = pageviewSeries.get(date) || { date, pageviews: 0, visits: 0 };
        existing.visits = point.y;
        pageviewSeries.set(date, existing);
    });

    return {
        summary: {
            pageviews: stats.pageviews || 0,
            visitors: stats.visitors || 0,
            visits: stats.visits || 0,
            bounces: stats.bounces || 0,
            totaltime: stats.totaltime || 0,
        },
        series: Array.from(pageviewSeries.values()).sort((left, right) => left.date.localeCompare(right.date)),
    };
}

async function loadHistoricalBreakdowns(input: {
    accessToken: string;
    propertyId: string;
    window: DateWindow;
    filters: ShareOverviewFilter[];
}) {
    const [pages, referrers, devices, countries] = await Promise.all([
        fetchShareOverviewTopPages({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            range: 'custom',
            startDate: input.window.startDate,
            endDate: input.window.endDate,
            mode: 'page',
            filters: input.filters,
        }),
        fetchShareOverviewTopGeneric({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            range: 'custom',
            startDate: input.window.startDate,
            endDate: input.window.endDate,
            column: 'referrer_name',
            filters: input.filters,
        }),
        fetchShareOverviewTopGeneric({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            range: 'custom',
            startDate: input.window.startDate,
            endDate: input.window.endDate,
            column: 'device',
            filters: input.filters,
        }),
        fetchShareOverviewTopGeneric({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            range: 'custom',
            startDate: input.window.startDate,
            endDate: input.window.endDate,
            column: 'country',
            filters: input.filters,
        }),
    ]);

    return {
        pages: (pages.items || []).map((item: { path: string; pageviews?: number; sessions?: number }) => ({
            label: item.path,
            value: item.pageviews || item.sessions || 0,
        })),
        referrers: (referrers.items || []).map((item: { name: string; pageviews?: number; sessions?: number }) => ({
            label: item.name,
            value: item.pageviews || item.sessions || 0,
        })),
        devices: (devices.items || []).map((item: { name: string; pageviews?: number; sessions?: number }) => ({
            label: item.name,
            value: item.pageviews || item.sessions || 0,
        })),
        countries: (countries.items || []).map((item: { name: string; pageviews?: number; sessions?: number }) => ({
            label: item.name,
            value: item.pageviews || item.sessions || 0,
        })),
    };
}

async function loadUmamiBreakdowns(input: {
    websiteId: string;
    window: DateWindow;
    filters: ShareOverviewFilter[];
}) {
    const [pages, referrers, devices, countries] = await Promise.all([
        fetchUmamiMetrics({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            type: 'path',
            limit: 10,
            expanded: true,
            filters: input.filters,
        }),
        fetchUmamiMetrics({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            type: 'referrer',
            limit: 10,
            expanded: true,
            filters: input.filters,
        }),
        fetchUmamiMetrics({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            type: 'device',
            limit: 10,
            expanded: true,
            filters: input.filters,
        }),
        fetchUmamiMetrics({
            websiteId: input.websiteId,
            startAt: input.window.startAt,
            endAt: input.window.endAt,
            type: 'country',
            limit: 10,
            expanded: true,
            filters: input.filters,
        }),
    ]);

    const toItems = (items: Array<{ name: string; pageviews?: number; visits?: number; visitors?: number }>) =>
        items.map((item) => ({
            label: item.name,
            value: item.pageviews || item.visits || item.visitors || 0,
        }));

    return {
        pages: toItems(pages),
        referrers: toItems(referrers),
        devices: toItems(devices),
        countries: toItems(countries),
    };
}

async function loadRealtime(input: {
    accessToken: string | null;
    propertyId: string;
    config: NormalizedShareConfig;
    filters: ShareOverviewFilter[];
}) {
    if (input.config.umamiWebsiteId && isUmamiConfigured()) {
        const [realtime, active] = await Promise.all([
            fetchUmamiRealtime(input.config.umamiWebsiteId).catch(() => null),
            fetchUmamiActiveVisitors(input.config.umamiWebsiteId).catch(() => null),
        ]);

        if (realtime) {
            return {
                source: 'umami' as const,
                activeVisitors: active?.visitors ?? realtime.totals?.visitors ?? 0,
                totalViews: realtime.totals?.views ?? 0,
                totalVisitors: realtime.totals?.visitors ?? 0,
                series: (realtime.series?.views || []).map((point, index) => ({
                    time: point.x.slice(11, 16),
                    views: point.y,
                    visitors: realtime.series?.visitors?.[index]?.y || 0,
                })),
                pages: Object.entries(realtime.urls || {})
                    .map(([label, value]) => ({ label, value }))
                    .sort((left, right) => right.value - left.value)
                    .slice(0, 6),
                referrers: Object.entries(realtime.referrers || {})
                    .map(([label, value]) => ({ label, value }))
                    .sort((left, right) => right.value - left.value)
                    .slice(0, 6),
                countries: Object.entries(realtime.countries || {})
                    .map(([label, value]) => ({ label, value }))
                    .sort((left, right) => right.value - left.value)
                    .slice(0, 6),
            };
        }
    }

    if (!input.accessToken) {
        return {
            source: 'trafficclaw' as const,
            activeVisitors: 0,
            totalViews: 0,
            totalVisitors: 0,
            series: [],
            pages: [],
            referrers: [],
            countries: [],
        };
    }

    const live = await fetchShareOverviewLive({
        accessToken: input.accessToken,
        propertyId: input.propertyId,
        filters: input.filters,
    });

    return {
        source: 'trafficclaw' as const,
        activeVisitors: live.activeUsers,
        totalViews: live.minuteCounts.reduce((sum, point) => sum + point.sessionCount, 0),
        totalVisitors: live.activeUsers,
        series: live.minuteCounts.map((point) => ({
            time: point.time.replace(' ago', ''),
            views: point.sessionCount,
            visitors: point.visitorCount,
        })),
        pages: live.byPage
            .map((item: { page: string; users: number }) => ({ label: item.page, value: item.users }))
            .sort((left: BreakdownItem, right: BreakdownItem) => right.value - left.value)
            .slice(0, 6),
        referrers: live.referrers
            .map((item: { referrer: string; count: number }) => ({ label: item.referrer, value: item.count }))
            .sort((left: BreakdownItem, right: BreakdownItem) => right.value - left.value)
            .slice(0, 6),
        countries: live.byCountry
            .map((item: { country: string; users: number }) => ({ label: item.country, value: item.users }))
            .sort((left: BreakdownItem, right: BreakdownItem) => right.value - left.value)
            .slice(0, 6),
    };
}

export async function fetchShareUmamiRealtime(input: {
    accessToken: string | null;
    propertyId: string;
    config: NormalizedShareConfig;
    filters: ShareOverviewFilter[];
}) {
    return loadRealtime(input);
}

export async function fetchShareUmamiDashboard(input: {
    accessToken: string | null;
    propertyId: string;
    config: NormalizedShareConfig;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
}) : Promise<ShareUmamiDashboardData> {
    const currentWindow = resolveWindow(input.range, input.startDate, input.endDate);
    const previousWindow = getPreviousWindow(currentWindow);

    const currentParts = splitWindow(currentWindow, input.config);
    const previousParts = splitWindow(previousWindow, input.config);

    const [currentHistorical, currentUmami, previousHistorical, previousUmami, currentHistoricalBreakdowns, currentUmamiBreakdowns, realtime] = await Promise.all([
        currentParts.historical && input.accessToken
            ? loadHistoricalWindow({
                accessToken: input.accessToken,
                propertyId: input.propertyId,
                window: currentParts.historical,
                filters: input.filters,
            })
            : null,
        currentParts.umami && input.config.umamiWebsiteId
            ? loadUmamiWindow({
                websiteId: input.config.umamiWebsiteId,
                window: currentParts.umami,
                filters: input.filters,
            })
            : null,
        previousParts.historical && input.accessToken
            ? loadHistoricalWindow({
                accessToken: input.accessToken,
                propertyId: input.propertyId,
                window: previousParts.historical,
                filters: input.filters,
            })
            : null,
        previousParts.umami && input.config.umamiWebsiteId
            ? loadUmamiWindow({
                websiteId: input.config.umamiWebsiteId,
                window: previousParts.umami,
                filters: input.filters,
            })
            : null,
        currentParts.historical && input.accessToken
            ? loadHistoricalBreakdowns({
                accessToken: input.accessToken,
                propertyId: input.propertyId,
                window: currentParts.historical,
                filters: input.filters,
            })
            : null,
        currentParts.umami && input.config.umamiWebsiteId
            ? loadUmamiBreakdowns({
                websiteId: input.config.umamiWebsiteId,
                window: currentParts.umami,
                filters: input.filters,
            })
            : null,
        loadRealtime({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            config: input.config,
            filters: input.filters,
        }),
    ]);

    const currentSummary = mergeSummary(
        currentHistorical?.summary || emptySummary(),
        currentUmami?.summary || emptySummary(),
    );
    const previousSummary = mergeSummary(
        previousHistorical?.summary || emptySummary(),
        previousUmami?.summary || emptySummary(),
    );

    const sourceLabel = currentParts.mode === 'hybrid'
        ? `${BRAND_NAME} + Umami`
        : currentParts.mode === 'umami'
            ? 'Umami'
            : `${BRAND_NAME}`;

    const sourceMessage = currentParts.mode === 'hybrid'
        ? `Historical data is served from ${BRAND_NAME} before cutover and Umami after cutover.`
        : currentParts.mode === 'umami'
            ? 'This range is fully served from the Umami share bridge.'
            : input.config.umamiWebsiteId
                ? `This range is entirely before the Umami cutover, so it is served from ${BRAND_NAME} history.`
                : `Umami has not been configured for this share yet, so ${BRAND_NAME} history is serving the full range.`;

    return {
        source: {
            mode: currentParts.mode,
            label: sourceLabel,
            configured: Boolean(input.config.umamiWebsiteId && isUmamiConfigured()),
            cutoverAt: input.config.umamiEnabledAt,
            message: sourceMessage,
        },
        summary: summaryToCardData(currentSummary, previousSummary),
        series: mergeSeries([
            currentHistorical?.series || [],
            currentUmami?.series || [],
        ]),
        breakdowns: {
            pages: mergeBreakdowns([
                currentHistoricalBreakdowns?.pages || [],
                currentUmamiBreakdowns?.pages || [],
            ]),
            referrers: mergeBreakdowns([
                currentHistoricalBreakdowns?.referrers || [],
                currentUmamiBreakdowns?.referrers || [],
            ]),
            devices: mergeBreakdowns([
                currentHistoricalBreakdowns?.devices || [],
                currentUmamiBreakdowns?.devices || [],
            ]),
            countries: mergeBreakdowns([
                currentHistoricalBreakdowns?.countries || [],
                currentUmamiBreakdowns?.countries || [],
            ]),
        },
        realtime,
    };
}
