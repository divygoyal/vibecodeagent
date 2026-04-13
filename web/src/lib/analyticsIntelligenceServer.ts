import { resolveRange, runGAReport } from '@/lib/googleApi';

const ANALYTICS_INTELLIGENCE_TIMEOUT_MS = 12_000;

type GaValue = { value: string };
type GaRow = {
    dimensionValues: GaValue[];
    metricValues: GaValue[];
};
type GaReport = {
    rows?: GaRow[];
};

export type AnalyticsIntelligenceData = {
    kpis: {
        totalUsers: number;
        avgBounceRate: number;
        avgSessionDuration: number;
        newUsers: number;
        returningUsers: number;
        pagesPerSession: number;
    };
    traffic: Array<{
        date: string;
        activeUsers: number;
        sessions: number;
        pageViews: number;
        bounceRate: number;
    }>;
    channels: Array<{
        name: string;
        value: number;
        users: number;
        percentage: number;
    }>;
};

function formatGaDate(value: string) {
    return value.length === 8
        ? `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}`
        : value;
}

export async function fetchAnalyticsIntelligenceData(
    token: string,
    propertyId: string,
    range = '30d',
): Promise<AnalyticsIntelligenceData> {
    const { startDate, endDate } = resolveRange(range);
    const [trafficData, channelsData] = await Promise.all([
        runGAReport(
            token,
            propertyId,
            ['date'],
            ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'],
            startDate,
            endDate,
            1000,
            undefined,
            AbortSignal.timeout(ANALYTICS_INTELLIGENCE_TIMEOUT_MS),
        ) as Promise<GaReport>,
        runGAReport(
            token,
            propertyId,
            ['sessionDefaultChannelGroup'],
            ['sessions', 'activeUsers'],
            startDate,
            endDate,
            20,
            'sessions',
            AbortSignal.timeout(ANALYTICS_INTELLIGENCE_TIMEOUT_MS),
        ).catch(() => null) as Promise<GaReport | null>,
    ]);

    const traffic: AnalyticsIntelligenceData['traffic'] = [];
    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageViews = 0;
    let totalBounce = 0;
    let totalDuration = 0;
    let totalNewUsers = 0;
    let rowCount = 0;

    for (const row of trafficData.rows || []) {
        const metrics = row.metricValues || [];
        totalUsers += parseInt(metrics[0]?.value || '0', 10) || 0;
        totalSessions += parseInt(metrics[1]?.value || '0', 10) || 0;
        totalPageViews += parseInt(metrics[2]?.value || '0', 10) || 0;
        totalBounce += parseFloat(metrics[3]?.value || '0') || 0;
        totalDuration += parseFloat(metrics[4]?.value || '0') || 0;
        totalNewUsers += parseInt(metrics[5]?.value || '0', 10) || 0;
        rowCount++;

        traffic.push({
            date: formatGaDate(row.dimensionValues?.[0]?.value || ''),
            activeUsers: parseInt(metrics[0]?.value || '0', 10) || 0,
            sessions: parseInt(metrics[1]?.value || '0', 10) || 0,
            pageViews: parseInt(metrics[2]?.value || '0', 10) || 0,
            bounceRate: +((parseFloat(metrics[3]?.value || '0') || 0) * 100).toFixed(1),
        });
    }

    traffic.sort((left, right) => left.date.localeCompare(right.date));

    const channels: AnalyticsIntelligenceData['channels'] = [];
    if (channelsData?.rows?.length) {
        let totalChannelValue = 0;
        const rawChannels = channelsData.rows.map((row) => {
            const value = parseInt(row.metricValues?.[0]?.value || '0', 10) || 0;
            totalChannelValue += value;
            return {
                name: row.dimensionValues?.[0]?.value || '(not set)',
                value,
                users: parseInt(row.metricValues?.[1]?.value || '0', 10) || 0,
            };
        });

        rawChannels.forEach((item) => {
            channels.push({
                ...item,
                percentage: totalChannelValue > 0 ? +((item.value / totalChannelValue) * 100).toFixed(1) : 0,
            });
        });
    }

    const avgBounceRate = rowCount > 0 ? (totalBounce / rowCount) * 100 : 0;

    return {
        kpis: {
            totalUsers,
            avgBounceRate: +avgBounceRate.toFixed(1),
            avgSessionDuration: rowCount > 0 ? Math.round(totalDuration / rowCount) : 0,
            newUsers: totalNewUsers,
            returningUsers: totalUsers - totalNewUsers,
            pagesPerSession: totalSessions > 0 ? +(totalPageViews / totalSessions).toFixed(1) : 0,
        },
        traffic,
        channels,
    };
}
