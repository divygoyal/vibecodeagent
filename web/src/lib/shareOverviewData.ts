import {
    fetchJourneyData,
    resolvePrevRange,
    resolveRange,
    runFlexibleGAReport,
    runFlexibleRealtimeReport,
} from '@/lib/googleApi';
import { cachedFetch } from '@/lib/apiCache';
import { hasPageScopedFilter, type ShareOverviewFilter, type ShareOverviewFilterName } from '@/lib/shareOverviewFilters';

type OverviewInterval = 'hour' | 'day' | 'week' | 'month';

type OverviewRangeResult = {
    startDate: string;
    endDate: string;
};

type MetricPoint = {
    date: string;
    unique_visitors: number;
    total_sessions: number;
    total_screen_views: number;
    new_users: number;
    bounce_rate: number;
    avg_session_duration: number;
    views_per_session: number;
    total_revenue: number;
};

type GAReportValue = {
    value?: string;
};

type GAReportRow = {
    dimensionValues?: GAReportValue[];
    metricValues?: GAReportValue[];
};

type GaFilterExpression = {
    filter?: {
        fieldName: string;
        inListFilter?: {
            values: string[];
            caseSensitive: boolean;
        };
        stringFilter?: {
            value: string;
            matchType: string;
            caseSensitive: boolean;
        };
    };
    notExpression?: GaFilterExpression;
    andGroup?: {
        expressions: GaFilterExpression[];
    };
    orGroup?: {
        expressions: GaFilterExpression[];
    };
};

function buildOverviewDataCacheKey(kind: string, parts: unknown[]) {
    return ['share-overview-data', kind, ...parts.map((part) => {
        if (part === undefined || part === null) return '';
        if (typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean') return String(part);
        return JSON.stringify(part);
    })].join(':');
}

type OverviewEventItem = {
    id: string;
    name: string;
    count: number;
};

type JourneyData = Awaited<ReturnType<typeof fetchJourneyData>>;
type JourneyItem = JourneyData['journeys'][number];
type JourneyExitPage = JourneyData['exitPages'][number];

type TopGenericDefinition = {
    dimensions: string[];
    prefixIndex?: number;
    nameIndex?: number;
    label: string;
};

const FILTER_FIELD_MAP: Record<ShareOverviewFilterName, string | null> = {
    referrer_name: 'sessionSource',
    referrer: 'fullReferrer',
    referrer_type: 'sessionDefaultChannelGroup',
    utm_source: 'sessionSource',
    utm_medium: 'sessionMedium',
    utm_campaign: 'sessionCampaignName',
    utm_term: 'sessionManualTerm',
    utm_content: 'sessionManualAdContent',
    device: 'deviceCategory',
    browser: 'browser',
    browser_version: 'browserVersion',
    os: 'operatingSystem',
    os_version: 'operatingSystemVersion',
    brand: 'mobileDeviceBranding',
    model: 'mobileDeviceModel',
    country: 'country',
    region: 'region',
    city: 'city',
    origin: 'hostName',
    path: 'unifiedScreenName',
    entry_path: 'landingPagePlusQueryString',
    exit_path: 'pagePathPlusQueryString',
    name: 'eventName',
};

const JOURNEY_COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#c084fc', '#f87171', '#38bdf8'];
const SYSTEM_EVENT_NAMES = new Set(['screen_view', 'session_start', 'session_end', 'first_visit', 'user_engagement']);
const TOP_GENERIC_DEFS: Record<string, TopGenericDefinition> = {
    referrer_name: { dimensions: ['sessionSource'], label: 'Referrer' },
    referrer: { dimensions: ['fullReferrer'], label: 'Referrer URL' },
    referrer_type: { dimensions: ['sessionDefaultChannelGroup'], label: 'Type' },
    utm_source: { dimensions: ['sessionSource'], label: 'UTM Source' },
    utm_medium: { dimensions: ['sessionMedium'], label: 'UTM Medium' },
    utm_campaign: { dimensions: ['sessionCampaignName'], label: 'UTM Campaign' },
    utm_term: { dimensions: ['sessionManualTerm'], label: 'UTM Term' },
    utm_content: { dimensions: ['sessionManualAdContent'], label: 'UTM Content' },
    device: { dimensions: ['deviceCategory'], label: 'Device' },
    browser: { dimensions: ['browser'], label: 'Browser' },
    browser_version: { dimensions: ['browser', 'browserVersion'], prefixIndex: 0, nameIndex: 1, label: 'Browser Version' },
    os: { dimensions: ['operatingSystem'], label: 'OS' },
    os_version: { dimensions: ['operatingSystem', 'operatingSystemVersion'], prefixIndex: 0, nameIndex: 1, label: 'OS Version' },
    brand: { dimensions: ['mobileDeviceBranding'], label: 'Brand' },
    model: { dimensions: ['mobileDeviceBranding', 'mobileDeviceModel'], prefixIndex: 0, nameIndex: 1, label: 'Model' },
    country: { dimensions: ['country'], label: 'Country' },
    region: { dimensions: ['country', 'region'], prefixIndex: 0, nameIndex: 1, label: 'Region' },
    city: { dimensions: ['country', 'city'], prefixIndex: 0, nameIndex: 1, label: 'City' },
};

function fmtDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function parseGaDate(value: string, dimension: string): Date {
    if (dimension === 'dateHour') {
        const year = Number(value.slice(0, 4));
        const month = Number(value.slice(4, 6)) - 1;
        const day = Number(value.slice(6, 8));
        const hour = Number(value.slice(8, 10));
        return new Date(Date.UTC(year, month, day, hour));
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(Date.UTC(year, month, day));
}

function startOfWeek(date: Date) {
    const next = new Date(date);
    const day = next.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setUTCDate(next.getUTCDate() + diff);
    next.setUTCHours(0, 0, 0, 0);
    return next;
}

function startOfMonth(date: Date) {
    const next = new Date(date);
    next.setUTCDate(1);
    next.setUTCHours(0, 0, 0, 0);
    return next;
}

function normalizeBucket(date: Date, interval: OverviewInterval) {
    if (interval === 'hour') {
        const next = new Date(date);
        next.setUTCMinutes(0, 0, 0);
        return next;
    }
    if (interval === 'week') {
        return startOfWeek(date);
    }
    if (interval === 'month') {
        return startOfMonth(date);
    }

    const next = new Date(date);
    next.setUTCHours(0, 0, 0, 0);
    return next;
}

function getPreviousCustomRange(startDate: string, endDate: string): OverviewRangeResult {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevStart = new Date(prevEnd.getTime() - diffMs);

    return {
        startDate: fmtDate(prevStart),
        endDate: fmtDate(prevEnd),
    };
}

function resolveDateToken(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const now = new Date();
    const next = new Date(now);

    if (value === 'today') {
        return fmtDate(next);
    }

    if (value === 'yesterday') {
        next.setUTCDate(next.getUTCDate() - 1);
        return fmtDate(next);
    }

    const daysAgoMatch = value.match(/^(\d+)daysAgo$/);
    if (daysAgoMatch) {
        next.setUTCDate(next.getUTCDate() - parseInt(daysAgoMatch[1], 10));
        return fmtDate(next);
    }

    return value;
}

function resolveOverviewRange(range: string, startDate?: string | null, endDate?: string | null) {
    if (range === 'custom' && startDate && endDate) {
        return {
            current: { startDate, endDate },
            previous: getPreviousCustomRange(startDate, endDate),
        };
    }

    return {
        current: {
            startDate: resolveDateToken(resolveRange(range).startDate),
            endDate: resolveDateToken(resolveRange(range).endDate),
        },
        previous: {
            startDate: resolveDateToken(resolvePrevRange(range).startDate),
            endDate: resolveDateToken(resolvePrevRange(range).endDate),
        },
    };
}

function getNoValueFilter(fieldName: string): GaFilterExpression {
    return {
        orGroup: {
            expressions: [
                {
                    filter: {
                        fieldName,
                        inListFilter: {
                            values: ['', '(not set)', '(not provided)'],
                            caseSensitive: false,
                        },
                    },
                },
            ],
        },
    };
}

function buildDimensionFilter(filters: ShareOverviewFilter[], eventNames: string[] = []): GaFilterExpression | undefined {
    const expressions = filters.flatMap((filter) => {
        const fieldName = FILTER_FIELD_MAP[filter.name];
        if (!fieldName) {
            return [];
        }

        const isNoValueOperator = filter.operator === 'isNull' || filter.operator === 'isNotNull';
        if (!isNoValueOperator && !filter.value.length) {
            return [];
        }

        if (filter.operator === 'is' || filter.operator === 'isNot') {
            const expression: GaFilterExpression = {
                filter: {
                    fieldName,
                    inListFilter: {
                        values: filter.value,
                        caseSensitive: false,
                    },
                },
            };
            return [filter.operator === 'isNot' ? { notExpression: expression } : expression];
        }

        if (filter.operator === 'contains' || filter.operator === 'notContains') {
            const baseExpressions = filter.value.map((value) => ({
                filter: {
                    fieldName,
                    stringFilter: {
                        value,
                        matchType: 'CONTAINS',
                        caseSensitive: false,
                    },
                },
            }));
            if (!baseExpressions.length) {
                return [];
            }
            const combined = baseExpressions.length === 1 ? baseExpressions[0] : {
                orGroup: {
                    expressions: baseExpressions,
                },
            };
            return [filter.operator === 'notContains' ? { notExpression: combined } : combined];
        }

        const nullFilter = getNoValueFilter(fieldName);
        return [filter.operator === 'isNotNull' ? { notExpression: nullFilter } : nullFilter];
    });

    if (eventNames.length) {
        expressions.push({
            filter: {
                fieldName: 'eventName',
                inListFilter: {
                    values: eventNames,
                    caseSensitive: false,
                },
            },
        });
    }

    if (!expressions.length) {
        return undefined;
    }

    if (expressions.length === 1) {
        return expressions[0];
    }

    return {
        andGroup: {
            expressions,
        },
    };
}

function aggregateMetricSeries(points: MetricPoint[], interval: OverviewInterval) {
    const groups = new Map<string, MetricPoint[]>();

    points.forEach((point) => {
        const bucket = normalizeBucket(new Date(point.date), interval).toISOString();
        const group = groups.get(bucket) || [];
        group.push(point);
        groups.set(bucket, group);
    });

    return Array.from(groups.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([bucket, items]) => {
            const totals = items.reduce((acc, item) => {
                acc.unique_visitors += item.unique_visitors;
                acc.total_sessions += item.total_sessions;
                acc.total_screen_views += item.total_screen_views;
                acc.new_users += item.new_users;
                acc.bounce_rate += item.bounce_rate;
                acc.avg_session_duration += item.avg_session_duration;
                acc.total_revenue += item.total_revenue;
                return acc;
            }, {
                unique_visitors: 0,
                total_sessions: 0,
                total_screen_views: 0,
                new_users: 0,
                bounce_rate: 0,
                avg_session_duration: 0,
                total_revenue: 0,
            });

            return {
                date: bucket,
                unique_visitors: totals.unique_visitors,
                total_sessions: totals.total_sessions,
                total_screen_views: totals.total_screen_views,
                new_users: totals.new_users,
                bounce_rate: items.length ? +(totals.bounce_rate / items.length).toFixed(2) : 0,
                avg_session_duration: items.length ? +(totals.avg_session_duration / items.length).toFixed(2) : 0,
                views_per_session: totals.total_sessions > 0
                    ? +(totals.total_screen_views / totals.total_sessions).toFixed(2)
                    : 0,
                total_revenue: +totals.total_revenue.toFixed(2),
            };
        });
}

function parseStatsSeriesRows(rows: GAReportRow[] | undefined, dimension: string): MetricPoint[] {
    if (!rows?.length) {
        return [];
    }

    return rows.map((row) => {
        const uniqueVisitors = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;
        const sessions = parseInt(row.metricValues?.[1]?.value || '0', 10) || 0;
        const screenViews = parseInt(row.metricValues?.[2]?.value || '0', 10) || 0;
        const newUsers = parseInt(row.metricValues?.[3]?.value || '0', 10) || 0;
        const bounceRate = (parseFloat(row.metricValues?.[4]?.value || '0') || 0) * 100;
        const avgDuration = parseFloat(row.metricValues?.[5]?.value || '0') || 0;

        return {
            date: parseGaDate(row.dimensionValues?.[0]?.value || '', dimension).toISOString(),
            unique_visitors: uniqueVisitors,
            total_sessions: sessions,
            total_screen_views: screenViews,
            new_users: newUsers,
            bounce_rate: +bounceRate.toFixed(2),
            avg_session_duration: +avgDuration.toFixed(2),
            views_per_session: sessions > 0 ? +(screenViews / sessions).toFixed(2) : 0,
            total_revenue: 0,
        };
    });
}

function parseStatsTotals(row?: GAReportRow) {
    const uniqueVisitors = parseInt(row?.metricValues?.[0]?.value || '0', 10) || 0;
    const sessions = parseInt(row?.metricValues?.[1]?.value || '0', 10) || 0;
    const screenViews = parseInt(row?.metricValues?.[2]?.value || '0', 10) || 0;
    const newUsers = parseInt(row?.metricValues?.[3]?.value || '0', 10) || 0;
    const bounceRate = (parseFloat(row?.metricValues?.[4]?.value || '0') || 0) * 100;
    const avgDuration = parseFloat(row?.metricValues?.[5]?.value || '0') || 0;

    return {
        unique_visitors: uniqueVisitors,
        total_sessions: sessions,
        total_screen_views: screenViews,
        new_users: newUsers,
        bounce_rate: +bounceRate.toFixed(2),
        avg_session_duration: +avgDuration.toFixed(2),
        views_per_session: sessions > 0 ? +(screenViews / sessions).toFixed(2) : 0,
        total_revenue: 0,
    };
}

function mergeRevenueIntoMetricPoints(points: MetricPoint[], rows: GAReportRow[] | undefined, dimension: string) {
    if (!rows?.length) {
        return points;
    }

    const revenueByDate = new Map(
        rows.map((row) => [
            parseGaDate(row.dimensionValues?.[0]?.value || '', dimension).toISOString(),
            parseFloat(row.metricValues?.[0]?.value || '0') || 0,
        ]),
    );

    return points.map((point) => ({
        ...point,
        total_revenue: +(revenueByDate.get(point.date) || 0).toFixed(2),
    }));
}

function parseRevenueTotal(row?: GAReportRow) {
    return +(parseFloat(row?.metricValues?.[0]?.value || '0') || 0).toFixed(2);
}

function alignPreviousSeries(current: MetricPoint[], previous: MetricPoint[]) {
    return current.map((point, index) => {
        const prev = previous[index];
        return {
            ...point,
            prev_unique_visitors: prev?.unique_visitors ?? 0,
            prev_total_sessions: prev?.total_sessions ?? 0,
            prev_total_screen_views: prev?.total_screen_views ?? 0,
            prev_new_users: prev?.new_users ?? 0,
            prev_bounce_rate: prev?.bounce_rate ?? 0,
            prev_avg_session_duration: prev?.avg_session_duration ?? 0,
            prev_views_per_session: prev?.views_per_session ?? 0,
            prev_total_revenue: prev?.total_revenue ?? 0,
        };
    });
}

function cleanName(value: string | null | undefined) {
    return value && value.trim() ? value : '(not set)';
}

function getTopGenericDefinition(column: string): TopGenericDefinition | null {
    return TOP_GENERIC_DEFS[column] || null;
}

function parseDimensionItems(rows: GAReportRow[] | undefined, options?: {
    prefixIndex?: number;
    nameIndex?: number;
    metricIndex?: number;
    pageviewsIndex?: number;
    revenueIndex?: number;
}) {
    if (!rows?.length) {
        return [];
    }

    const prefixIndex = options?.prefixIndex;
    const nameIndex = options?.nameIndex ?? 0;
    const metricIndex = options?.metricIndex ?? 0;
    const pageviewsIndex = options?.pageviewsIndex ?? 1;
    const revenueIndex = options?.revenueIndex;

    return rows.map((row) => ({
        prefix: prefixIndex === undefined ? undefined : cleanName(row.dimensionValues?.[prefixIndex]?.value),
        name: cleanName(row.dimensionValues?.[nameIndex]?.value),
        sessions: parseInt(row.metricValues?.[metricIndex]?.value || '0', 10) || 0,
        pageviews: parseInt(row.metricValues?.[pageviewsIndex]?.value || '0', 10) || 0,
        revenue: revenueIndex === undefined ? undefined : +(parseFloat(row.metricValues?.[revenueIndex]?.value || '0') || 0).toFixed(2),
    }));
}

export async function fetchShareOverviewStats(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    interval: OverviewInterval;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
    events?: string[];
}) {
    const { current, previous } = resolveOverviewRange(input.range, input.startDate, input.endDate);
    const filterExpression = buildDimensionFilter(input.filters, input.events);
    const dimension = input.interval === 'hour' ? 'dateHour' : 'date';
    const metrics = ['activeUsers', 'sessions', 'screenPageViews', 'newUsers', 'bounceRate', 'averageSessionDuration'];

    const [currentTotals, previousTotals, currentSeries, previousSeries, currentRevenueTotals, previousRevenueTotals, currentRevenueSeries, previousRevenueSeries] = await Promise.all([
        runFlexibleGAReport(input.accessToken, input.propertyId, [], metrics, [current], {
            dimensionFilter: filterExpression,
            limit: 1,
        }),
        runFlexibleGAReport(input.accessToken, input.propertyId, [], metrics, [previous], {
            dimensionFilter: filterExpression,
            limit: 1,
        }),
        runFlexibleGAReport(input.accessToken, input.propertyId, [dimension], metrics, [current], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: dimension, type: 'dimension', desc: false }],
            limit: dimension === 'dateHour' ? 500 : 400,
        }),
        runFlexibleGAReport(input.accessToken, input.propertyId, [dimension], metrics, [previous], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: dimension, type: 'dimension', desc: false }],
            limit: dimension === 'dateHour' ? 500 : 400,
        }),
        runFlexibleGAReport(input.accessToken, input.propertyId, [], ['purchaseRevenue'], [current], {
            dimensionFilter: filterExpression,
            limit: 1,
        }).catch(() => ({ rows: [] as GAReportRow[] })),
        runFlexibleGAReport(input.accessToken, input.propertyId, [], ['purchaseRevenue'], [previous], {
            dimensionFilter: filterExpression,
            limit: 1,
        }).catch(() => ({ rows: [] as GAReportRow[] })),
        runFlexibleGAReport(input.accessToken, input.propertyId, [dimension], ['purchaseRevenue'], [current], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: dimension, type: 'dimension', desc: false }],
            limit: dimension === 'dateHour' ? 500 : 400,
        }).catch(() => ({ rows: [] as GAReportRow[] })),
        runFlexibleGAReport(input.accessToken, input.propertyId, [dimension], ['purchaseRevenue'], [previous], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: dimension, type: 'dimension', desc: false }],
            limit: dimension === 'dateHour' ? 500 : 400,
        }).catch(() => ({ rows: [] as GAReportRow[] })),
    ]);

    const currentPoints = aggregateMetricSeries(
        mergeRevenueIntoMetricPoints(parseStatsSeriesRows(currentSeries.rows, dimension), currentRevenueSeries.rows, dimension),
        input.interval,
    );
    const previousPoints = aggregateMetricSeries(
        mergeRevenueIntoMetricPoints(parseStatsSeriesRows(previousSeries.rows, dimension), previousRevenueSeries.rows, dimension),
        input.interval,
    );

    const currentMetrics = parseStatsTotals(currentTotals.rows?.[0]);
    const previousMetrics = parseStatsTotals(previousTotals.rows?.[0]);
    currentMetrics.total_revenue = parseRevenueTotal(currentRevenueTotals.rows?.[0]);
    previousMetrics.total_revenue = parseRevenueTotal(previousRevenueTotals.rows?.[0]);

    return {
        metrics: {
            ...currentMetrics,
            prev_unique_visitors: previousMetrics.unique_visitors,
            prev_total_sessions: previousMetrics.total_sessions,
            prev_total_screen_views: previousMetrics.total_screen_views,
            prev_new_users: previousMetrics.new_users,
            prev_bounce_rate: previousMetrics.bounce_rate,
            prev_avg_session_duration: previousMetrics.avg_session_duration,
            prev_views_per_session: previousMetrics.views_per_session,
            prev_total_revenue: previousMetrics.total_revenue,
        },
        series: alignPreviousSeries(currentPoints, previousPoints),
    };
}

export async function fetchShareOverviewTopGeneric(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    column: string;
    filters: ShareOverviewFilter[];
    events?: string[];
    limit?: number;
}) {
    const definition = getTopGenericDefinition(input.column);
    if (!definition) {
        return { supported: false, label: input.column, items: [] };
    }

    const { current } = resolveOverviewRange(input.range, input.startDate, input.endDate);
    const primaryMetric = hasPageScopedFilter(input.filters) ? 'screenPageViews' : 'sessions';

    try {
        const metrics = primaryMetric === 'screenPageViews'
            ? ['screenPageViews', 'sessions', 'purchaseRevenue']
            : ['sessions', 'screenPageViews', 'purchaseRevenue'];
        const report = await runFlexibleGAReport(
            input.accessToken,
            input.propertyId,
            definition.dimensions,
            metrics,
            [current],
            {
                dimensionFilter: buildDimensionFilter(input.filters, input.events),
                orderBys: [{ field: primaryMetric, type: 'metric', desc: true }],
                limit: input.limit ?? 50,
            },
        );

        return {
            supported: true,
            label: definition.label,
            primaryMetric: primaryMetric === 'screenPageViews' ? 'pageviews' : 'sessions',
            items: parseDimensionItems(report.rows, {
                prefixIndex: definition.prefixIndex,
                nameIndex: definition.nameIndex,
                metricIndex: 0,
                pageviewsIndex: 1,
                revenueIndex: 2,
            }),
        };
    } catch (error) {
        console.error(`Share overview top-generic (${input.column}) error:`, error);
        return {
            supported: false,
            label: definition.label,
            primaryMetric: primaryMetric === 'screenPageViews' ? 'pageviews' : 'sessions',
            items: [],
        };
    }
}

function buildTopGenericItemFilter(column: string, item: { name: string; prefix?: string }): GaFilterExpression | undefined {
    const definition = getTopGenericDefinition(column);
    if (!definition) {
        return undefined;
    }

    const expressions = definition.dimensions.map((fieldName, index) => {
        const rawValue = index === definition.prefixIndex
            ? item.prefix
            : item.name;

        return {
            filter: {
                fieldName,
                stringFilter: {
                    value: cleanName(rawValue),
                    matchType: 'EXACT',
                    caseSensitive: false,
                },
            },
        };
    });

    if (!expressions.length) {
        return undefined;
    }

    if (expressions.length === 1) {
        return expressions[0];
    }

    return {
        andGroup: {
            expressions,
        },
    };
}

function combineFilters(filters: Array<GaFilterExpression | undefined>): GaFilterExpression | undefined {
    const expressions = filters.filter((filter): filter is GaFilterExpression => Boolean(filter));

    if (!expressions.length) {
        return undefined;
    }

    if (expressions.length === 1) {
        return expressions[0];
    }

    return {
        andGroup: {
            expressions,
        },
    };
}

function aggregateGenericSeriesRows(
    rows: GAReportRow[] | undefined,
    interval: OverviewInterval,
    metricOrder: {
        sessionsIndex: number;
        pageviewsIndex: number;
        revenueIndex?: number;
    },
) {
    if (!rows?.length) {
        return [];
    }

    const dimension = interval === 'hour' ? 'dateHour' : 'date';
    const groups = new Map<string, Array<{ sessions: number; pageviews: number; revenue: number }>>();

    rows.forEach((row) => {
        const bucket = normalizeBucket(parseGaDate(row.dimensionValues?.[0]?.value || '', dimension), interval).toISOString();
        const group = groups.get(bucket) || [];

        group.push({
            sessions: parseInt(row.metricValues?.[metricOrder.sessionsIndex]?.value || '0', 10) || 0,
            pageviews: parseInt(row.metricValues?.[metricOrder.pageviewsIndex]?.value || '0', 10) || 0,
            revenue: metricOrder.revenueIndex === undefined
                ? 0
                : +(parseFloat(row.metricValues?.[metricOrder.revenueIndex]?.value || '0') || 0),
        });

        groups.set(bucket, group);
    });

    return Array.from(groups.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, items]) => ({
            date,
            sessions: items.reduce((sum, item) => sum + item.sessions, 0),
            pageviews: items.reduce((sum, item) => sum + item.pageviews, 0),
            revenue: +items.reduce((sum, item) => sum + item.revenue, 0).toFixed(2),
        }));
}

export async function fetchShareOverviewTopGenericSeries(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    interval: OverviewInterval;
    column: string;
    filters: ShareOverviewFilter[];
    events?: string[];
}) {
    const definition = getTopGenericDefinition(input.column);
    if (!definition) {
        return {
            supported: false,
            label: input.column,
            primaryMetric: 'sessions',
            items: [],
        };
    }

    const topItems = await cachedFetch(
        buildOverviewDataCacheKey('top-generic-base', [
            input.propertyId,
            input.column,
            input.range,
            input.startDate || '',
            input.endDate || '',
            input.filters,
            input.events,
        ]),
        45_000,
        () => fetchShareOverviewTopGeneric({
            accessToken: input.accessToken,
            propertyId: input.propertyId,
            range: input.range,
            startDate: input.startDate,
            endDate: input.endDate,
            column: input.column,
            filters: input.filters,
            events: input.events,
        }),
    );

    if (!topItems.supported || !topItems.items.length) {
        return {
            supported: topItems.supported,
            label: definition.label,
            primaryMetric: topItems.primaryMetric,
            items: [],
        };
    }

    const { current } = resolveOverviewRange(input.range, input.startDate, input.endDate);
    const dimension = input.interval === 'hour' ? 'dateHour' : 'date';
    const filterExpression = buildDimensionFilter(input.filters, input.events);
    const primaryMetric = topItems.primaryMetric === 'pageviews' ? 'screenPageViews' : 'sessions';
    const metrics = primaryMetric === 'screenPageViews'
        ? ['screenPageViews', 'sessions', 'purchaseRevenue']
        : ['sessions', 'screenPageViews', 'purchaseRevenue'];
    const metricOrder = primaryMetric === 'screenPageViews'
        ? { pageviewsIndex: 0, sessionsIndex: 1, revenueIndex: 2 }
        : { sessionsIndex: 0, pageviewsIndex: 1, revenueIndex: 2 };

    const items = await Promise.all(
        topItems.items.slice(0, 8).map(async (item) => {
            const itemCacheKey = buildOverviewDataCacheKey('top-generic-series-item', [
                input.propertyId,
                input.column,
                input.range,
                input.interval,
                input.startDate || '',
                input.endDate || '',
                input.filters,
                input.events,
                item.prefix || '',
                item.name,
            ]);

            return cachedFetch(itemCacheKey, 90_000, async () => {
                try {
                    const itemFilter = buildTopGenericItemFilter(input.column, item);
                    const report = await runFlexibleGAReport(
                        input.accessToken,
                        input.propertyId,
                        [dimension],
                        metrics,
                        [current],
                        {
                            dimensionFilter: combineFilters([filterExpression, itemFilter]),
                            orderBys: [{ field: dimension, type: 'dimension', desc: false }],
                            limit: dimension === 'dateHour' ? 500 : 400,
                        },
                    );

                    return {
                        name: item.name,
                        prefix: item.prefix,
                        sessions: item.sessions,
                        pageviews: item.pageviews,
                        revenue: item.revenue,
                        data: aggregateGenericSeriesRows(report.rows, input.interval, metricOrder),
                    };
                } catch (error) {
                    console.error(`Share overview top-generic-series (${input.column}) item error:`, error);
                    return {
                        name: item.name,
                        prefix: item.prefix,
                        sessions: item.sessions,
                        pageviews: item.pageviews,
                        revenue: item.revenue,
                        data: [],
                    };
                }
            });
        }),
    );

    return {
        supported: true,
        label: definition.label,
        primaryMetric: topItems.primaryMetric,
        items: items.filter((item) => item.data.length > 0),
    };
}

export async function fetchShareOverviewTopPages(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    mode: string;
    filters: ShareOverviewFilter[];
    events?: string[];
    limit?: number;
}) {
    const { current } = resolveOverviewRange(input.range, input.startDate, input.endDate);

    if (input.mode === 'exit') {
        const journey: JourneyData = await fetchJourneyData(input.accessToken, input.propertyId, input.range);
        const pathFilter = input.filters.find((filter) => filter.name === 'path' || filter.name === 'entry_path' || filter.name === 'exit_path');
        const filtered: JourneyExitPage[] = pathFilter
            ? journey.exitPages.filter((item: JourneyExitPage) => pathFilter.value.includes(item.page))
            : journey.exitPages;

        return {
            supported: true,
            items: filtered.map((item) => ({
                origin: '',
                path: item.page,
                title: item.page,
                sessions: item.exits,
                pageviews: item.exits,
                revenue: undefined,
                bounceRate: 0,
                avgSessionDuration: item.avgSessionDuration ?? 0,
            })),
        };
    }

    const dimension = input.mode === 'entry'
        ? ['hostName', 'landingPagePlusQueryString']
        : ['hostName', 'unifiedScreenName', 'pageTitle'];
    const metrics = input.mode === 'entry'
        ? ['sessions', 'screenPageViews', 'bounceRate', 'purchaseRevenue']
        : ['sessions', 'screenPageViews', 'purchaseRevenue'];

    try {
        const report = await runFlexibleGAReport(input.accessToken, input.propertyId, dimension, metrics, [current], {
            dimensionFilter: buildDimensionFilter(input.filters, input.events),
            orderBys: [{ field: 'sessions', type: 'metric', desc: true }],
            limit: input.limit ?? 50,
        });

        return {
            supported: true,
            items: (report.rows || []).map((row: GAReportRow) => ({
                origin: cleanName(row.dimensionValues?.[0]?.value),
                path: cleanName(row.dimensionValues?.[1]?.value),
                title: input.mode === 'entry'
                    ? cleanName(row.dimensionValues?.[1]?.value)
                    : cleanName(row.dimensionValues?.[2]?.value || row.dimensionValues?.[1]?.value),
                sessions: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
                pageviews: parseInt(row.metricValues?.[1]?.value || '0', 10) || 0,
                revenue: +(parseFloat(row.metricValues?.[input.mode === 'entry' ? 3 : 2]?.value || '0') || 0).toFixed(2),
                bounceRate: input.mode === 'entry'
                    ? +(((parseFloat(row.metricValues?.[2]?.value || '0') || 0) * 100).toFixed(2))
                    : 0,
                avgSessionDuration: 0,
            })),
        };
    } catch (error) {
        console.error(`Share overview top-pages (${input.mode}) error:`, error);
        return { supported: false, items: [] };
    }
}

export async function fetchShareOverviewTopEvents(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
    events?: string[];
    limit?: number;
}) {
    const { current } = resolveOverviewRange(input.range, input.startDate, input.endDate);
    const filterExpression = buildDimensionFilter(input.filters, input.events);

    const [eventsReport, conversionsReport] = await Promise.all([
        runFlexibleGAReport(input.accessToken, input.propertyId, ['eventName'], ['eventCount'], [current], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
            limit: input.limit ?? 60,
        }).catch(() => null),
        runFlexibleGAReport(input.accessToken, input.propertyId, ['eventName'], ['keyEvents'], [current], {
            dimensionFilter: filterExpression,
            orderBys: [{ field: 'keyEvents', type: 'metric', desc: true }],
            limit: input.limit ?? 30,
        }).catch(() => null),
    ]);

    const allEvents: OverviewEventItem[] = (eventsReport?.rows || []).map((row: GAReportRow) => ({
        id: cleanName(row.dimensionValues?.[0]?.value),
        name: cleanName(row.dimensionValues?.[0]?.value),
        count: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
    }));

    const events = allEvents.filter((item) => !SYSTEM_EVENT_NAMES.has(item.name) && item.name !== 'link_out');
    const linkOut = allEvents.filter((item) => item.name === 'link_out');
    const conversions: OverviewEventItem[] = (conversionsReport?.rows || [])
        .map((row: GAReportRow) => ({
            id: cleanName(row.dimensionValues?.[0]?.value),
            name: cleanName(row.dimensionValues?.[0]?.value),
            count: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        }))
        .filter((item: OverviewEventItem) => item.count > 0);

    return {
        events,
        conversions,
        linkOut,
        supported: {
            conversions: !!conversionsReport,
            linkOut: linkOut.length > 0,
        },
    };
}

export async function fetchShareOverviewTopConversions(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
    events?: string[];
    limit?: number;
}) {
    const data = await cachedFetch(
        buildOverviewDataCacheKey('top-events-base', [
            input.propertyId,
            input.range,
            input.startDate || '',
            input.endDate || '',
            input.filters,
            input.events,
            input.limit || '',
        ]),
        45_000,
        () => fetchShareOverviewTopEvents(input),
    );
    return {
        supported: data.supported.conversions,
        items: data.conversions,
    };
}

export async function fetchShareOverviewTopLinkOut(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
    events?: string[];
    limit?: number;
}) {
    const data = await cachedFetch(
        buildOverviewDataCacheKey('top-events-base', [
            input.propertyId,
            input.range,
            input.startDate || '',
            input.endDate || '',
            input.filters,
            input.events,
            input.limit || '',
        ]),
        45_000,
        () => fetchShareOverviewTopEvents(input),
    );
    return {
        supported: data.supported.linkOut,
        items: data.linkOut,
    };
}

export async function fetchShareOverviewLive(input: {
    accessToken: string;
    propertyId: string;
    filters: ShareOverviewFilter[];
    events?: string[];
}) {
    const filterExpression = buildDimensionFilter(input.filters, input.events);

    const [totalData, countryData, cityData, pageData, histogram, referrerData, histogramReferrers] = await Promise.all([
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, [], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 1,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['country'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 20,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['city', 'country'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 20,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['unifiedScreenName'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 15,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['minutesAgo'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 30,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['sessionSource'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 8,
        }).catch(() => null),
        runFlexibleRealtimeReport(input.accessToken, input.propertyId, ['minutesAgo', 'sessionSource'], ['activeUsers'], {
            dimensionFilter: filterExpression,
            limit: 250,
        }).catch(() => null),
    ]);

    const byMinute = new Map<number, number>();
    (histogram?.rows || []).forEach((row: GAReportRow) => {
        const minute = parseInt(row.dimensionValues?.[0]?.value || '0', 10);
        const users = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;
        byMinute.set(minute, users);
    });

    const minuteReferrers = new Map<number, Array<{ referrer: string; count: number }>>();
    (histogramReferrers?.rows || []).forEach((row: GAReportRow) => {
        const minute = parseInt(row.dimensionValues?.[0]?.value || '0', 10);
        const referrer = cleanName(row.dimensionValues?.[1]?.value);
        const count = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;
        if (!count) {
            return;
        }

        const entries = minuteReferrers.get(minute) || [];
        entries.push({ referrer, count });
        minuteReferrers.set(minute, entries);
    });

    const minuteCounts = Array.from({ length: 30 }, (_, index) => {
        const minute = 29 - index;
        return {
            minute: `${minute}m`,
            sessionCount: byMinute.get(minute) || 0,
            visitorCount: byMinute.get(minute) || 0,
            timestamp: minute,
            time: `${minute}m ago`,
            referrers: (minuteReferrers.get(minute) || []).sort((left, right) => right.count - left.count).slice(0, 5),
        };
    });

    return {
        activeUsers: parseInt(totalData?.rows?.[0]?.metricValues?.[0]?.value || '0', 10) || 0,
        minuteCounts,
        referrers: (referrerData?.rows || []).map((row: GAReportRow) => ({
            referrer: cleanName(row.dimensionValues?.[0]?.value),
            count: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        })),
        byCountry: (countryData?.rows || []).map((row: GAReportRow) => ({
            country: cleanName(row.dimensionValues?.[0]?.value),
            users: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        })),
        byCity: (cityData?.rows || []).map((row: GAReportRow) => ({
            city: cleanName(row.dimensionValues?.[0]?.value),
            country: cleanName(row.dimensionValues?.[1]?.value),
            users: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        })),
        byPage: (pageData?.rows || []).map((row: GAReportRow) => ({
            page: cleanName(row.dimensionValues?.[0]?.value),
            users: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        })),
    };
}

export async function fetchShareOverviewMap(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    startDate?: string | null;
    endDate?: string | null;
    filters: ShareOverviewFilter[];
    events?: string[];
}) {
    const { current } = resolveOverviewRange(input.range, input.startDate, input.endDate);

    try {
        const report = await runFlexibleGAReport(
            input.accessToken,
            input.propertyId,
            ['country'],
            ['sessions'],
            [current],
            {
                dimensionFilter: buildDimensionFilter(input.filters, input.events),
                orderBys: [{ field: 'sessions', type: 'metric', desc: true }],
                limit: 50,
            },
        );

        return (report.rows || []).map((row: GAReportRow) => ({
            country: cleanName(row.dimensionValues?.[0]?.value),
            count: parseInt(row.metricValues?.[0]?.value || '0', 10) || 0,
        }));
    } catch (error) {
        console.error('Share overview map error:', error);
        return [];
    }
}

export async function fetchShareOverviewJourney(input: {
    accessToken: string;
    propertyId: string;
    range: string;
    steps?: number;
    filters: ShareOverviewFilter[];
    events?: string[];
}) {
    const journey: JourneyData = await fetchJourneyData(input.accessToken, input.propertyId, input.range);
    const maxSteps = Math.max(2, Math.min(input.steps || 5, 5));
    const pathFilter = input.filters.find((filter) => filter.name === 'path');
    const entryFilter = input.filters.find((filter) => filter.name === 'entry_path');
    const exitFilter = input.filters.find((filter) => filter.name === 'exit_path');

    const filteredJourneys = journey.journeys.filter((item: JourneyItem) => {
        const matchesPath = pathFilter ? item.steps.some((step: string) => pathFilter.value.includes(step)) : true;
        const matchesEntry = entryFilter ? entryFilter.value.includes(item.steps[0]) : true;
        const exitStep = item.steps[item.steps.length - 2] || item.steps[item.steps.length - 1];
        const matchesExit = exitFilter ? exitFilter.value.includes(exitStep) : true;
        return matchesPath && matchesEntry && matchesExit;
    });

    const totalSessions = filteredJourneys.reduce((sum: number, item: JourneyItem) => sum + item.users, 0) || 1;
    const nodes = new Map<string, { id: string; label: string; nodeColor: string; value: number; step: number }>();
    const links = new Map<string, { source: string; target: string; value: number }>();
    const rootColors = new Map<string, string>();

    filteredJourneys.forEach((item: JourneyItem, journeyIndex: number) => {
        const limitedSteps = item.steps.slice(0, maxSteps);
        if (!limitedSteps.length) {
            return;
        }

        const root = limitedSteps[0];
        if (!rootColors.has(root)) {
            rootColors.set(root, JOURNEY_COLORS[journeyIndex % JOURNEY_COLORS.length]);
        }
        const color = rootColors.get(root) || JOURNEY_COLORS[0];

        limitedSteps.forEach((step: string, index: number) => {
            const id = `${step}::step${index + 1}`;
            const existingNode = nodes.get(id);
            if (existingNode) {
                existingNode.value += item.users;
            } else {
                nodes.set(id, {
                    id,
                    label: step,
                    nodeColor: color,
                    value: item.users,
                    step: index + 1,
                });
            }

            if (index < limitedSteps.length - 1) {
                const target = `${limitedSteps[index + 1]}::step${index + 2}`;
                const linkKey = `${id}->${target}`;
                const existingLink = links.get(linkKey);
                if (existingLink) {
                    existingLink.value += item.users;
                } else {
                    links.set(linkKey, { source: id, target, value: item.users });
                }
            }
        });
    });

    return {
        nodes: Array.from(nodes.values())
            .map((node) => ({
                ...node,
                percentage: +((node.value / totalSessions) * 100).toFixed(1),
            }))
            .sort((left, right) => left.step - right.step || right.value - left.value),
        links: Array.from(links.values()),
        overview: journey.overview,
        landingPages: journey.landingPages,
        exitPages: journey.exitPages,
    };
}
