/**
 * Report Analysis Engine — computes anomalies, keyword velocity,
 * traffic DNA shifts, decay signals, and cannibalization from raw data.
 */

import type { ReportRawData } from './reportDataFetcher';
import { expectedCTR } from './alertEngine';

// ─── Output Types ───

export interface KPISummary {
    users: number;
    usersDelta: number;
    sessions: number;
    sessionsDelta: number;
    clicks: number;
    clicksDelta: number;
    impressions: number;
    impressionsDelta: number;
    avgPosition: number;
    avgPositionDelta: number;
    bounceRate: number;
    bounceRateDelta: number;
    avgSessionDuration: number;
}

export interface AnomalyDay {
    date: string;
    dayName: string;
    metric: string;
    actual: number;
    expected: number;
    deviationPercent: number;
    severity: 'critical' | 'warning';
    topChannelShifts: Array<{ channel: string; delta: number }>;
    topPageShifts: Array<{ page: string; delta: number }>;
    topQueryShifts: Array<{ query: string; positionDelta: number; clickDelta: number }>;
}

export interface KeywordVelocityItem {
    query: string;
    currentPosition: number;
    prevPosition: number;
    positionDelta: number;
    currentClicks: number;
    prevClicks: number;
    clickDelta: number;
    currentImpressions: number;
    prevImpressions: number;
    impressionDelta: number;
    momentumScore: number;
}

export interface ChannelDNA {
    channel: string;
    currentShare: number;
    prevShare: number;
    shareDelta: number;
    currentSessions: number;
}

export interface DeviceDNA {
    device: string;
    currentShare: number;
    prevShare: number;
    shareDelta: number;
}

export interface CountryDNA {
    country: string;
    currentShare: number;
    prevShare: number;
    shareDelta: number;
    currentUsers: number;
}

export interface TrafficDNA {
    channels: ChannelDNA[];
    devices: DeviceDNA[];
    countries: CountryDNA[];
    topPageShare: number;
    topPage: string;
    newUserRatio: number;
}

export interface DecayPage {
    page: string;
    currentClicks: number;
    prevClicks: number;
    clickDelta: number;
    currentPosition: number;
    prevPosition: number;
    positionDelta: number;
}

export interface CannibalizationGroup {
    query: string;
    pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
    totalClicks: number;
    totalImpressions: number;
}

export interface OpportunityItem {
    query: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
    potentialClicks: number;
    type: 'striking_distance' | 'ctr_fix' | 'quick_win';
}

export interface ReportAnalysis {
    kpis: KPISummary;
    anomalies: AnomalyDay[];
    keywordVelocity: {
        accelerating: KeywordVelocityItem[];
        decelerating: KeywordVelocityItem[];
    };
    trafficDNA: TrafficDNA;
    decayPages: DecayPage[];
    cannibalization: CannibalizationGroup[];
    opportunities: OpportunityItem[];
    dailySessions: Array<{ date: string; sessions: number }>;
    dailyClicks: Array<{ date: string; clicks: number }>;
}

// ─── Helpers ───

function pctChange(current: number, prev: number): number {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100);
}

function sum(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
}

function avg(arr: number[]): number {
    return arr.length === 0 ? 0 : sum(arr) / arr.length;
}

function dayNameFromDate(dateStr: string): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(dateStr + 'T00:00:00');
    return days[d.getDay()];
}

// ─── KPI Summary ───

function computeKPIs(data: ReportRawData): KPISummary {
    const { ga4, gsc } = data;

    const users = sum(ga4.dailyCurrent.map(d => d.activeUsers));
    const prevUsers = sum(ga4.dailyPrev.map(d => d.activeUsers));
    const sessions = sum(ga4.dailyCurrent.map(d => d.sessions));
    const prevSessions = sum(ga4.dailyPrev.map(d => d.sessions));
    const bounceRate = avg(ga4.dailyCurrent.map(d => d.bounceRate));
    const prevBounceRate = avg(ga4.dailyPrev.map(d => d.bounceRate));
    const avgSessionDuration = avg(ga4.dailyCurrent.map(d => d.avgSessionDuration));

    const clicks = sum(gsc.dailyCurrent.map(d => d.clicks));
    const prevClicks = sum(gsc.dailyPrev.map(d => d.clicks));
    const impressions = sum(gsc.dailyCurrent.map(d => d.impressions));
    const prevImpressions = sum(gsc.dailyPrev.map(d => d.impressions));
    const avgPosition = avg(gsc.dailyCurrent.map(d => d.position));
    const prevAvgPosition = avg(gsc.dailyPrev.map(d => d.position));

    return {
        users,
        usersDelta: pctChange(users, prevUsers),
        sessions,
        sessionsDelta: pctChange(sessions, prevSessions),
        clicks,
        clicksDelta: pctChange(clicks, prevClicks),
        impressions,
        impressionsDelta: pctChange(impressions, prevImpressions),
        avgPosition: Math.round(avgPosition * 10) / 10,
        avgPositionDelta: Math.round((avgPosition - prevAvgPosition) * 10) / 10,
        bounceRate: Math.round(bounceRate * 100) / 100,
        bounceRateDelta: Math.round((bounceRate - prevBounceRate) * 100) / 100,
        avgSessionDuration: Math.round(avgSessionDuration),
    };
}

// ─── Anomaly Detection ───

function detectAnomalies(data: ReportRawData): AnomalyDay[] {
    const { ga4, gsc } = data;
    const anomalies: AnomalyDay[] = [];

    if (ga4.dailyCurrent.length < 3) return anomalies;

    const sessionValues = ga4.dailyCurrent.map(d => d.sessions);
    const meanSessions = avg(sessionValues);
    const stdDev = Math.sqrt(avg(sessionValues.map(v => Math.pow(v - meanSessions, 2))));

    if (stdDev < 1) return anomalies;

    const gscByDate = new Map(gsc.dailyCurrent.map(d => [d.date, d]));

    for (const day of ga4.dailyCurrent) {
        const zScore = (day.sessions - meanSessions) / stdDev;

        if (Math.abs(zScore) < 1.5) continue;

        const deviationPct = Math.round(((day.sessions - meanSessions) / meanSessions) * 100);
        const severity = Math.abs(zScore) >= 2.5 ? 'critical' as const : 'warning' as const;

        const gscDay = gscByDate.get(day.date);

        anomalies.push({
            date: day.date,
            dayName: dayNameFromDate(day.date),
            metric: 'sessions',
            actual: day.sessions,
            expected: Math.round(meanSessions),
            deviationPercent: deviationPct,
            severity,
            topChannelShifts: [],
            topPageShifts: [],
            topQueryShifts: gscDay ? [] : [],
        });
    }

    return anomalies
        .sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent))
        .slice(0, 3);
}

// ─── Keyword Velocity ───

function computeKeywordVelocity(data: ReportRawData): { accelerating: KeywordVelocityItem[]; decelerating: KeywordVelocityItem[] } {
    const { gsc } = data;
    const prevMap = new Map(gsc.queriesPrev.map(q => [q.query, q]));
    const items: KeywordVelocityItem[] = [];

    for (const current of gsc.queriesCurrent) {
        const prev = prevMap.get(current.query);
        if (!prev) continue;

        const positionDelta = current.position - prev.position;
        const clickDelta = current.clicks - prev.clicks;
        const impressionDelta = pctChange(current.impressions, prev.impressions);

        // Momentum: position improvement (negative is good) weighted heavily,
        // plus click growth, plus impression growth
        const momentumScore =
            (positionDelta < 0 ? Math.abs(positionDelta) * 10 : -positionDelta * 10) +
            (clickDelta * 2) +
            (impressionDelta > 0 ? impressionDelta : impressionDelta * 0.5);

        items.push({
            query: current.query,
            currentPosition: Math.round(current.position * 10) / 10,
            prevPosition: Math.round(prev.position * 10) / 10,
            positionDelta: Math.round(positionDelta * 10) / 10,
            currentClicks: current.clicks,
            prevClicks: prev.clicks,
            clickDelta,
            currentImpressions: current.impressions,
            prevImpressions: prev.impressions,
            impressionDelta,
            momentumScore: Math.round(momentumScore),
        });
    }

    const sorted = items.sort((a, b) => b.momentumScore - a.momentumScore);
    return {
        accelerating: sorted.filter(i => i.momentumScore > 0).slice(0, 5),
        decelerating: sorted.filter(i => i.momentumScore < 0).sort((a, b) => a.momentumScore - b.momentumScore).slice(0, 5),
    };
}

// ─── Traffic DNA ───

function computeTrafficDNA(data: ReportRawData): TrafficDNA {
    const { ga4 } = data;

    const totalSessionsCurrent = sum(ga4.channelsCurrent.map(c => c.sessions));
    const totalSessionsPrev = sum(ga4.channelsPrev.map(c => c.sessions));
    const prevChannelMap = new Map(ga4.channelsPrev.map(c => [c.channel, c]));

    const channels: ChannelDNA[] = ga4.channelsCurrent.map(c => {
        const currentShare = totalSessionsCurrent > 0 ? (c.sessions / totalSessionsCurrent) * 100 : 0;
        const prev = prevChannelMap.get(c.channel);
        const prevShare = prev && totalSessionsPrev > 0 ? (prev.sessions / totalSessionsPrev) * 100 : 0;
        return {
            channel: c.channel,
            currentShare: Math.round(currentShare * 10) / 10,
            prevShare: Math.round(prevShare * 10) / 10,
            shareDelta: Math.round((currentShare - prevShare) * 10) / 10,
            currentSessions: c.sessions,
        };
    }).sort((a, b) => b.currentShare - a.currentShare);

    const totalDevicesCurrent = sum(ga4.devicesCurrent.map(d => d.sessions));
    const totalDevicesPrev = sum(ga4.devicesPrev.map(d => d.sessions));
    const prevDeviceMap = new Map(ga4.devicesPrev.map(d => [d.device, d]));

    const devices: DeviceDNA[] = ga4.devicesCurrent.map(d => {
        const currentShare = totalDevicesCurrent > 0 ? (d.sessions / totalDevicesCurrent) * 100 : 0;
        const prev = prevDeviceMap.get(d.device);
        const prevShare = prev && totalDevicesPrev > 0 ? (prev.sessions / totalDevicesPrev) * 100 : 0;
        return {
            device: d.device,
            currentShare: Math.round(currentShare * 10) / 10,
            prevShare: Math.round(prevShare * 10) / 10,
            shareDelta: Math.round((currentShare - prevShare) * 10) / 10,
        };
    }).sort((a, b) => b.currentShare - a.currentShare);

    const totalUsersCurrent = sum(ga4.countriesCurrent.map(c => c.users));
    const totalUsersPrev = sum(ga4.countriesPrev.map(c => c.users));
    const prevCountryMap = new Map(ga4.countriesPrev.map(c => [c.country, c]));

    const countries: CountryDNA[] = ga4.countriesCurrent.slice(0, 5).map(c => {
        const currentShare = totalUsersCurrent > 0 ? (c.users / totalUsersCurrent) * 100 : 0;
        const prev = prevCountryMap.get(c.country);
        const prevShare = prev && totalUsersPrev > 0 ? (prev.users / totalUsersPrev) * 100 : 0;
        return {
            country: c.country,
            currentShare: Math.round(currentShare * 10) / 10,
            prevShare: Math.round(prevShare * 10) / 10,
            shareDelta: Math.round((currentShare - prevShare) * 10) / 10,
            currentUsers: c.users,
        };
    });

    const topPage = ga4.pagesCurrent[0];
    const topPageShare = topPage && totalSessionsCurrent > 0
        ? Math.round((topPage.sessions / totalSessionsCurrent) * 100)
        : 0;

    return {
        channels,
        devices,
        countries,
        topPageShare,
        topPage: topPage?.page || '/',
        newUserRatio: ga4.totalUsersCurrent > 0
            ? Math.round((ga4.newUsersCurrent / ga4.totalUsersCurrent) * 100)
            : 0,
    };
}

// ─── Content Decay ───

function detectDecay(data: ReportRawData): DecayPage[] {
    const prevMap = new Map(data.gsc.pagesPrev.map(p => [p.page, p]));
    const decay: DecayPage[] = [];

    for (const page of data.gsc.pagesCurrent) {
        const prev = prevMap.get(page.page);
        if (!prev) continue;
        if (prev.clicks < 5) continue;

        const clickDelta = page.clicks - prev.clicks;
        const positionDelta = page.position - prev.position;

        if (clickDelta < -3 && positionDelta > 1) {
            decay.push({
                page: page.page,
                currentClicks: page.clicks,
                prevClicks: prev.clicks,
                clickDelta,
                currentPosition: Math.round(page.position * 10) / 10,
                prevPosition: Math.round(prev.position * 10) / 10,
                positionDelta: Math.round(positionDelta * 10) / 10,
            });
        }
    }

    return decay.sort((a, b) => a.clickDelta - b.clickDelta).slice(0, 10);
}

// ─── Cannibalization ───

function detectCannibalization(data: ReportRawData): CannibalizationGroup[] {
    const queryPages = new Map<string, Array<{ page: string; clicks: number; impressions: number; position: number }>>();

    for (const row of data.gsc.queryPageCurrent) {
        if (!queryPages.has(row.query)) {
            queryPages.set(row.query, []);
        }
        queryPages.get(row.query)!.push({
            page: row.page,
            clicks: row.clicks,
            impressions: row.impressions,
            position: row.position,
        });
    }

    const groups: CannibalizationGroup[] = [];
    for (const [query, pages] of queryPages) {
        if (pages.length < 2) continue;
        const totalImpressions = sum(pages.map(p => p.impressions));
        if (totalImpressions < 50) continue;

        groups.push({
            query,
            pages: pages.sort((a, b) => b.clicks - a.clicks),
            totalClicks: sum(pages.map(p => p.clicks)),
            totalImpressions,
        });
    }

    return groups.sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, 10);
}

// ─── Opportunities ───

function computeOpportunities(data: ReportRawData): OpportunityItem[] {
    const opps: OpportunityItem[] = [];

    for (const q of data.gsc.queriesCurrent) {
        const expected = expectedCTR(q.position);
        const potentialClicks = Math.round((expected / 100) * q.impressions);
        // GSC raw API returns ctr as a decimal (0.05 = 5%), convert to percentage for comparison
        const ctrPct = q.ctr * 100;

        if (q.position > 3 && q.position <= 20 && q.impressions > 50) {
            opps.push({ ...q, potentialClicks, type: 'striking_distance' });
        } else if (q.position <= 5 && ctrPct < expected * 0.5 && q.impressions > 100) {
            opps.push({ ...q, potentialClicks, type: 'ctr_fix' });
        } else if (q.position > 10 && q.position <= 15 && q.impressions > 200) {
            opps.push({ ...q, potentialClicks, type: 'quick_win' });
        }
    }

    return opps.sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, 15);
}

// ─── Main Analysis ───

export function analyzeReportData(data: ReportRawData): ReportAnalysis {
    return {
        kpis: computeKPIs(data),
        anomalies: detectAnomalies(data),
        keywordVelocity: computeKeywordVelocity(data),
        trafficDNA: computeTrafficDNA(data),
        decayPages: detectDecay(data),
        cannibalization: detectCannibalization(data),
        opportunities: computeOpportunities(data),
        dailySessions: data.ga4.dailyCurrent.map(d => ({ date: d.date, sessions: d.sessions })),
        dailyClicks: data.gsc.dailyCurrent.map(d => ({ date: d.date, clicks: d.clicks })),
    };
}
