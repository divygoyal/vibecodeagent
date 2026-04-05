/**
 * Report Data Fetcher — orchestrates parallel GA4 + GSC API calls
 * to gather all raw data needed for the weekly/monthly analytics report.
 */

import { runGAReport } from '@/lib/googleApi';

// Re-export the GSC query helper for use in this module (it's not exported from googleApi)
// We replicate a lightweight version here that uses the same pattern.
const GSC_BASE = 'https://www.googleapis.com/webmasters/v3';

async function gscQuery(
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
    const res = await fetch(
        `${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        }
    );
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GSC query failed (${res.status}): ${text}`);
    }
    return res.json();
}

// ─── Types ───

export interface ReportPeriod {
    type: 'weekly' | 'monthly';
    startDate: string;
    endDate: string;
    prevStartDate: string;
    prevEndDate: string;
}

export interface DailyMetric {
    date: string;
    activeUsers: number;
    sessions: number;
    pageviews: number;
    bounceRate: number;
    avgSessionDuration: number;
    newUsers: number;
}

export interface DailyGSCMetric {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface ChannelMetric {
    channel: string;
    sessions: number;
    users: number;
}

export interface PageMetric {
    page: string;
    sessions: number;
    users: number;
    bounceRate: number;
}

export interface CountryMetric {
    country: string;
    users: number;
    sessions: number;
}

export interface DeviceMetric {
    device: string;
    sessions: number;
    users: number;
}

export interface GSCQueryMetric {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface GSCQueryPageMetric {
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface GSCPageMetric {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface ReportRawData {
    period: ReportPeriod;
    siteUrl: string;
    propertyId: string;

    ga4: {
        dailyCurrent: DailyMetric[];
        dailyPrev: DailyMetric[];
        channelsCurrent: ChannelMetric[];
        channelsPrev: ChannelMetric[];
        pagesCurrent: PageMetric[];
        countriesCurrent: CountryMetric[];
        countriesPrev: CountryMetric[];
        devicesCurrent: DeviceMetric[];
        devicesPrev: DeviceMetric[];
        newUsersCurrent: number;
        totalUsersCurrent: number;
    };

    gsc: {
        dailyCurrent: DailyGSCMetric[];
        dailyPrev: DailyGSCMetric[];
        queriesCurrent: GSCQueryMetric[];
        queriesPrev: GSCQueryMetric[];
        queryPageCurrent: GSCQueryPageMetric[];
        pagesCurrent: GSCPageMetric[];
        pagesPrev: GSCPageMetric[];
    };
}

// ─── Helpers ───

function fmtDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

export function computePeriod(type: 'weekly' | 'monthly'): ReportPeriod {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() - 1); // yesterday (full day)

    const days = type === 'weekly' ? 7 : 30;
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);

    return {
        type,
        startDate: fmtDate(start),
        endDate: fmtDate(end),
        prevStartDate: fmtDate(prevStart),
        prevEndDate: fmtDate(prevEnd),
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGARows(rows: any[], dimNames: string[], metNames: string[]): Record<string, string | number>[] {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(row => {
        const obj: Record<string, string | number> = {};
        (row.dimensionValues || []).forEach((dv: { value: string }, i: number) => {
            obj[dimNames[i]] = dv.value;
        });
        (row.metricValues || []).forEach((mv: { value: string }, i: number) => {
            obj[metNames[i]] = parseFloat(mv.value) || 0;
        });
        return obj;
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseGSCRows(rows: any[], dimNames: string[]): Record<string, string | number>[] {
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(row => {
        const obj: Record<string, string | number> = {
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: row.ctr || 0,
            position: row.position || 0,
        };
        (row.keys || []).forEach((key: string, i: number) => {
            obj[dimNames[i]] = key;
        });
        return obj;
    });
}

// ─── Main Fetcher ───

export async function fetchReportData(
    accessToken: string,
    propertyId: string,
    siteUrl: string,
    period: ReportPeriod
): Promise<ReportRawData> {
    const { startDate, endDate, prevStartDate, prevEndDate } = period;

    const ga4Dims = {
        daily: ['date'],
        dailyChannel: ['date', 'sessionDefaultChannelGroup'],
        dailyPage: ['date', 'pagePath'],
        dailyCountry: ['date', 'country'],
        dailyDevice: ['date', 'deviceCategory'],
        channels: ['sessionDefaultChannelGroup'],
        pages: ['pagePath'],
        countries: ['country'],
        devices: ['deviceCategory'],
    };

    const ga4Metrics = ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'];
    const ga4MetricsShort = ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate'];

    const [
        dailyCurrentRaw,
        dailyPrevRaw,
        channelsCurrentRaw,
        channelsPrevRaw,
        pagesCurrentRaw,
        countriesCurrentRaw,
        countriesPrevRaw,
        devicesCurrentRaw,
        devicesPrevRaw,
        gscDailyCurrent,
        gscDailyPrev,
        gscQueriesCurrent,
        gscQueriesPrev,
        gscQueryPageCurrent,
        gscPagesCurrent,
        gscPagesPrev,
    ] = await Promise.all([
        // GA4: daily metrics current period
        runGAReport(accessToken, propertyId, ga4Dims.daily, ga4Metrics, startDate, endDate, 100),
        // GA4: daily metrics previous period
        runGAReport(accessToken, propertyId, ga4Dims.daily, ga4MetricsShort, prevStartDate, prevEndDate, 100),
        // GA4: channels current
        runGAReport(accessToken, propertyId, ga4Dims.channels, ['sessions', 'activeUsers'], startDate, endDate, 20, 'sessions'),
        // GA4: channels prev
        runGAReport(accessToken, propertyId, ga4Dims.channels, ['sessions', 'activeUsers'], prevStartDate, prevEndDate, 20, 'sessions'),
        // GA4: top pages current
        runGAReport(accessToken, propertyId, ['pagePath'], ['sessions', 'activeUsers', 'bounceRate'], startDate, endDate, 50, 'sessions'),
        // GA4: countries current
        runGAReport(accessToken, propertyId, ga4Dims.countries, ['activeUsers', 'sessions'], startDate, endDate, 30, 'activeUsers'),
        // GA4: countries prev
        runGAReport(accessToken, propertyId, ga4Dims.countries, ['activeUsers', 'sessions'], prevStartDate, prevEndDate, 30, 'activeUsers'),
        // GA4: devices current
        runGAReport(accessToken, propertyId, ga4Dims.devices, ['sessions', 'activeUsers'], startDate, endDate, 5, 'sessions'),
        // GA4: devices prev
        runGAReport(accessToken, propertyId, ga4Dims.devices, ['sessions', 'activeUsers'], prevStartDate, prevEndDate, 5, 'sessions'),
        // GSC: daily trend current
        gscQuery(accessToken, siteUrl, ['date'], startDate, endDate, 1000),
        // GSC: daily trend prev
        gscQuery(accessToken, siteUrl, ['date'], prevStartDate, prevEndDate, 1000),
        // GSC: top queries current
        gscQuery(accessToken, siteUrl, ['query'], startDate, endDate, 200),
        // GSC: top queries prev
        gscQuery(accessToken, siteUrl, ['query'], prevStartDate, prevEndDate, 200),
        // GSC: query+page for cannibalization
        gscQuery(accessToken, siteUrl, ['query', 'page'], startDate, endDate, 500),
        // GSC: pages current
        gscQuery(accessToken, siteUrl, ['page'], startDate, endDate, 100),
        // GSC: pages prev
        gscQuery(accessToken, siteUrl, ['page'], prevStartDate, prevEndDate, 100),
    ]);

    // Parse GA4 rows
    const dailyCurrent = parseGARows(dailyCurrentRaw?.rows, ['date'], ga4Metrics).map(r => ({
        date: r.date,
        activeUsers: r.activeUsers,
        sessions: r.sessions,
        pageviews: r.screenPageViews,
        bounceRate: r.bounceRate,
        avgSessionDuration: r.averageSessionDuration,
        newUsers: r.newUsers,
    })) as DailyMetric[];

    const dailyPrev = parseGARows(dailyPrevRaw?.rows, ['date'], ga4MetricsShort).map(r => ({
        date: r.date,
        activeUsers: r.activeUsers,
        sessions: r.sessions,
        pageviews: r.screenPageViews,
        bounceRate: r.bounceRate,
        avgSessionDuration: 0,
        newUsers: 0,
    })) as DailyMetric[];

    const channelsCurrent = parseGARows(channelsCurrentRaw?.rows, ['channel'], ['sessions', 'users']).map(r => ({
        channel: r.channel, sessions: r.sessions, users: r.users,
    })) as ChannelMetric[];

    const channelsPrev = parseGARows(channelsPrevRaw?.rows, ['channel'], ['sessions', 'users']).map(r => ({
        channel: r.channel, sessions: r.sessions, users: r.users,
    })) as ChannelMetric[];

    const pagesCurrent = parseGARows(pagesCurrentRaw?.rows, ['page'], ['sessions', 'users', 'bounceRate']).map(r => ({
        page: r.page, sessions: r.sessions, users: r.users, bounceRate: r.bounceRate,
    })) as PageMetric[];

    const countriesCurrent = parseGARows(countriesCurrentRaw?.rows, ['country'], ['users', 'sessions']).map(r => ({
        country: r.country, users: r.users, sessions: r.sessions,
    })) as CountryMetric[];

    const countriesPrev = parseGARows(countriesPrevRaw?.rows, ['country'], ['users', 'sessions']).map(r => ({
        country: r.country, users: r.users, sessions: r.sessions,
    })) as CountryMetric[];

    const devicesCurrent = parseGARows(devicesCurrentRaw?.rows, ['device'], ['sessions', 'users']).map(r => ({
        device: r.device, sessions: r.sessions, users: r.users,
    })) as DeviceMetric[];

    const devicesPrev = parseGARows(devicesPrevRaw?.rows, ['device'], ['sessions', 'users']).map(r => ({
        device: r.device, sessions: r.sessions, users: r.users,
    })) as DeviceMetric[];

    const totalUsersCurrent = dailyCurrent.reduce((s, d) => s + d.activeUsers, 0);
    const newUsersCurrent = dailyCurrent.reduce((s, d) => s + d.newUsers, 0);

    // Parse GSC rows (cast through unknown since parseGSCRows returns generic records)
    const gscDailyCurrentParsed = parseGSCRows(gscDailyCurrent?.rows, ['date']) as unknown as DailyGSCMetric[];
    const gscDailyPrevParsed = parseGSCRows(gscDailyPrev?.rows, ['date']) as unknown as DailyGSCMetric[];
    const gscQueriesCurrentParsed = parseGSCRows(gscQueriesCurrent?.rows, ['query']) as unknown as GSCQueryMetric[];
    const gscQueriesPrevParsed = parseGSCRows(gscQueriesPrev?.rows, ['query']) as unknown as GSCQueryMetric[];
    const gscQueryPageCurrentParsed = parseGSCRows(gscQueryPageCurrent?.rows, ['query', 'page']) as unknown as GSCQueryPageMetric[];
    const gscPagesCurrentParsed = parseGSCRows(gscPagesCurrent?.rows, ['page']) as unknown as GSCPageMetric[];
    const gscPagesPrevParsed = parseGSCRows(gscPagesPrev?.rows, ['page']) as unknown as GSCPageMetric[];

    return {
        period,
        siteUrl,
        propertyId,
        ga4: {
            dailyCurrent,
            dailyPrev,
            channelsCurrent,
            channelsPrev,
            pagesCurrent,
            countriesCurrent,
            countriesPrev,
            devicesCurrent,
            devicesPrev,
            newUsersCurrent,
            totalUsersCurrent,
        },
        gsc: {
            dailyCurrent: gscDailyCurrentParsed,
            dailyPrev: gscDailyPrevParsed,
            queriesCurrent: gscQueriesCurrentParsed,
            queriesPrev: gscQueriesPrevParsed,
            queryPageCurrent: gscQueryPageCurrentParsed,
            pagesCurrent: gscPagesCurrentParsed,
            pagesPrev: gscPagesPrevParsed,
        },
    };
}
