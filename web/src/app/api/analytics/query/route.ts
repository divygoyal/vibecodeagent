/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';

import { authOptions } from '@/lib/auth';
import { ALLOWED_QUERY_DIMENSIONS, ALLOWED_QUERY_METRICS, DEFAULT_VISIBLE_METRICS } from '@/lib/analyticsQueryMeta';
import {
    fetchGoogleTokensFromDb,
    getValidAccessToken,
    resolvePrevRange,
    resolveRange,
} from '@/lib/googleApi';
import type {
    AnalyticsCompareMode,
    AnalyticsQueryComparison,
    AnalyticsQueryDescriptor,
    AnalyticsQueryFilter,
    AnalyticsQueryMetric,
    AnalyticsQueryResponse,
    AnalyticsQueryTableRow,
    AnalyticsQueryTrendPoint,
    AnalyticsTimeBucket,
} from '@/types/analyticsWorkspace';

export const dynamic = 'force-dynamic';

const GA_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta';

const BASE_QUERY_METRICS = new Set([
    'activeUsers',
    'totalUsers',
    'sessions',
    'screenPageViews',
    'eventCount',
    'engagementRate',
    'bounceRate',
    'averageSessionDuration',
    'newUsers',
]);

function cleanPropertyId(id: string): string {
    if (!id.startsWith('properties/') && /^\d+$/.test(id)) {
        return `properties/${id}`;
    }
    return id;
}

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function clampDate(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
}

function resolveAbsoluteRange(range: string) {
    const now = clampDate(new Date());
    switch (range) {
        case 'today':
            return { start: now, end: now };
        case 'yesterday': {
            const day = new Date(now);
            day.setDate(day.getDate() - 1);
            return { start: day, end: day };
        }
        case '7d':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: now };
        case '14d':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13), end: now };
        case '30d':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), end: now };
        case '60d':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59), end: now };
        case '90d':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89), end: now };
        case '6m':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 179), end: now };
        case '12m':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 364), end: now };
        case 'this_week': {
            const start = new Date(now);
            start.setDate(start.getDate() - start.getDay());
            return { start, end: now };
        }
        case 'last_week': {
            const end = new Date(now);
            end.setDate(end.getDate() - end.getDay() - 1);
            const start = new Date(end);
            start.setDate(start.getDate() - 6);
            return { start, end };
        }
        case 'this_month':
            return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
        case 'last_month':
            return {
                start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                end: new Date(now.getFullYear(), now.getMonth(), 0),
            };
        case 'this_year':
            return { start: new Date(now.getFullYear(), 0, 1), end: now };
        case 'last_year':
            return {
                start: new Date(now.getFullYear() - 1, 0, 1),
                end: new Date(now.getFullYear() - 1, 11, 31),
            };
        case 'all':
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 364), end: now };
        default:
            return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27), end: now };
    }
}

function resolveComparisonDateRange(range: string, compareMode: AnalyticsCompareMode) {
    if (compareMode === 'previousPeriod') {
        return resolvePrevRange(range);
    }

    if (compareMode === 'previousYear') {
        const { start, end } = resolveAbsoluteRange(range);
        const prevStart = new Date(start);
        const prevEnd = new Date(end);
        prevStart.setFullYear(prevStart.getFullYear() - 1);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1);
        return { startDate: formatDate(prevStart), endDate: formatDate(prevEnd) };
    }

    return null;
}

function parseMetricValue(value: string) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function getMetricDependencies(metric: AnalyticsQueryMetric): string[] {
    switch (metric) {
        case 'returningUsers':
            return ['totalUsers', 'newUsers'];
        default:
            return [metric];
    }
}

function metricFromMap(metric: AnalyticsQueryMetric, metricMap: Record<string, number>) {
    switch (metric) {
        case 'returningUsers':
            return Math.max(0, (metricMap.totalUsers || 0) - (metricMap.newUsers || 0));
        case 'bounceRate':
        case 'engagementRate':
            return Number(((metricMap[metric] || 0) * 100).toFixed(1));
        default:
            return metricMap[metric] || 0;
    }
}

function collectMetricMap(metricNames: string[], metricValues: any[]) {
    return metricNames.reduce<Record<string, number>>((acc, metricName, index) => {
        acc[metricName] = parseMetricValue(metricValues?.[index]?.value ?? '0');
        return acc;
    }, {});
}

function positiveFilterExpression(filter: AnalyticsQueryFilter | AnalyticsQueryComparison) {
    const operator = filter.operator;
    const values = Array.isArray(filter.value) ? filter.value.filter(Boolean) : [String(filter.value)];

    if (operator === 'inList' || operator === 'notInList') {
        if (!values.length) return null;
        return {
            filter: {
                fieldName: filter.fieldName,
                inListFilter: { values },
            },
        };
    }

    return {
        filter: {
            fieldName: filter.fieldName,
            stringFilter: {
                matchType: operator === 'contains' || operator === 'notContains' ? 'CONTAINS' : 'EXACT',
                value: values[0] ?? '',
                caseSensitive: false,
            },
        },
    };
}

function createFilterExpression(filter: AnalyticsQueryFilter | AnalyticsQueryComparison) {
    const base = positiveFilterExpression(filter);
    if (!base) return null;

    if (filter.operator === 'notEquals' || filter.operator === 'notContains' || filter.operator === 'notInList') {
        return { notExpression: { expression: base } };
    }

    return base;
}

function joinFilters(filters: Array<AnalyticsQueryFilter | AnalyticsQueryComparison>, extra?: ReturnType<typeof createFilterExpression>) {
    const expressions = filters
        .map(createFilterExpression)
        .filter(Boolean) as Array<Record<string, unknown>>;

    if (extra) expressions.push(extra);
    if (!expressions.length) return undefined;
    if (expressions.length === 1) return expressions[0];
    return { andGroup: { expressions } };
}

async function gaRunReport(token: string, propertyId: string, body: Record<string, unknown>) {
    const res = await fetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google API error ${res.status}: ${text}`);
    }

    return res.json();
}

function makeBucketLabel(dateRaw: string, bucket: AnalyticsTimeBucket) {
    const iso = dateRaw.length === 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dateRaw;

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return dateRaw;

    if (bucket === 'month') {
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }

    if (bucket === 'week') {
        const start = new Date(date);
        start.setDate(start.getDate() - start.getDay());
        return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function makeBucketKey(dateRaw: string, bucket: AnalyticsTimeBucket) {
    const iso = dateRaw.length === 8
        ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
        : dateRaw;

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return dateRaw;

    if (bucket === 'month') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (bucket === 'week') {
        const start = new Date(date);
        start.setDate(start.getDate() - start.getDay());
        return start.toISOString().slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
}

function aggregateTrendRows(rows: any[], bucket: AnalyticsTimeBucket, metricNames: string[], seriesIndex?: number) {
    const map = new Map<string, {
        key: string;
        label: string;
        metricTotals: Record<string, number>;
        seriesMetrics?: Record<string, Record<string, number>>;
    }>();

    for (const row of rows || []) {
        const dateRaw = row.dimensionValues?.[0]?.value;
        if (!dateRaw) continue;

        const key = makeBucketKey(dateRaw, bucket);
        const label = makeBucketLabel(dateRaw, bucket);
        const metricMap = collectMetricMap(metricNames, row.metricValues);
        const seriesValue = seriesIndex != null ? row.dimensionValues?.[seriesIndex]?.value : undefined;
        const existing = map.get(key) || {
            key,
            label,
            metricTotals: {},
            seriesMetrics: seriesIndex != null ? {} : undefined,
        };

        metricNames.forEach((metricName) => {
            existing.metricTotals[metricName] = (existing.metricTotals[metricName] || 0) + (metricMap[metricName] || 0);
        });

        if (seriesValue) {
            existing.seriesMetrics = existing.seriesMetrics || {};
            existing.seriesMetrics[seriesValue] = existing.seriesMetrics[seriesValue] || {};
            metricNames.forEach((metricName) => {
                existing.seriesMetrics![seriesValue][metricName] = (existing.seriesMetrics![seriesValue][metricName] || 0) + (metricMap[metricName] || 0);
            });
        }

        map.set(key, existing);
    }

    return Array.from(map.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function makeComparisonKey(comparison: AnalyticsQueryComparison, index: number) {
    const rawValue = Array.isArray(comparison.value)
        ? comparison.value.join(', ')
        : comparison.value;
    return comparison.label || `${comparison.fieldName}:${rawValue || `comparison-${index + 1}`}`;
}

function buildAnnotationHints(points: AnalyticsQueryTrendPoint[]) {
    if (points.length < 4) return [];
    const hints = points
        .map((point, index) => {
            const sample = points.slice(Math.max(0, index - 2), index + 1);
            const rollingAverage = sample.reduce((sum, item) => sum + (item.total || 0), 0) / Math.max(sample.length, 1);
            if (!rollingAverage) return null;
            const delta = Math.abs((point.total - rollingAverage) / rollingAverage);
            if (delta < 0.18) return null;
            return {
                key: point.key || point.label,
                label: point.total >= rollingAverage ? 'Spike' : 'Dip',
                total: point.total,
                severity: Number(delta.toFixed(3)),
            };
        })
        .filter(Boolean)
        .sort((left: any, right: any) => right.severity - left.severity)
        .slice(0, 3);

    return hints as AnalyticsQueryResponse['annotationHints'];
}

function uniqueMetrics(items: Array<AnalyticsQueryMetric | null | undefined>) {
    const next: AnalyticsQueryMetric[] = [];
    items.forEach((item) => {
        if (item && !next.includes(item)) next.push(item);
    });
    return next;
}

function sanitizeDescriptor(input: AnalyticsQueryDescriptor): AnalyticsQueryDescriptor {
    const primaryDimension = ALLOWED_QUERY_DIMENSIONS.has(input.primaryDimension) ? input.primaryDimension : 'sessionDefaultChannelGroup';
    const secondaryDimension = input.secondaryDimension && ALLOWED_QUERY_DIMENSIONS.has(input.secondaryDimension)
        ? input.secondaryDimension
        : undefined;
    const visibleMetrics = uniqueMetrics((input.visibleMetrics || []).filter((metric) => ALLOWED_QUERY_METRICS.has(metric)));
    const metrics = uniqueMetrics((input.metrics || []).filter((metric) => ALLOWED_QUERY_METRICS.has(metric)));
    const selectedMetric = ALLOWED_QUERY_METRICS.has(input.selectedMetric || 'activeUsers')
        ? (input.selectedMetric as AnalyticsQueryMetric)
        : visibleMetrics[0] || metrics[0] || DEFAULT_VISIBLE_METRICS[0];
    const secondaryMetric = input.secondaryMetric && ALLOWED_QUERY_METRICS.has(input.secondaryMetric)
        ? input.secondaryMetric
        : null;
    const compareMode: AnalyticsCompareMode =
        input.compareMode && ['off', 'previousPeriod', 'previousYear', 'segments'].includes(input.compareMode)
            ? input.compareMode
            : input.compare
                ? 'previousPeriod'
                : 'off';
    const comparisons = Array.isArray(input.comparisons)
        ? input.comparisons
            .filter((comparison) => ALLOWED_QUERY_DIMENSIONS.has(comparison.fieldName))
            .slice(0, 2)
        : [];

    return {
        propertyId: input.propertyId,
        primaryDimension,
        secondaryDimension: secondaryDimension === primaryDimension ? undefined : secondaryDimension,
        metrics: metrics.length ? metrics : (visibleMetrics.length ? visibleMetrics : DEFAULT_VISIBLE_METRICS),
        visibleMetrics: visibleMetrics.length ? visibleMetrics : DEFAULT_VISIBLE_METRICS,
        selectedMetric,
        secondaryMetric: secondaryMetric === selectedMetric ? null : secondaryMetric,
        range: input.range || '30d',
        bucket: input.bucket || 'day',
        compareMode: compareMode === 'segments' && comparisons.length === 0 ? 'off' : compareMode,
        compare: compareMode !== 'off',
        comparisons,
        limit: Math.max(1, Math.min(Number(input.limit) || 15, 50)),
        orderBy: ALLOWED_QUERY_METRICS.has(input.orderBy || selectedMetric) ? input.orderBy || selectedMetric : selectedMetric,
        visualization: input.visualization || 'table',
        plotRows: Array.isArray(input.plotRows) ? input.plotRows.filter(Boolean).slice(0, 5) : [],
        filters: Array.isArray(input.filters)
            ? input.filters.filter((filter) => ALLOWED_QUERY_DIMENSIONS.has(filter.fieldName)).slice(0, 5)
            : [],
    };
}

export async function POST(req: NextRequest) {
    const descriptor = sanitizeDescriptor(await req.json());

    if (!descriptor.propertyId) {
        return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const [session, jwt] = await Promise.all([
        getServerSession(authOptions),
        getToken({ req: req as any }) as Promise<any>,
    ]);

    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const userId = (session.user as any).id;
        let googleAccess = jwt?.googleAccessToken as string | undefined;
        let googleRefresh = jwt?.googleRefreshToken as string | undefined;

        if (!googleAccess && !googleRefresh) {
            const dbTokens = await fetchGoogleTokensFromDb(userId);
            if (dbTokens) {
                googleAccess = dbTokens.accessToken;
                googleRefresh = dbTokens.refreshToken;
            }
        }

        if (!googleAccess && !googleRefresh) {
            return NextResponse.json({ error: 'Google not connected', code: 'GOOGLE_NOT_CONNECTED' }, { status: 400 });
        }

        const token = await getValidAccessToken(googleAccess, googleRefresh);
        const { startDate, endDate } = resolveRange(descriptor.range || '30d');
        const comparisonRange = resolveComparisonDateRange(descriptor.range || '30d', descriptor.compareMode || 'off');
        const tableDimensions = descriptor.secondaryDimension
            ? [descriptor.primaryDimension, descriptor.secondaryDimension]
            : [descriptor.primaryDimension];
        const requestedMetrics = uniqueMetrics([
            ...(descriptor.visibleMetrics || []),
            ...(descriptor.metrics || []),
            descriptor.selectedMetric,
            descriptor.secondaryMetric || undefined,
            descriptor.orderBy,
        ]);
        const baseMetrics = Array.from(new Set(
            requestedMetrics.flatMap((metric) => getMetricDependencies(metric)).filter((metric) => BASE_QUERY_METRICS.has(metric)),
        ));
        const selectedMetric = descriptor.selectedMetric || descriptor.metrics[0];
        const secondaryMetric = descriptor.secondaryMetric || null;
        const sharedFilter = joinFilters(descriptor.filters || []);
        const orderMetric = descriptor.orderBy || selectedMetric;
        const orderMetricBase = BASE_QUERY_METRICS.has(orderMetric) ? orderMetric : getMetricDependencies(orderMetric)[0];
        const tableNeedsClientSort = orderMetric === 'returningUsers';

        const totalPromise = gaRunReport(token, descriptor.propertyId, {
            dateRanges: [{ startDate, endDate }],
            metrics: baseMetrics.map((metric) => ({ name: metric })),
            limit: 1,
        });

        const compareTotalsPromise = comparisonRange && descriptor.compareMode !== 'segments'
            ? gaRunReport(token, descriptor.propertyId, {
                dateRanges: [{ startDate: comparisonRange.startDate, endDate: comparisonRange.endDate }],
                metrics: baseMetrics.map((metric) => ({ name: metric })),
                limit: 1,
            })
            : Promise.resolve(null);

        const tablePromise = gaRunReport(token, descriptor.propertyId, {
            dateRanges: [{ startDate, endDate }],
            dimensions: tableDimensions.map((dimension) => ({ name: dimension })),
            metrics: baseMetrics.map((metric) => ({ name: metric })),
            limit: descriptor.limit,
            ...(orderMetricBase ? { orderBys: [{ metric: { metricName: orderMetricBase }, desc: true }] } : {}),
            ...(sharedFilter ? { dimensionFilter: sharedFilter } : {}),
        });

        const trendMetricNames = Array.from(new Set([
            ...getMetricDependencies(selectedMetric),
            ...(secondaryMetric ? getMetricDependencies(secondaryMetric) : []),
        ]));

        const totalTrendPromise = gaRunReport(token, descriptor.propertyId, {
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }],
            metrics: trendMetricNames.map((metric) => ({ name: metric })),
            limit: 1000,
            ...(sharedFilter ? { dimensionFilter: sharedFilter } : {}),
        });

        const compareTrendPromise = comparisonRange && descriptor.compareMode !== 'segments'
            ? gaRunReport(token, descriptor.propertyId, {
                dateRanges: [{ startDate: comparisonRange.startDate, endDate: comparisonRange.endDate }],
                dimensions: [{ name: 'date' }],
                metrics: trendMetricNames.map((metric) => ({ name: metric })),
                limit: 1000,
                ...(sharedFilter ? { dimensionFilter: sharedFilter } : {}),
            })
            : Promise.resolve(null);

        const plotRowsPromise = descriptor.plotRows && descriptor.plotRows.length > 0
            ? gaRunReport(token, descriptor.propertyId, {
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'date' }, { name: descriptor.primaryDimension }],
                metrics: getMetricDependencies(selectedMetric).map((metric) => ({ name: metric })),
                limit: 1000,
                dimensionFilter: joinFilters(
                    descriptor.filters || [],
                    createFilterExpression({
                        fieldName: descriptor.primaryDimension,
                        operator: 'inList',
                        value: descriptor.plotRows,
                    }),
                ),
            })
            : Promise.resolve(null);

        const comparisonTrendPromises = descriptor.compareMode === 'segments' && descriptor.comparisons && descriptor.comparisons.length > 0
            ? descriptor.comparisons.map((comparison) =>
                gaRunReport(token, descriptor.propertyId!, {
                    dateRanges: [{ startDate, endDate }],
                    dimensions: [{ name: 'date' }],
                    metrics: getMetricDependencies(selectedMetric).map((metric) => ({ name: metric })),
                    limit: 1000,
                    dimensionFilter: joinFilters(descriptor.filters || [], createFilterExpression(comparison)),
                }).catch(() => null),
            )
            : [];

        const [
            totals,
            compareTotals,
            tableReport,
            totalTrend,
            compareTrend,
            plotRowsTrend,
            comparisonTrendResults,
        ] = await Promise.all([
            totalPromise,
            compareTotalsPromise,
            tablePromise,
            totalTrendPromise,
            compareTrendPromise,
            plotRowsPromise,
            Promise.all(comparisonTrendPromises),
        ]);

        const summary: Record<string, number> = {};
        const totalMetricMap = collectMetricMap(baseMetrics, totals?.rows?.[0]?.metricValues || []);
        requestedMetrics.forEach((metric) => {
            summary[metric] = metricFromMap(metric, totalMetricMap);
        });

        if (comparisonRange && compareTotals && descriptor.compareMode !== 'segments') {
            const compareMetricMap = collectMetricMap(baseMetrics, compareTotals?.rows?.[0]?.metricValues || []);
            requestedMetrics.forEach((metric) => {
                const previous = metricFromMap(metric, compareMetricMap);
                summary[`prev_${metric}`] = previous;
                summary[`delta_${metric}`] = previous > 0
                    ? Number((((summary[metric] - previous) / previous) * 100).toFixed(1))
                    : 0;
            });
        }

        let table: AnalyticsQueryTableRow[] = (tableReport?.rows || []).map((row: any, index: number) => {
            const metricMap = collectMetricMap(baseMetrics, row.metricValues || []);
            const rowMetrics = requestedMetrics.reduce<Record<string, number>>((acc, metric) => {
                acc[metric] = metricFromMap(metric, metricMap);
                return acc;
            }, {});

            return {
                id: `${row.dimensionValues?.map((entry: any) => entry?.value || '').join('::') || 'row'}-${index}`,
                primaryValue: row.dimensionValues?.[0]?.value || 'Unknown',
                secondaryValue: descriptor.secondaryDimension ? row.dimensionValues?.[1]?.value || undefined : undefined,
                metrics: rowMetrics,
            };
        });

        if (tableNeedsClientSort) {
            table = table.sort((left, right) => (right.metrics[orderMetric] || 0) - (left.metrics[orderMetric] || 0));
        }

        const totalRow: AnalyticsQueryTableRow = {
            id: 'total',
            primaryValue: 'Total',
            metrics: requestedMetrics.reduce<Record<string, number>>((acc, metric) => {
                acc[metric] = summary[metric] || 0;
                return acc;
            }, {}),
        };

        const trendRows = aggregateTrendRows(totalTrend?.rows || [], descriptor.bucket || 'day', trendMetricNames);
        const compareRows = comparisonRange && compareTrend && descriptor.compareMode !== 'segments'
            ? aggregateTrendRows(compareTrend?.rows || [], descriptor.bucket || 'day', trendMetricNames)
            : [];
        const plotRows = plotRowsTrend?.rows
            ? aggregateTrendRows(plotRowsTrend.rows, descriptor.bucket || 'day', getMetricDependencies(selectedMetric), 1)
            : [];
        const plotSeriesMap = new Map(
            plotRows.map((point) => [
                point.key,
                Object.entries(point.seriesMetrics || {}).reduce<Record<string, number>>((acc, [seriesName, metricMap]) => {
                    acc[seriesName] = metricFromMap(selectedMetric, metricMap);
                    return acc;
                }, {}),
            ]),
        );
        const comparisonSeriesMaps = descriptor.comparisons?.map((comparison, index) => {
            const key = makeComparisonKey(comparison, index);
            const points = comparisonTrendResults[index]
                ? aggregateTrendRows(comparisonTrendResults[index]?.rows || [], descriptor.bucket || 'day', getMetricDependencies(selectedMetric))
                : [];
            return {
                key,
                map: new Map(points.map((point) => [point.key, metricFromMap(selectedMetric, point.metricTotals)])),
            };
        }) || [];

        const trend: AnalyticsQueryTrendPoint[] = trendRows.map((point, index) => {
            const total = metricFromMap(selectedMetric, point.metricTotals);
            const secondaryValue = secondaryMetric ? metricFromMap(secondaryMetric, point.metricTotals) : undefined;
            const previousPoint = compareRows[index];
            const comparisonTotals = comparisonSeriesMaps.reduce<Record<string, number>>((acc, comparison) => {
                const value = comparison.map.get(point.key);
                if (value != null) acc[comparison.key] = value;
                return acc;
            }, {});
            return {
                key: point.key,
                label: point.label,
                total,
                compareTotal: previousPoint ? metricFromMap(selectedMetric, previousPoint.metricTotals) : undefined,
                secondaryValue,
                series: plotSeriesMap.get(point.key) || undefined,
                comparisonTotals: Object.keys(comparisonTotals).length ? comparisonTotals : undefined,
            };
        });

        const annotationHints = buildAnnotationHints(trend);

        const response: AnalyticsQueryResponse = {
            summary,
            table,
            totalRow,
            trend,
            selectedMetric,
            secondaryMetric,
            compareMode: descriptor.compareMode || 'off',
            annotationHints,
            descriptor,
        };

        return NextResponse.json(response);
    } catch (error: any) {
        console.error('Analytics query error:', error);
        return NextResponse.json({ error: error.message || 'Failed to execute analytics query' }, { status: 500 });
    }
}
