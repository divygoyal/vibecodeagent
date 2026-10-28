/**
 * The rules behind the one-line chart findings (useFindings.ts), as pure functions: the hooks feed them the page's
 * data, and the home page's sample rows call them on the server with the same data. No React, no fetch.
 */
import { endsToday } from '@/lib/dateRange';
import { fmtCurrency } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { rateFinding, trendFinding, updateImpactFinding, type Driver, type Finding } from '../lib/findings';
import { googleUpdatesIn } from '../lib/googleUpdates';
import { sentencePage } from '../lib/pagePath';
import { displayPage, isAiSource, pageRef } from '../lib/rules';
import { sourceLabel } from '../lib/sources';
import type { Ga4BreakdownResponse, Ga4Summary, GscRowsResponse, GscSummary } from '../lib/types';

export interface FindingContext {
    compareOn: boolean;
    compareText: string;
    siteHost: string | null;
    /** Daily points (the series feeds the "best day" rules); false for week / month buckets. */
    daily?: boolean;
    /** "Today" for the partial-day check (defaults to now). */
    now?: Date | string;
}

/** The GA4 breakdown that names what moved a traffic metric (null: none needed). */
export function trafficDriverReport(metric: MetricKey, compareOn: boolean): 'pages' | 'referrers' | 'channels' | null {
    return !compareOn ? null : metric === 'pageviews' ? 'pages' : metric === 'ai' ? 'referrers' : 'channels';
}

/** The Search Console table that names what moved a search metric (null: none needed). */
export function searchDriverReport(metric: MetricKey, compareOn: boolean): 'pages' | 'queries' | null {
    return !compareOn ? null : metric === 'clicks' ? 'pages' : metric === 'impressions' ? 'queries' : null;
}

/** The finding over a GA4 traffic chart, with the channel (or page, or AI source) that moved most. */
export function trafficFindingOf(metric: MetricKey, summary: Ga4Summary | undefined, drivers: Ga4BreakdownResponse | undefined, ctx: FindingContext): Finding | null {
    if (!summary) return null;
    const { compareOn, compareText, siteHost } = ctx;
    const t = summary.totals as unknown as Record<string, number>;
    const p = summary.previous as unknown as Record<string, number> | null;
    let list: Driver[] | undefined;
    let unit = 'sessions';
    const rows = drivers?.rows ?? [];
    if (metric === 'pageviews') {
        unit = 'views';
        list = rows.map((r) => ({ label: sentencePage(displayPage(pageRef(r.dims.pagePath, r.dims.hostName || siteHost), siteHost)), cur: r.cur.screenPageViews ?? 0, prev: r.prev?.screenPageViews ?? 0 }));
    } else if (metric === 'ai') {
        list = rows.filter((r) => isAiSource(r.dims.sessionSource)).map((r) => ({ label: sourceLabel(r.dims.sessionSource), cur: r.cur.sessions ?? 0, prev: r.prev?.sessions ?? 0 }));
    } else if (metric === 'conversions') {
        unit = 'key events';
        list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.keyEvents ?? 0, prev: r.prev?.keyEvents ?? 0 }));
    } else if (metric === 'revenue') {
        unit = '';
        list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.totalRevenue ?? 0, prev: r.prev?.totalRevenue ?? 0 }));
    } else if (metric === 'users') {
        // Users are led by the channel that gained the most users (not sessions: one unit per finding).
        unit = 'users';
        list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.activeUsers ?? 0, prev: r.prev?.activeUsers ?? 0 }));
    } else {
        list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.sessions ?? 0, prev: r.prev?.sessions ?? 0 }));
    }
    // Rows cut off by GA4 have no previous value: leave them out rather than guess.
    list = list.filter((d) => Number.isFinite(d.prev));
    return trendFinding({
        metric: METRICS[metric].label,
        cur: t[metric],
        prev: compareOn ? p?.[metric] ?? null : undefined,
        compareText,
        drivers: list,
        driverUnit: unit,
        series: ctx.daily === false ? undefined : summary.series.map((s) => ({ date: s.date, value: (s as unknown as Record<string, number>)[metric] ?? 0 })),
        // Only a series that runs into today has a point still filling in (lib/dateRange: complete days only).
        partialLast: endsToday(summary.series[summary.series.length - 1]?.date ?? '', ctx.now),
        ...(metric === 'revenue' ? { fmt: (n: number) => fmtCurrency(n, summary.currency, { compact: true }) } : {}),
    });
}

/** The finding over a Search Console chart: clicks led by a page, impressions by a query, CTR and position in points. */
export function searchFindingOf(metric: MetricKey, summary: GscSummary | undefined, drivers: GscRowsResponse | undefined, ctx: FindingContext): Finding | null {
    if (!summary) return null;
    const { compareOn, compareText, siteHost } = ctx;
    const cur = summary.totals[metric as 'clicks'];
    const prev = compareOn ? summary.previous?.[metric as 'clicks'] ?? null : undefined;
    if (metric === 'ctr' || metric === 'position') return rateFinding({ metric, cur, prev, compareText });
    // A core update inside the range that clearly moved the metric is the finding that matters most.
    const days = summary.series;
    if (days.length > 14) {
        const core = googleUpdatesIn(days[0].date, days[days.length - 1].date).filter((u) => u.kind === 'core');
        const hit = updateImpactFinding(days.map((p) => ({ date: p.date, value: p[metric as 'clicks'] })), core, METRICS[metric].label);
        if (hit) return hit;
    }
    const rows = drivers?.rows ?? [];
    const lost = drivers?.lost ?? [];
    const list: Driver[] = [...rows, ...lost].filter((r) => r.prev !== undefined && r.prev !== null).map((r) => ({
        label: metric === 'clicks' ? sentencePage(displayPage(pageRef(r.key), siteHost)) : `“${r.key}”`,
        cur: metric === 'clicks' ? r.clicks : r.impressions,
        prev: metric === 'clicks' ? r.prev!.clicks : r.prev!.impressions,
    }));
    return trendFinding({
        metric: METRICS[metric].label,
        cur,
        prev,
        compareText,
        drivers: list,
        driverUnit: metric === 'clicks' ? 'clicks' : 'impressions',
        series: ctx.daily === false ? undefined : summary.series.map((s) => ({ date: s.date, value: s[metric as 'clicks'] })),
    });
}
