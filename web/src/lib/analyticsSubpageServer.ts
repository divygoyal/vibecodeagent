import { resolvePrevRange, resolveRange, runFlexibleGAReport, runGAReport } from '@/lib/googleApi';
import type {
    FunnelDefinition,
    FunnelSuggestion,
    GoalDefinition,
    GoalSuggestion,
} from '@/lib/analyticsDefinitions';

interface AnalyticsValue {
    value?: string;
}

interface AnalyticsRow {
    dimensionValues?: AnalyticsValue[];
    metricValues?: AnalyticsValue[];
}

interface AnalyticsReport {
    rows?: AnalyticsRow[];
}

interface PagesTrendPoint {
    date: string;
    views: number;
    sessions: number;
    users: number;
    avgDuration: number;
    bounceRate: number;
}

interface SessionsSummaryRow {
    sessions: number;
    engagedSessions: number;
    pageViews: number;
    users: number;
    avgDuration: number;
    bounceRate: number;
}

interface EventSummaryRow {
    name: string;
    eventCount: number;
    users: number;
    isKeyEvent: boolean;
}

interface GoalTrendPoint {
    date: string;
    conversions: number;
    users: number;
}

interface EventTrendBucket {
    date: string;
    counts: Record<string, number>;
}

function toNumber(value: string | undefined, digits = 0) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return 0;
    if (digits === 0) return Math.round(parsed);
    return Number(parsed.toFixed(digits));
}

function percentage(current: number, total: number, digits = 1) {
    if (!total) return 0;
    return Number(((current / total) * 100).toFixed(digits));
}

function changePercent(current: number, previous: number, digits = 1) {
    if (!previous) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(digits));
}

function isoDate(dateValue: string) {
    if (dateValue.length === 8) {
        return `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`;
    }
    return dateValue;
}

function exactFilter(fieldName: string, value: string) {
    return {
        filter: {
            fieldName,
            stringFilter: {
                matchType: 'EXACT',
                value,
            },
        },
    };
}

function inListFilter(fieldName: string, values: string[]) {
    const filtered = values.filter(Boolean);
    if (filtered.length <= 1) {
        return exactFilter(fieldName, filtered[0] || '');
    }

    return {
        orGroup: {
            expressions: filtered.map((value) => exactFilter(fieldName, value)),
        },
    };
}

function formatLabelFromPath(path: string) {
    if (!path || path === '/' || path === '(not set)') return 'Homepage';
    return path.replace(/\?.*$/, '');
}

function formatLabelFromEvent(name: string) {
    return name.replace(/_/g, ' ');
}

function getRows(report: AnalyticsReport | null | undefined): AnalyticsRow[] {
    return report?.rows || [];
}

function rowMetric(row: AnalyticsRow | undefined, index: number, digits = 0) {
    return toNumber(row?.metricValues?.[index]?.value, digits);
}

function rowDimension(row: AnalyticsRow | undefined, index: number) {
    return row?.dimensionValues?.[index]?.value || '';
}

async function runSingleMetricWithFallback(
    token: string,
    propertyId: string,
    dimension: string,
    metrics: string[],
    fallbackMetrics: string[],
    startDate: string,
    endDate: string,
    limit = 20,
) {
    try {
        const data = await runGAReport(token, propertyId, [dimension], metrics, startDate, endDate, limit, metrics[0]);
        return { data, metricSource: metrics[0] };
    } catch {
        const data = await runGAReport(token, propertyId, [dimension], fallbackMetrics, startDate, endDate, limit, fallbackMetrics[0]);
        return { data, metricSource: fallbackMetrics[0] };
    }
}

export async function fetchAnalyticsPagesData(token: string, propertyId: string, range: string) {
    const { startDate, endDate } = resolveRange(range);

    const [trendReport, topPagesReport, landingPagesReport, exitPagesResult] = await Promise.all([
        runGAReport(
            token,
            propertyId,
            ['date'],
            ['screenPageViews', 'sessions', 'activeUsers', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            120,
        ),
        runGAReport(
            token,
            propertyId,
            ['pagePath', 'pageTitle'],
            ['screenPageViews', 'activeUsers', 'averageSessionDuration', 'bounceRate', 'engagementRate'],
            startDate,
            endDate,
            20,
            'screenPageViews',
        ),
        runGAReport(
            token,
            propertyId,
            ['landingPagePlusQueryString'],
            ['sessions', 'activeUsers', 'bounceRate', 'engagementRate'],
            startDate,
            endDate,
            12,
            'sessions',
        ),
        runSingleMetricWithFallback(
            token,
            propertyId,
            'pagePath',
            ['exits', 'screenPageViews'],
            ['screenPageViews'],
            startDate,
            endDate,
            12,
        ),
    ]);

    const trend: PagesTrendPoint[] = getRows(trendReport).map((row) => ({
        date: isoDate(rowDimension(row, 0)),
        views: rowMetric(row, 0),
        sessions: rowMetric(row, 1),
        users: rowMetric(row, 2),
        avgDuration: rowMetric(row, 3),
        bounceRate: Number((rowMetric(row, 4, 4) * 100).toFixed(1)),
    }));

    const totals = trend.reduce((acc: {
        views: number;
        sessions: number;
        users: number;
        duration: number;
        bounce: number;
        rows: number;
    }, point: PagesTrendPoint) => ({
        views: acc.views + point.views,
        sessions: acc.sessions + point.sessions,
        users: acc.users + point.users,
        duration: acc.duration + point.avgDuration,
        bounce: acc.bounce + point.bounceRate,
        rows: acc.rows + 1,
    }), { views: 0, sessions: 0, users: 0, duration: 0, bounce: 0, rows: 0 });

    const topPages = getRows(topPagesReport)
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            page: rowDimension(row, 0),
            title: rowDimension(row, 1),
            views: rowMetric(row, 0),
            users: rowMetric(row, 1),
            avgDuration: rowMetric(row, 2),
            bounceRate: Number((rowMetric(row, 3, 4) * 100).toFixed(1)),
            engagementRate: Number((rowMetric(row, 4, 4) * 100).toFixed(1)),
        }));

    const landingPages = getRows(landingPagesReport)
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            page: rowDimension(row, 0),
            sessions: rowMetric(row, 0),
            users: rowMetric(row, 1),
            bounceRate: Number((rowMetric(row, 2, 4) * 100).toFixed(1)),
            engagementRate: Number((rowMetric(row, 3, 4) * 100).toFixed(1)),
            share: percentage(rowMetric(row, 0), totals.sessions),
        }));

    const exitMetricSource = exitPagesResult.metricSource;
    const exitRows = getRows(exitPagesResult.data as AnalyticsReport | null);
    const exitTotal = exitRows.reduce((sum: number, row) => sum + rowMetric(row, 0), 0);
    const exitPages = exitRows
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            page: rowDimension(row, 0),
            exits: rowMetric(row, 0),
            views: rowMetric(row, 1),
            share: percentage(rowMetric(row, 0), exitTotal),
        }));

    return {
        summary: {
            pageViews: totals.views,
            sessions: totals.sessions,
            users: totals.users,
            pagesPerSession: totals.sessions ? Number((totals.views / totals.sessions).toFixed(2)) : 0,
            avgSessionDuration: totals.rows ? Math.round(totals.duration / totals.rows) : 0,
            bounceRate: totals.rows ? Number((totals.bounce / totals.rows).toFixed(1)) : 0,
        },
        trend,
        topPages,
        landingPages,
        exitPages,
        exitMetricSource,
    };
}

export async function fetchAnalyticsSessionsData(token: string, propertyId: string, range: string) {
    const { startDate, endDate } = resolveRange(range);

    const [summaryReport, trendReport, landingReport, channelReport, deviceReport, referrerReport] = await Promise.all([
        runGAReport(
            token,
            propertyId,
            ['date'],
            ['sessions', 'engagedSessions', 'screenPageViews', 'activeUsers', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            120,
        ),
        runGAReport(
            token,
            propertyId,
            ['date'],
            ['sessions', 'engagedSessions'],
            startDate,
            endDate,
            120,
        ),
        runGAReport(
            token,
            propertyId,
            ['landingPagePlusQueryString'],
            ['sessions', 'engagedSessions', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            12,
            'sessions',
        ),
        runGAReport(
            token,
            propertyId,
            ['sessionDefaultChannelGroup'],
            ['sessions', 'engagedSessions', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            12,
            'sessions',
        ),
        runGAReport(
            token,
            propertyId,
            ['deviceCategory'],
            ['sessions', 'engagedSessions', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            8,
            'sessions',
        ),
        runGAReport(
            token,
            propertyId,
            ['sessionSource'],
            ['sessions', 'engagedSessions', 'averageSessionDuration', 'bounceRate'],
            startDate,
            endDate,
            10,
            'sessions',
        ),
    ]);

    const dailySummary: SessionsSummaryRow[] = getRows(summaryReport).map((row) => ({
        sessions: rowMetric(row, 0),
        engagedSessions: rowMetric(row, 1),
        pageViews: rowMetric(row, 2),
        users: rowMetric(row, 3),
        avgDuration: rowMetric(row, 4),
        bounceRate: Number((rowMetric(row, 5, 4) * 100).toFixed(1)),
    }));

    const summary = dailySummary.reduce((acc: {
        sessions: number;
        engagedSessions: number;
        pageViews: number;
        users: number;
        duration: number;
        bounce: number;
        rows: number;
    }, row: SessionsSummaryRow) => ({
        sessions: acc.sessions + row.sessions,
        engagedSessions: acc.engagedSessions + row.engagedSessions,
        pageViews: acc.pageViews + row.pageViews,
        users: acc.users + row.users,
        duration: acc.duration + row.avgDuration,
        bounce: acc.bounce + row.bounceRate,
        rows: acc.rows + 1,
    }), { sessions: 0, engagedSessions: 0, pageViews: 0, users: 0, duration: 0, bounce: 0, rows: 0 });

    const trend = getRows(trendReport).map((row) => ({
        date: isoDate(rowDimension(row, 0)),
        sessions: rowMetric(row, 0),
        engagedSessions: rowMetric(row, 1),
    }));

    const mapQualityRows = (rows: AnalyticsRow[], labelIndex = 0) => rows
        .filter((row) => rowDimension(row, labelIndex) && rowDimension(row, labelIndex) !== '(not set)')
        .map((row) => {
            const sessions = rowMetric(row, 0);
            const engagedSessions = rowMetric(row, 1);
            const avgDuration = rowMetric(row, 2);
            const bounceRate = Number((rowMetric(row, 3, 4) * 100).toFixed(1));
            return {
                label: rowDimension(row, labelIndex),
                sessions,
                engagedSessions,
                engagementRate: percentage(engagedSessions, sessions),
                avgDuration,
                bounceRate,
                share: percentage(sessions, summary.sessions),
                qualityScore: Number((percentage(engagedSessions, sessions) - bounceRate / 2 + Math.min(avgDuration / 10, 30)).toFixed(1)),
            };
        });

    return {
        summary: {
            sessions: summary.sessions,
            engagedSessions: summary.engagedSessions,
            activeUsers: summary.users,
            pagesPerSession: summary.sessions ? Number((summary.pageViews / summary.sessions).toFixed(2)) : 0,
            avgSessionDuration: summary.rows ? Math.round(summary.duration / summary.rows) : 0,
            bounceRate: summary.rows ? Number((summary.bounce / summary.rows).toFixed(1)) : 0,
            engagementRate: percentage(summary.engagedSessions, summary.sessions),
        },
        trend,
        landingPatterns: mapQualityRows(getRows(landingReport)),
        channelQuality: mapQualityRows(getRows(channelReport)),
        deviceQuality: mapQualityRows(getRows(deviceReport)),
        referrerQuality: mapQualityRows(getRows(referrerReport)),
    };
}

const KEY_EVENT_NAMES = new Set([
    'purchase',
    'sign_up',
    'generate_lead',
    'submit_form',
    'contact_submit',
    'begin_checkout',
    'add_to_cart',
    'login',
    'subscribe',
]);

export async function fetchAnalyticsEventsData(token: string, propertyId: string, range: string) {
    const { startDate, endDate } = resolveRange(range);

    const [summaryReport, topEventsReport] = await Promise.all([
        runGAReport(token, propertyId, ['date'], ['eventCount', 'totalUsers'], startDate, endDate, 120),
        runGAReport(token, propertyId, ['eventName'], ['eventCount', 'totalUsers'], startDate, endDate, 20, 'eventCount'),
    ]);

    const summaryRows = getRows(summaryReport);
    const summary = summaryRows.reduce((acc: { eventCount: number; users: number; rows: number }, row) => ({
        eventCount: acc.eventCount + rowMetric(row, 0),
        users: acc.users + rowMetric(row, 1),
        rows: acc.rows + 1,
    }), { eventCount: 0, users: 0, rows: 0 });

    const topEvents: EventSummaryRow[] = getRows(topEventsReport)
        .filter((row) => rowDimension(row, 0))
        .map((row) => ({
            name: rowDimension(row, 0),
            eventCount: rowMetric(row, 0),
            users: rowMetric(row, 1),
            isKeyEvent: KEY_EVENT_NAMES.has(rowDimension(row, 0)),
        }));

    const trendEventNames: string[] = topEvents
        .filter((event: EventSummaryRow) => event.isKeyEvent)
        .slice(0, 4)
        .map((event: EventSummaryRow) => event.name);
    const normalizedTrendNames: string[] = (
        trendEventNames.length > 0
            ? trendEventNames
            : topEvents.slice(0, 4).map((event: EventSummaryRow) => event.name)
    ).filter((eventName): eventName is string => Boolean(eventName));
    const focusEvent = normalizedTrendNames[0] || topEvents[0]?.name || 'page_view';

    const [trendReport, pageBreakdownReport, sourceBreakdownReport, deviceBreakdownReport] = await Promise.all([
        runFlexibleGAReport(
            token,
            propertyId,
            ['date', 'eventName'],
            ['eventCount'],
            [{ startDate, endDate }],
            {
                dimensionFilter: inListFilter('eventName', normalizedTrendNames),
                limit: 250,
                orderBys: [{ field: 'date', type: 'dimension', desc: false }],
            },
        ),
        runFlexibleGAReport(
            token,
            propertyId,
            ['pagePath'],
            ['eventCount', 'totalUsers'],
            [{ startDate, endDate }],
            {
                dimensionFilter: exactFilter('eventName', focusEvent),
                limit: 12,
                orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
            },
        ),
        runFlexibleGAReport(
            token,
            propertyId,
            ['sessionDefaultChannelGroup'],
            ['eventCount'],
            [{ startDate, endDate }],
            {
                dimensionFilter: exactFilter('eventName', focusEvent),
                limit: 8,
                orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
            },
        ),
        runFlexibleGAReport(
            token,
            propertyId,
            ['deviceCategory'],
            ['eventCount'],
            [{ startDate, endDate }],
            {
                dimensionFilter: exactFilter('eventName', focusEvent),
                limit: 8,
                orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
            },
        ),
    ]);

    const trendMap = new Map<string, EventTrendBucket>();
    for (const row of getRows(trendReport as AnalyticsReport | null)) {
        const date = isoDate(rowDimension(row, 0));
        const eventName = rowDimension(row, 1);
        const eventCount = rowMetric(row, 0);
        const existing = trendMap.get(date) || { date, counts: {} };
        existing.counts[eventName] = eventCount;
        trendMap.set(date, existing);
    }

    const trend = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => {
            const item: Record<string, number | string> = { date: value.date };
            let total = 0;
            normalizedTrendNames.forEach((eventName: string) => {
                const count = value.counts[eventName] || 0;
                item[eventName] = count;
                total += count;
            });
            item.total = total;
            return item;
        });

    const pageBreakdown = getRows(pageBreakdownReport as AnalyticsReport | null)
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            page: rowDimension(row, 0),
            eventCount: rowMetric(row, 0),
            users: rowMetric(row, 1),
        }));

    const sourceBreakdown = getRows(sourceBreakdownReport as AnalyticsReport | null)
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            source: rowDimension(row, 0),
            eventCount: rowMetric(row, 0),
        }));

    const deviceBreakdown = getRows(deviceBreakdownReport as AnalyticsReport | null)
        .filter((row) => rowDimension(row, 0) && rowDimension(row, 0) !== '(not set)')
        .map((row) => ({
            device: rowDimension(row, 0),
            eventCount: rowMetric(row, 0),
        }));

    return {
        summary: {
            eventCount: summary.eventCount,
            activeUsers: summary.users,
            trackedTypes: topEvents.length,
            keyEvents: topEvents.filter((event: EventSummaryRow) => event.isKeyEvent).map((event: EventSummaryRow) => event.name),
            focusEvent,
        },
        topEvents,
        trend,
        trendKeys: normalizedTrendNames,
        focusEvent,
        pageBreakdown,
        sourceBreakdown,
        deviceBreakdown,
    };
}

function goalExplanation(definition: GoalDefinition, conversions: number, rate: number) {
    if (definition.type === 'event_count') {
        return `${formatLabelFromEvent(definition.target)} fired ${conversions.toLocaleString()} times, converting ${rate.toFixed(1)}% of sessions during the selected period.`;
    }

    return `${formatLabelFromPath(definition.target)} attracted ${conversions.toLocaleString()} goal sessions, which is ${rate.toFixed(1)}% of all sessions in the selected period.`;
}

export async function fetchGoalDefinitionAnalytics(
    token: string,
    propertyId: string,
    definition: GoalDefinition,
    range: string,
) {
    const { startDate, endDate } = resolveRange(range);
    const prevRange = resolvePrevRange(range);

    const totalSessionsPromises = [
        runGAReport(token, propertyId, ['date'], ['sessions'], startDate, endDate, 120),
        runGAReport(token, propertyId, ['date'], ['sessions'], prevRange.startDate, prevRange.endDate, 120),
    ];

    if (definition.type === 'event_count') {
        const [currentReport, previousReport, totalSessionsReport, previousSessionsReport, bySourceReport, byPageReport] = await Promise.all([
            runFlexibleGAReport(
                token,
                propertyId,
                ['date'],
                ['eventCount', 'totalUsers'],
                [{ startDate, endDate }],
                { dimensionFilter: exactFilter('eventName', definition.target), limit: 120 },
            ),
            runFlexibleGAReport(
                token,
                propertyId,
                [],
                ['eventCount'],
                [{ startDate: prevRange.startDate, endDate: prevRange.endDate }],
                { dimensionFilter: exactFilter('eventName', definition.target), limit: 1 },
            ),
            totalSessionsPromises[0],
            totalSessionsPromises[1],
            runFlexibleGAReport(
                token,
                propertyId,
                ['sessionDefaultChannelGroup'],
                ['eventCount'],
                [{ startDate, endDate }],
                {
                    dimensionFilter: exactFilter('eventName', definition.target),
                    limit: 8,
                    orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
                },
            ),
            runFlexibleGAReport(
                token,
                propertyId,
                ['pagePath'],
                ['eventCount'],
                [{ startDate, endDate }],
                {
                    dimensionFilter: exactFilter('eventName', definition.target),
                    limit: 8,
                    orderBys: [{ field: 'eventCount', type: 'metric', desc: true }],
                },
            ),
        ]);

        const trend: GoalTrendPoint[] = getRows(currentReport as AnalyticsReport | null).map((row) => ({
            date: isoDate(rowDimension(row, 0)),
            conversions: rowMetric(row, 0),
            users: rowMetric(row, 1),
        }));
        const conversions = trend.reduce((sum: number, point: GoalTrendPoint) => sum + point.conversions, 0);
        const totalSessions = getRows(totalSessionsReport as AnalyticsReport | null).reduce((sum: number, row) => sum + rowMetric(row, 0), 0);
        const previousSessions = getRows(previousSessionsReport as AnalyticsReport | null).reduce((sum: number, row) => sum + rowMetric(row, 0), 0);
        const previousConversions = rowMetric(previousReport?.rows?.[0], 0);
        const rate = percentage(conversions, totalSessions);
        const previousRate = percentage(previousConversions, previousSessions);

        return {
            definition,
            summary: {
                conversions,
                totalSessions,
                rate,
                change: changePercent(conversions, previousConversions),
                rateChange: Number((rate - previousRate).toFixed(1)),
            },
            trend,
            sourceContribution: getRows(bySourceReport as AnalyticsReport | null).map((row) => ({
                source: rowDimension(row, 0),
                conversions: rowMetric(row, 0),
                share: percentage(rowMetric(row, 0), conversions),
            })),
            pageContribution: getRows(byPageReport as AnalyticsReport | null).map((row) => ({
                page: rowDimension(row, 0),
                conversions: rowMetric(row, 0),
                share: percentage(rowMetric(row, 0), conversions),
            })),
            explanation: goalExplanation(definition, conversions, rate),
        };
    }

    const [currentReport, previousReport, totalSessionsReport, previousSessionsReport, bySourceReport] = await Promise.all([
        runFlexibleGAReport(
            token,
            propertyId,
            ['date'],
            ['sessions', 'activeUsers'],
            [{ startDate, endDate }],
            { dimensionFilter: exactFilter('pagePath', definition.target), limit: 120 },
        ),
        runFlexibleGAReport(
            token,
            propertyId,
            [],
            ['sessions'],
            [{ startDate: prevRange.startDate, endDate: prevRange.endDate }],
            { dimensionFilter: exactFilter('pagePath', definition.target), limit: 1 },
        ),
        totalSessionsPromises[0],
        totalSessionsPromises[1],
        runFlexibleGAReport(
            token,
            propertyId,
            ['sessionDefaultChannelGroup'],
            ['sessions', 'activeUsers'],
            [{ startDate, endDate }],
            {
                dimensionFilter: exactFilter('pagePath', definition.target),
                limit: 8,
                orderBys: [{ field: 'sessions', type: 'metric', desc: true }],
            },
        ),
    ]);

    const trend: GoalTrendPoint[] = getRows(currentReport as AnalyticsReport | null).map((row) => ({
        date: isoDate(rowDimension(row, 0)),
        conversions: rowMetric(row, 0),
        users: rowMetric(row, 1),
    }));
    const conversions = trend.reduce((sum: number, point: GoalTrendPoint) => sum + point.conversions, 0);
    const totalSessions = getRows(totalSessionsReport as AnalyticsReport | null).reduce((sum: number, row) => sum + rowMetric(row, 0), 0);
    const previousSessions = getRows(previousSessionsReport as AnalyticsReport | null).reduce((sum: number, row) => sum + rowMetric(row, 0), 0);
    const previousConversions = rowMetric(previousReport?.rows?.[0], 0);
    const rate = percentage(conversions, totalSessions);
    const previousRate = percentage(previousConversions, previousSessions);

    return {
        definition,
        summary: {
            conversions,
            totalSessions,
            rate,
            change: changePercent(conversions, previousConversions),
            rateChange: Number((rate - previousRate).toFixed(1)),
        },
        trend,
        sourceContribution: getRows(bySourceReport as AnalyticsReport | null).map((row) => ({
            source: rowDimension(row, 0),
            conversions: rowMetric(row, 0),
            users: rowMetric(row, 1),
            share: percentage(rowMetric(row, 0), conversions),
        })),
        pageContribution: conversions > 0 ? [{
            page: definition.target,
            conversions,
            share: 100,
        }] : [],
        explanation: goalExplanation(definition, conversions, rate),
    };
}

export async function fetchFunnelDefinitionAnalytics(
    token: string,
    propertyId: string,
    definition: FunnelDefinition,
    range: string,
) {
    const { startDate, endDate } = resolveRange(range);
    const prevRange = resolvePrevRange(range);
    const steps = definition.steps.filter(Boolean);

    const [currentReports, previousReports, entryTrendReport, completionTrendReport] = await Promise.all([
        Promise.all(steps.map((step) => runFlexibleGAReport(
            token,
            propertyId,
            [],
            ['sessions', 'activeUsers', 'averageSessionDuration'],
            [{ startDate, endDate }],
            { dimensionFilter: exactFilter('pagePath', step), limit: 1 },
        ))),
        Promise.all(steps.map((step) => runFlexibleGAReport(
            token,
            propertyId,
            [],
            ['sessions'],
            [{ startDate: prevRange.startDate, endDate: prevRange.endDate }],
            { dimensionFilter: exactFilter('pagePath', step), limit: 1 },
        ))),
        runFlexibleGAReport(
            token,
            propertyId,
            ['date'],
            ['sessions'],
            [{ startDate, endDate }],
            { dimensionFilter: exactFilter('pagePath', steps[0] || '/'), limit: 120 },
        ),
        runFlexibleGAReport(
            token,
            propertyId,
            ['date'],
            ['sessions'],
            [{ startDate, endDate }],
            { dimensionFilter: exactFilter('pagePath', steps[steps.length - 1] || '/'), limit: 120 },
        ),
    ]);

    const currentSteps = steps.map((step, index) => {
        const row = currentReports[index]?.rows?.[0];
        const count = rowMetric(row, 0);
        const users = rowMetric(row, 1);
        const avgDuration = rowMetric(row, 2);
        return { step, count, users, avgDuration };
    });

    const previousLast = rowMetric(previousReports[previousReports.length - 1]?.rows?.[0], 0);
    const firstCount = currentSteps[0]?.count || 0;
    const lastCount = currentSteps[currentSteps.length - 1]?.count || 0;

    const mappedSteps = currentSteps.map((step, index) => ({
        name: step.step,
        count: step.count,
        users: step.users,
        avgDuration: step.avgDuration,
        percentOfTotal: percentage(step.count, firstCount, 0),
        dropFromPrevious: index === 0 ? 0 : percentage((currentSteps[index - 1]?.count || 0) - step.count, currentSteps[index - 1]?.count || 0, 1),
    }));

    const biggestDrop = mappedSteps.reduce((current, step, index) => {
        if (index === 0) return current;
        if (step.dropFromPrevious > current.rate) {
            return {
                from: mappedSteps[index - 1]?.name || '',
                to: step.name,
                rate: step.dropFromPrevious,
            };
        }
        return current;
    }, { from: '', to: '', rate: 0 });

    const entryTrendMap = new Map<string, { date: string; entries: number; completions: number }>();
    for (const row of entryTrendReport?.rows || []) {
        const date = isoDate(rowDimension(row, 0));
        entryTrendMap.set(date, {
            date,
            entries: rowMetric(row, 0),
            completions: entryTrendMap.get(date)?.completions || 0,
        });
    }
    for (const row of completionTrendReport?.rows || []) {
        const date = isoDate(rowDimension(row, 0));
        entryTrendMap.set(date, {
            date,
            entries: entryTrendMap.get(date)?.entries || 0,
            completions: rowMetric(row, 0),
        });
    }

    return {
        definition,
        steps: mappedSteps,
        summary: {
            totalEntries: firstCount,
            completions: lastCount,
            overallRate: percentage(lastCount, firstCount),
            completionChange: changePercent(lastCount, previousLast),
            avgCompletionSessionDuration: Math.round(currentSteps[currentSteps.length - 1]?.avgDuration || 0),
        },
        biggestDrop,
        trend: Array.from(entryTrendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
}

export async function buildGoalSuggestions(token: string, propertyId: string, range: string): Promise<GoalSuggestion[]> {
    const { startDate, endDate } = resolveRange(range);
    const [pagesReport, eventsReport] = await Promise.all([
        runGAReport(
            token,
            propertyId,
            ['pagePath'],
            ['sessions'],
            startDate,
            endDate,
            8,
            'sessions',
        ),
        runGAReport(
            token,
            propertyId,
            ['eventName'],
            ['eventCount'],
            startDate,
            endDate,
            8,
            'eventCount',
        ).catch(() => ({ rows: [] })),
    ]);

    const pageSuggestions = getRows(pagesReport as AnalyticsReport | null)
        .map((row) => rowDimension(row, 0))
        .filter((page): page is string => Boolean(page) && page !== '(not set)')
        .slice(0, 3)
        .map((page) => ({
            name: `${formatLabelFromPath(page)} visits`,
            description: `Track sessions that reach ${page}.`,
            type: 'page_visit' as const,
            target: page,
        }));

    const eventSuggestions = getRows(eventsReport as AnalyticsReport | null)
        .map((row) => rowDimension(row, 0))
        .filter((eventName): eventName is string => Boolean(eventName) && KEY_EVENT_NAMES.has(eventName))
        .slice(0, 2)
        .map((eventName) => ({
            name: `${formatLabelFromEvent(eventName)} completions`,
            description: `Track how often ${formatLabelFromEvent(eventName)} fires.`,
            type: 'event_count' as const,
            target: eventName,
        }));

    return [...eventSuggestions, ...pageSuggestions].slice(0, 4);
}

export async function buildFunnelSuggestions(token: string, propertyId: string, range: string): Promise<FunnelSuggestion[]> {
    const { startDate, endDate } = resolveRange(range);
    const pagesReport = await runGAReport(
        token,
        propertyId,
        ['pagePath'],
        ['sessions'],
        startDate,
        endDate,
        12,
        'sessions',
    );

    const pages: string[] = getRows(pagesReport as AnalyticsReport | null)
        .map((row) => rowDimension(row, 0))
        .filter((page): page is string => Boolean(page) && page !== '(not set)');

    const uniquePages: string[] = Array.from(new Set(pages));
    const pricing = uniquePages.find((page) => /pricing|plans|checkout/i.test(page));
    const signup = uniquePages.find((page) => /signup|register|start|contact/i.test(page));
    const blog = uniquePages.find((page) => /blog|article|guide|docs/i.test(page));
    const homepage = uniquePages.find((page) => page === '/') || uniquePages[0] || '/';

    const suggestions: FunnelSuggestion[] = [];

    if (homepage && pricing && signup) {
        suggestions.push({
            name: 'Homepage to conversion',
            description: 'See where visitors drop between the homepage, pricing, and your main conversion page.',
            steps: [homepage, pricing, signup],
        });
    }

    if (blog && pricing && signup) {
        suggestions.push({
            name: 'Content-assisted conversion',
            description: 'Measure how well content readers move into your commercial pages.',
            steps: [blog, pricing, signup],
        });
    }

    if (uniquePages.length >= 3) {
        suggestions.push({
            name: 'Top page progression',
            description: 'Use the top three real pages as a starter funnel for this property.',
            steps: uniquePages.slice(0, 3),
        });
    }

    return suggestions.slice(0, 3);
}
