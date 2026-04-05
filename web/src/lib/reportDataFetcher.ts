/**
 * Report Data Fetcher — orchestrates parallel GA4 + GSC API calls
 * to gather all raw data needed for the weekly/monthly analytics report.
 */

import { runGAReport } from '@/lib/googleApi';

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
        pagesPrev: PageMetric[];
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

/** GA4 returns dates as YYYYMMDD — normalize to ISO YYYY-MM-DD */
function normalizeDate(d: string): string {
    if (typeof d === 'string' && /^\d{8}$/.test(d)) {
        return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
    return String(d);
}

/** Filter out non-Latin keywords that would render as garbled in Helvetica PDFs */
export function isLatinSafe(text: string): boolean {
    return /^[\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]+$/.test(text);
}

export function computePeriod(type: 'weekly' | 'monthly'): ReportPeriod {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() - 1);

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
            const name = dimNames[i];
            obj[name] = name === 'date' ? normalizeDate(dv.value) : dv.value;
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

    const ga4Metrics = ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate', 'averageSessionDuration', 'newUsers'];
    const ga4MetricsShort = ['activeUsers', 'sessions', 'screenPageViews', 'bounceRate'];

    const [
        dailyCurrentRaw,
        dailyPrevRaw,
        channelsCurrentRaw,
        channelsPrevRaw,
        pagesCurrentRaw,
        pagesPrevRaw,
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
        runGAReport(accessToken, propertyId, ['date'], ga4Metrics, startDate, endDate, 100),
        runGAReport(accessToken, propertyId, ['date'], ga4MetricsShort, prevStartDate, prevEndDate, 100),
        runGAReport(accessToken, propertyId, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], startDate, endDate, 20, 'sessions'),
        runGAReport(accessToken, propertyId, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers'], prevStartDate, prevEndDate, 20, 'sessions'),
        runGAReport(accessToken, propertyId, ['pagePath'], ['sessions', 'activeUsers', 'bounceRate', 'averageSessionDuration'], startDate, endDate, 100, 'sessions'),
        runGAReport(accessToken, propertyId, ['pagePath'], ['sessions', 'activeUsers', 'bounceRate'], prevStartDate, prevEndDate, 100, 'sessions'),
        runGAReport(accessToken, propertyId, ['country'], ['activeUsers', 'sessions'], startDate, endDate, 30, 'activeUsers'),
        runGAReport(accessToken, propertyId, ['country'], ['activeUsers', 'sessions'], prevStartDate, prevEndDate, 30, 'activeUsers'),
        runGAReport(accessToken, propertyId, ['deviceCategory'], ['sessions', 'activeUsers'], startDate, endDate, 5, 'sessions'),
        runGAReport(accessToken, propertyId, ['deviceCategory'], ['sessions', 'activeUsers'], prevStartDate, prevEndDate, 5, 'sessions'),
        gscQuery(accessToken, siteUrl, ['date'], startDate, endDate, 1000),
        gscQuery(accessToken, siteUrl, ['date'], prevStartDate, prevEndDate, 1000),
        gscQuery(accessToken, siteUrl, ['query'], startDate, endDate, 500),
        gscQuery(accessToken, siteUrl, ['query'], prevStartDate, prevEndDate, 500),
        gscQuery(accessToken, siteUrl, ['query', 'page'], startDate, endDate, 1000),
        gscQuery(accessToken, siteUrl, ['page'], startDate, endDate, 200),
        gscQuery(accessToken, siteUrl, ['page'], prevStartDate, prevEndDate, 200),
    ]);

    const dailyCurrent = parseGARows(dailyCurrentRaw?.rows, ['date'], ga4Metrics).map(r => ({
        date: r.date as string,
        activeUsers: r.activeUsers as number,
        sessions: r.sessions as number,
        pageviews: r.screenPageViews as number,
        bounceRate: r.bounceRate as number,
        avgSessionDuration: r.averageSessionDuration as number,
        newUsers: r.newUsers as number,
    }));

    const dailyPrev = parseGARows(dailyPrevRaw?.rows, ['date'], ga4MetricsShort).map(r => ({
        date: r.date as string,
        activeUsers: r.activeUsers as number,
        sessions: r.sessions as number,
        pageviews: r.screenPageViews as number,
        bounceRate: r.bounceRate as number,
        avgSessionDuration: 0,
        newUsers: 0,
    }));

    const channelsCurrent = parseGARows(channelsCurrentRaw?.rows, ['channel'], ['sessions', 'users']).map(r => ({
        channel: r.channel as string, sessions: r.sessions as number, users: r.users as number,
    }));

    const channelsPrev = parseGARows(channelsPrevRaw?.rows, ['channel'], ['sessions', 'users']).map(r => ({
        channel: r.channel as string, sessions: r.sessions as number, users: r.users as number,
    }));

    const pagesCurrent = parseGARows(pagesCurrentRaw?.rows, ['page'], ['sessions', 'users', 'bounceRate', 'avgSessionDuration']).map(r => ({
        page: r.page as string, sessions: r.sessions as number, users: r.users as number, bounceRate: r.bounceRate as number,
    }));

    const pagesPrev = parseGARows(pagesPrevRaw?.rows, ['page'], ['sessions', 'users', 'bounceRate']).map(r => ({
        page: r.page as string, sessions: r.sessions as number, users: r.users as number, bounceRate: r.bounceRate as number,
    }));

    const countriesCurrent = parseGARows(countriesCurrentRaw?.rows, ['country'], ['users', 'sessions']).map(r => ({
        country: r.country as string, users: r.users as number, sessions: r.sessions as number,
    }));

    const countriesPrev = parseGARows(countriesPrevRaw?.rows, ['country'], ['users', 'sessions']).map(r => ({
        country: r.country as string, users: r.users as number, sessions: r.sessions as number,
    }));

    const devicesCurrent = parseGARows(devicesCurrentRaw?.rows, ['device'], ['sessions', 'users']).map(r => ({
        device: r.device as string, sessions: r.sessions as number, users: r.users as number,
    }));

    const devicesPrev = parseGARows(devicesPrevRaw?.rows, ['device'], ['sessions', 'users']).map(r => ({
        device: r.device as string, sessions: r.sessions as number, users: r.users as number,
    }));

    const totalUsersCurrent = dailyCurrent.reduce((s, d) => s + d.activeUsers, 0);
    const newUsersCurrent = dailyCurrent.reduce((s, d) => s + d.newUsers, 0);

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
            pagesPrev,
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
