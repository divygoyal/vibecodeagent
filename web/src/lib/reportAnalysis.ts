/**
 * Report Analysis Engine — computes anomalies, keyword velocity,
 * traffic DNA shifts, decay signals, cannibalization, opportunities,
 * page grades, and structured fix prompts from raw data.
 */

import type { ReportRawData } from './reportDataFetcher';
import { isLatinSafe } from './reportDataFetcher';
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
    newUserRatio: number;
    pageviews: number;
    pageviewsDelta: number;
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
    ctrGap: number;
    actualCtr: number;
    expectedCtr: number;
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
    decayRate: number;
    currentImpressions: number;
    currentCtr: number;
}

export interface CannibalizationGroup {
    query: string;
    pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
    totalClicks: number;
    totalImpressions: number;
    winner: string;
}

export interface OpportunityItem {
    query: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
    potentialClicks: number;
    revenueEstimate: number;
    type: 'striking_distance' | 'ctr_fix' | 'quick_win';
}

export interface PageGrade {
    page: string;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    clickDelta: number;
    positionDelta: number;
    bounceRate: number | null;
    sessions: number | null;
}

export interface FixPrompt {
    id: string;
    title: string;
    context: string;
    prompt: string;
    category: 'decay' | 'cannibalization' | 'keyword' | 'ctr' | 'opportunity';
}

export interface CriticalAlert {
    severity: 'critical' | 'danger' | 'warning';
    title: string;
    detail: string;
    metric: string;
}

export interface NewLostKeyword {
    query: string;
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
}

export interface ReportAnalysis {
    reportMode: ReportRawData['reportMode'];
    hasGa4: boolean;
    kpis: KPISummary;
    anomalies: AnomalyDay[];
    criticalAlerts: CriticalAlert[];
    keywordVelocity: {
        accelerating: KeywordVelocityItem[];
        decelerating: KeywordVelocityItem[];
        newKeywords: NewLostKeyword[];
        lostKeywords: NewLostKeyword[];
    };
    trafficDNA: TrafficDNA;
    decayPages: DecayPage[];
    cannibalization: CannibalizationGroup[];
    opportunities: OpportunityItem[];
    pageGrades: PageGrade[];
    fixPrompts: FixPrompt[];
    dailySessions: Array<{ date: string; sessions: number }>;
    dailyClicks: Array<{ date: string; clicks: number }>;
    dailyImpressions: Array<{ date: string; impressions: number }>;
    totalRevenueEstimate: number;
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
    if (isNaN(d.getTime())) return dateStr;
    return days[d.getDay()];
}

function truncatePath(path: string, maxLen = 60): string {
    if (path.length <= maxLen) return path;
    return path.slice(0, maxLen - 3) + '...';
}

// CPC tiers by keyword intent heuristic
function estimateCPC(query: string): number {
    const q = query.toLowerCase();
    if (/buy|price|cheap|deal|discount|shop|order|coupon/.test(q)) return 2.5;
    if (/best|top|review|compare|vs|alternative/.test(q)) return 1.5;
    if (/how to|what is|guide|tutorial|learn/.test(q)) return 0.3;
    return 0.5;
}

// ─── KPI Summary ───

function computeKPIs(data: ReportRawData): KPISummary {
    const { ga4, gsc } = data;

    const users = sum(ga4.dailyCurrent.map(d => d.activeUsers));
    const prevUsers = sum(ga4.dailyPrev.map(d => d.activeUsers));
    const sessions = sum(ga4.dailyCurrent.map(d => d.sessions));
    const prevSessions = sum(ga4.dailyPrev.map(d => d.sessions));
    const pageviews = sum(ga4.dailyCurrent.map(d => d.pageviews));
    const prevPageviews = sum(ga4.dailyPrev.map(d => d.pageviews));
    const bounceRate = avg(ga4.dailyCurrent.map(d => d.bounceRate));
    const prevBounceRate = avg(ga4.dailyPrev.map(d => d.bounceRate));
    const avgSessionDuration = avg(ga4.dailyCurrent.map(d => d.avgSessionDuration));

    const clicks = sum(gsc.dailyCurrent.map(d => d.clicks));
    const prevClicks = sum(gsc.dailyPrev.map(d => d.clicks));
    const impressions = sum(gsc.dailyCurrent.map(d => d.impressions));
    const prevImpressions = sum(gsc.dailyPrev.map(d => d.impressions));
    const avgPosition = avg(gsc.dailyCurrent.map(d => d.position));
    const prevAvgPosition = avg(gsc.dailyPrev.map(d => d.position));

    const newUserRatio = ga4.totalUsersCurrent > 0
        ? Math.round((ga4.newUsersCurrent / ga4.totalUsersCurrent) * 100)
        : 0;

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
        newUserRatio,
        pageviews,
        pageviewsDelta: pctChange(pageviews, prevPageviews),
    };
}

// ─── Anomaly Detection ───

function detectAnomalies(data: ReportRawData): AnomalyDay[] {
    if (!data.hasGa4) return [];

    const { ga4, gsc } = data;
    const anomalies: AnomalyDay[] = [];

    if (ga4.dailyCurrent.length < 3) return anomalies;

    const sessionValues = ga4.dailyCurrent.map(d => d.sessions);
    const meanSessions = avg(sessionValues);
    const stdDev = Math.sqrt(avg(sessionValues.map(v => Math.pow(v - meanSessions, 2))));

    if (stdDev < 1) return anomalies;

    const gscByDate = new Map(gsc.dailyCurrent.map(d => [d.date, d]));

    // Build per-channel average for shift detection
    const channelTotals = new Map<string, number[]>();
    const totalSessionsByDay = new Map<string, number>();
    for (const day of ga4.dailyCurrent) {
        totalSessionsByDay.set(day.date, day.sessions);
    }

    for (const day of ga4.dailyCurrent) {
        const zScore = (day.sessions - meanSessions) / stdDev;

        if (Math.abs(zScore) < 1.5) continue;

        const deviationPct = Math.round(((day.sessions - meanSessions) / meanSessions) * 100);
        const severity = Math.abs(zScore) >= 2.5 ? 'critical' as const : 'warning' as const;

        const gscDay = gscByDate.get(day.date);

        // Infer shifts from the day's deviation context
        const topChannelShifts: AnomalyDay['topChannelShifts'] = [];
        const topPageShifts: AnomalyDay['topPageShifts'] = [];
        const topQueryShifts: AnomalyDay['topQueryShifts'] = [];

        // Use available aggregate data to provide context
        if (gscDay) {
            const gscMeanClicks = avg(gsc.dailyCurrent.map(d => d.clicks));
            const clickDeviation = gscDay.clicks - gscMeanClicks;
            if (Math.abs(clickDeviation) > gscMeanClicks * 0.2) {
                topQueryShifts.push({
                    query: '(organic search overall)',
                    positionDelta: 0,
                    clickDelta: Math.round(clickDeviation),
                });
            }
        }

        anomalies.push({
            date: day.date,
            dayName: dayNameFromDate(day.date),
            metric: 'sessions',
            actual: day.sessions,
            expected: Math.round(meanSessions),
            deviationPercent: deviationPct,
            severity,
            topChannelShifts,
            topPageShifts,
            topQueryShifts,
        });
    }

    // Suppress unused variable warnings
    void channelTotals;

    return anomalies
        .sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent))
        .slice(0, 5);
}

// ─── Keyword Velocity ───

function computeKeywordVelocity(data: ReportRawData): ReportAnalysis['keywordVelocity'] {
    const { gsc } = data;
    const prevMap = new Map(gsc.queriesPrev.map(q => [q.query, q]));
    const currentSet = new Set(gsc.queriesCurrent.map(q => q.query));
    const items: KeywordVelocityItem[] = [];

    for (const current of gsc.queriesCurrent) {
        const prev = prevMap.get(current.query);
        if (!prev) continue;
        if (!isLatinSafe(current.query)) continue;

        const positionDelta = current.position - prev.position;
        const clickDelta = current.clicks - prev.clicks;
        const impressionDelta = pctChange(current.impressions, prev.impressions);

        const momentumScore =
            (positionDelta < 0 ? Math.abs(positionDelta) * 10 : -positionDelta * 10) +
            (clickDelta * 2) +
            (impressionDelta > 0 ? impressionDelta : impressionDelta * 0.5);

        const expected = expectedCTR(current.position);
        const actualCtrPct = current.ctr * 100;
        const ctrGap = Math.round((actualCtrPct - expected) * 10) / 10;

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
            ctrGap,
            actualCtr: Math.round(actualCtrPct * 10) / 10,
            expectedCtr: Math.round(expected * 10) / 10,
        });
    }

    const newKeywords: NewLostKeyword[] = gsc.queriesCurrent
        .filter(q => !prevMap.has(q.query) && isLatinSafe(q.query))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10)
        .map(q => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10, ctr: Math.round(q.ctr * 10000) / 100 }));

    const lostKeywords: NewLostKeyword[] = gsc.queriesPrev
        .filter(q => !currentSet.has(q.query) && isLatinSafe(q.query))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10)
        .map(q => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: Math.round(q.position * 10) / 10, ctr: Math.round(q.ctr * 10000) / 100 }));

    const sorted = items.sort((a, b) => b.momentumScore - a.momentumScore);
    return {
        accelerating: sorted.filter(i => i.momentumScore > 0).slice(0, 10),
        decelerating: sorted.filter(i => i.momentumScore < 0).sort((a, b) => a.momentumScore - b.momentumScore).slice(0, 10),
        newKeywords,
        lostKeywords,
    };
}

// ─── Traffic DNA ───

function computeTrafficDNA(data: ReportRawData): TrafficDNA {
    if (!data.hasGa4) {
        return {
            channels: [],
            devices: [],
            countries: [],
            topPageShare: 0,
            topPage: '/',
            newUserRatio: 0,
        };
    }

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

        const clickDelta = page.clicks - prev.clicks;
        const positionDelta = page.position - prev.position;
        const decayRate = prev.clicks > 0 ? Math.round((clickDelta / prev.clicks) * 100) : 0;

        const isDecaying = (prev.clicks >= 3 && clickDelta < -2 && positionDelta > 0.5)
            || (prev.clicks >= 1 && clickDelta < 0 && decayRate <= -50)
            || (prev.clicks >= 1 && clickDelta < -1 && positionDelta > 1);

        if (isDecaying) {
            decay.push({
                page: truncatePath(page.page),
                currentClicks: page.clicks,
                prevClicks: prev.clicks,
                clickDelta,
                currentPosition: Math.round(page.position * 10) / 10,
                prevPosition: Math.round(prev.position * 10) / 10,
                positionDelta: Math.round(positionDelta * 10) / 10,
                decayRate,
                currentImpressions: page.impressions,
                currentCtr: Math.round(page.ctr * 10000) / 100,
            });
        }
    }

    return decay.sort((a, b) => a.clickDelta - b.clickDelta).slice(0, 15);
}

// ─── Cannibalization ───

function detectCannibalization(data: ReportRawData): CannibalizationGroup[] {
    const queryPages = new Map<string, Array<{ page: string; clicks: number; impressions: number; position: number }>>();

    for (const row of data.gsc.queryPageCurrent) {
        if (!isLatinSafe(row.query)) continue;
        if (!queryPages.has(row.query)) {
            queryPages.set(row.query, []);
        }
        queryPages.get(row.query)!.push({
            page: truncatePath(row.page),
            clicks: row.clicks,
            impressions: row.impressions,
            position: Math.round(row.position * 10) / 10,
        });
    }

    const groups: CannibalizationGroup[] = [];
    for (const [query, pages] of queryPages) {
        if (pages.length < 2) continue;
        const totalImpressions = sum(pages.map(p => p.impressions));
        if (totalImpressions < 5) continue;

        const sorted = pages.sort((a, b) => b.clicks - a.clicks);
        groups.push({
            query,
            pages: sorted,
            totalClicks: sum(pages.map(p => p.clicks)),
            totalImpressions,
            winner: sorted[0].page,
        });
    }

    return groups.sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, 15);
}

// ─── Opportunities ───

function computeOpportunities(data: ReportRawData): OpportunityItem[] {
    const opps: OpportunityItem[] = [];

    for (const q of data.gsc.queriesCurrent) {
        if (!isLatinSafe(q.query)) continue;

        const expected = expectedCTR(q.position);
        const potentialClicks = Math.round((expected / 100) * q.impressions);
        const ctrPct = q.ctr * 100;
        const cpc = estimateCPC(q.query);
        const revenueEstimate = Math.round(potentialClicks * cpc * 100) / 100;

        if (q.position > 3 && q.position <= 20 && q.impressions >= 5) {
            opps.push({ ...q, potentialClicks, revenueEstimate, type: 'striking_distance' });
        } else if (q.position <= 5 && ctrPct < expected * 0.5 && q.impressions >= 10) {
            opps.push({ ...q, potentialClicks, revenueEstimate, type: 'ctr_fix' });
        } else if (q.position > 10 && q.position <= 15 && q.impressions >= 10) {
            opps.push({ ...q, potentialClicks, revenueEstimate, type: 'quick_win' });
        }
    }

    return opps.sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, 20);
}

// ─── Page Grades ───

function computePageGrades(data: ReportRawData): PageGrade[] {
    const ga4Map = new Map(data.ga4.pagesCurrent.map(p => [p.page, p]));
    const prevMap = new Map(data.gsc.pagesPrev.map(p => [p.page, p]));
    const grades: PageGrade[] = [];
    const hasGa4 = data.hasGa4;

    for (const page of data.gsc.pagesCurrent.slice(0, 20)) {
        const prev = prevMap.get(page.page);
        const ga4Page = ga4Map.get(page.page);

        const clickDelta = prev ? page.clicks - prev.clicks : 0;
        const positionDelta = prev ? Math.round((page.position - prev.position) * 10) / 10 : 0;
        const ctrPct = Math.round(page.ctr * 10000) / 100;
        const bounceRate = typeof ga4Page?.bounceRate === 'number' ? ga4Page.bounceRate : null;

        // Grade based on composite score
        let score = 0;
        if (page.position <= 3) score += 3;
        else if (page.position <= 10) score += 2;
        else if (page.position <= 20) score += 1;

        if (ctrPct > 10) score += 3;
        else if (ctrPct > 5) score += 2;
        else if (ctrPct > 2) score += 1;

        if (clickDelta > 0) score += 2;
        else if (clickDelta === 0) score += 1;

        if (bounceRate !== null) {
            if (bounceRate < 0.4) score += 2;
            else if (bounceRate < 0.6) score += 1;
        }

        let grade: PageGrade['grade'];
        if (hasGa4) {
            if (score >= 9) grade = 'A';
            else if (score >= 7) grade = 'B';
            else if (score >= 5) grade = 'C';
            else if (score >= 3) grade = 'D';
            else grade = 'F';
        } else {
            if (score >= 7) grade = 'A';
            else if (score >= 5) grade = 'B';
            else if (score >= 4) grade = 'C';
            else if (score >= 2) grade = 'D';
            else grade = 'F';
        }

        grades.push({
            page: truncatePath(page.page),
            grade,
            clicks: page.clicks,
            impressions: page.impressions,
            ctr: ctrPct,
            position: Math.round(page.position * 10) / 10,
            clickDelta,
            positionDelta,
            bounceRate: bounceRate === null ? null : Math.round(bounceRate * 100),
            sessions: typeof ga4Page?.sessions === 'number' ? ga4Page.sessions : null,
        });
    }

    return grades.sort((a, b) => b.clicks - a.clicks).slice(0, 15);
}

// ─── Fix Prompts ───

function computeFixPrompts(
    decayPages: DecayPage[],
    cannibalization: CannibalizationGroup[],
    decelKeywords: KeywordVelocityItem[],
    opportunities: OpportunityItem[],
    siteUrl: string,
): FixPrompt[] {
    const prompts: FixPrompt[] = [];

    // Decay fix prompts (top 3)
    for (const page of decayPages.slice(0, 3)) {
        prompts.push({
            id: `decay-${prompts.length}`,
            title: `Refresh: ${page.page}`,
            context: `This page lost ${Math.abs(page.clickDelta)} clicks (${page.decayRate}% drop) and position worsened by ${page.positionDelta}. Currently at position ${page.currentPosition}.`,
            prompt: `I need to refresh and improve this webpage to recover lost organic search traffic.\n\nPage URL: ${siteUrl}${page.page}\nCurrent position: ${page.currentPosition} (was ${page.prevPosition})\nClicks dropped: ${Math.abs(page.clickDelta)} clicks (${page.decayRate}% decline)\n\nPlease:\n1. Analyze what might have caused this decline (content freshness, competitor updates, search intent shift)\n2. Suggest specific content improvements and additions\n3. Recommend updated title tag and meta description\n4. Identify internal linking opportunities\n5. Suggest any structural changes to better match current search intent`,
            category: 'decay',
        });
    }

    // Cannibalization fix prompts (top 3)
    for (const group of cannibalization.slice(0, 3)) {
        const pageList = group.pages.map(p => `  - ${p.page} (${p.clicks} clicks, pos ${p.position})`).join('\n');
        prompts.push({
            id: `cannibal-${prompts.length}`,
            title: `Fix cannibalization: "${group.query}"`,
            context: `${group.pages.length} pages compete for "${group.query}" with ${group.totalImpressions} total impressions. Winner: ${group.winner}`,
            prompt: `Multiple pages on my site are competing for the same keyword, hurting rankings.\n\nKeyword: "${group.query}"\nCompeting pages:\n${pageList}\n\nPlease:\n1. Determine which page should be the primary target for this keyword\n2. Suggest how to differentiate the other pages (different intent/angle)\n3. Recommend which pages to merge, redirect (301), or add canonical tags\n4. Provide specific content changes for each page to eliminate overlap\n5. Suggest internal linking structure to consolidate authority`,
            category: 'cannibalization',
        });
    }

    // Declining keyword fix prompts (top 3)
    for (const kw of decelKeywords.slice(0, 3)) {
        prompts.push({
            id: `keyword-${prompts.length}`,
            title: `Recover: "${kw.query}"`,
            context: `Position dropped from ${kw.prevPosition} to ${kw.currentPosition}. Clicks fell from ${kw.prevClicks} to ${kw.currentClicks}. CTR: ${kw.actualCtr}% vs expected ${kw.expectedCtr}%.`,
            prompt: `My website is losing rankings for an important keyword and I need to recover.\n\nKeyword: "${kw.query}"\nSite: ${siteUrl}\nCurrent position: ${kw.currentPosition} (was ${kw.prevPosition})\nClicks: ${kw.currentClicks} (was ${kw.prevClicks})\nCTR: ${kw.actualCtr}% (expected for this position: ${kw.expectedCtr}%)\n\nPlease:\n1. Analyze likely reasons for the ranking drop\n2. Suggest specific on-page optimizations (title, headings, content depth)\n3. Recommend content additions to improve topical authority\n4. Suggest an improved title tag and meta description optimized for CTR\n5. Identify quick wins to recover positions within 2-4 weeks`,
            category: 'keyword',
        });
    }

    // Top opportunity prompts (top 3)
    for (const opp of opportunities.slice(0, 3)) {
        const typeLabel = opp.type === 'striking_distance' ? 'Striking Distance' : opp.type === 'ctr_fix' ? 'CTR Optimization' : 'Quick Win';
        prompts.push({
            id: `opp-${prompts.length}`,
            title: `${typeLabel}: "${opp.query}"`,
            context: `Position ${opp.position.toFixed(1)} with ${opp.impressions} impressions. Potential: +${opp.potentialClicks} clicks/month (~$${opp.revenueEstimate}/mo).`,
            prompt: `I have a keyword opportunity I want to capitalize on to increase organic traffic.\n\nKeyword: "${opp.query}"\nCurrent position: ${opp.position.toFixed(1)}\nImpressions: ${opp.impressions}/month\nCurrent clicks: ${opp.clicks}/month\nPotential clicks if optimized: ${opp.potentialClicks}/month\nOpportunity type: ${typeLabel}\n\nPlease:\n1. Create an optimized title tag (under 60 chars) targeting this keyword\n2. Write a compelling meta description (under 155 chars) to maximize CTR\n3. Suggest content improvements to move into top 3 positions\n4. Recommend internal linking strategy to boost this page\n5. Provide a 2-week action plan to capture this opportunity`,
            category: 'opportunity',
        });
    }

    return prompts;
}

// ─── Critical Alerts ───

function computeCriticalAlerts(kpis: KPISummary, data: ReportRawData): CriticalAlert[] {
    const alerts: CriticalAlert[] = [];
    const hasGa4 = data.hasGa4;

    if (kpis.clicksDelta <= -50) {
        alerts.push({ severity: 'critical', title: 'Organic Click Collapse', detail: `Organic clicks dropped ${Math.abs(kpis.clicksDelta)}% (${kpis.clicks} this period vs previous). This signals a severe loss in search visibility requiring immediate investigation.`, metric: `${kpis.clicks} clicks (${kpis.clicksDelta}%)` });
    } else if (kpis.clicksDelta <= -20) {
        alerts.push({ severity: 'danger', title: 'Significant Organic Decline', detail: `Organic clicks fell ${Math.abs(kpis.clicksDelta)}%. Check for ranking losses, algorithm updates, or technical issues.`, metric: `${kpis.clicks} clicks (${kpis.clicksDelta}%)` });
    }

    if (hasGa4 && kpis.clicks < 10 && kpis.sessions > 100) {
        const ratio = kpis.sessions > 0 ? Math.round((kpis.clicks / kpis.sessions) * 100) : 0;
        alerts.push({ severity: 'critical', title: 'Near-Zero Organic Visibility', detail: `Only ${kpis.clicks} organic click(s) despite ${kpis.sessions.toLocaleString()} sessions. Organic makes up just ${ratio}% of traffic — the site is almost invisible in search results.`, metric: `${kpis.clicks} organic clicks / ${kpis.sessions.toLocaleString()} sessions` });
    }

    if (kpis.impressionsDelta <= -30 && kpis.impressions > 0) {
        alerts.push({ severity: 'danger', title: 'Search Impressions Dropping', detail: `Impressions fell ${Math.abs(kpis.impressionsDelta)}% — Google is showing your pages to fewer people. Check for lost rankings or indexing issues.`, metric: `${kpis.impressions} impressions (${kpis.impressionsDelta}%)` });
    }

    if (kpis.impressions === 0 && kpis.sessions > 50) {
        alerts.push({ severity: 'critical', title: 'Zero Search Impressions', detail: `Your site received zero search impressions. This could indicate indexing problems, a manual penalty, or Search Console verification issues.`, metric: '0 impressions' });
    }

    const homePage = data.gsc.pagesCurrent.find(p => p.page === '/' || p.page.endsWith('.com/') || p.page.endsWith('.com'));
    const homePagePrev = data.gsc.pagesPrev.find(p => p.page === '/' || p.page.endsWith('.com/') || p.page.endsWith('.com'));
    if (homePagePrev && homePagePrev.clicks >= 2 && homePage) {
        const homeDelta = homePage.clicks - homePagePrev.clicks;
        if (homeDelta < 0 && homePage.clicks === 0) {
            alerts.push({ severity: 'critical', title: 'Homepage Organic Collapse', detail: `Homepage went from ${homePagePrev.clicks} organic clicks to 0. This is your most important page — investigate immediately for ranking loss, title tag changes, or indexing issues.`, metric: `${homePagePrev.clicks} → 0 clicks` });
        }
    }

    if (hasGa4 && kpis.newUserRatio >= 90 && kpis.sessions > 200) {
        alerts.push({ severity: 'warning', title: 'No Returning Visitors', detail: `${kpis.newUserRatio}% of visitors are new — almost no one returns. This suggests low content stickiness or missing email capture / engagement loops.`, metric: `${kpis.newUserRatio}% new user ratio` });
    }

    if (hasGa4 && kpis.bounceRate > 0.7 && kpis.sessions > 100) {
        alerts.push({ severity: 'warning', title: 'High Bounce Rate', detail: `Bounce rate is ${(kpis.bounceRate * 100).toFixed(0)}% — more than 70% of visitors leave after one page. Check page load speed, content relevance, and mobile UX.`, metric: `${(kpis.bounceRate * 100).toFixed(0)}% bounce rate` });
    }

    return alerts.sort((a, b) => {
        const sev = { critical: 0, danger: 1, warning: 2 };
        return sev[a.severity] - sev[b.severity];
    });
}

// ─── Main Analysis ───

export function analyzeReportData(data: ReportRawData): ReportAnalysis {
    const kpis = computeKPIs(data);
    const keywordVelocity = computeKeywordVelocity(data);
    const decayPages = detectDecay(data);
    const cannibalization = detectCannibalization(data);
    const opportunities = computeOpportunities(data);
    const pageGrades = computePageGrades(data);

    const fixPrompts = computeFixPrompts(
        decayPages,
        cannibalization,
        keywordVelocity.decelerating,
        opportunities,
        data.siteUrl,
    );

    const totalRevenueEstimate = opportunities.reduce((s, o) => s + o.revenueEstimate, 0);

    const criticalAlerts = computeCriticalAlerts(kpis, data);

    return {
        reportMode: data.reportMode,
        hasGa4: data.hasGa4,
        kpis,
        anomalies: detectAnomalies(data),
        criticalAlerts,
        keywordVelocity,
        trafficDNA: computeTrafficDNA(data),
        decayPages,
        cannibalization,
        opportunities,
        pageGrades,
        fixPrompts,
        dailySessions: data.hasGa4 ? data.ga4.dailyCurrent.map(d => ({ date: d.date, sessions: d.sessions })) : [],
        dailyClicks: data.gsc.dailyCurrent.map(d => ({ date: d.date, clicks: d.clicks })),
        dailyImpressions: data.gsc.dailyCurrent.map(d => ({ date: d.date, impressions: d.impressions })),
        totalRevenueEstimate: Math.round(totalRevenueEstimate),
    };
}
