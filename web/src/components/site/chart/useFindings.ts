'use client';

import { useMemo } from 'react';

import { fmtCurrency } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/metrics';
import { rateFinding, trendFinding, updateImpactFinding, type Driver, type Finding } from '../lib/findings';
import { googleUpdatesIn } from '../lib/googleUpdates';
import { displayPage, isAiSource, pageRef } from '../lib/rules';
import { sourceLabel } from '../lib/sources';
import type { Ga4BreakdownResponse, Ga4Summary, GscRowsResponse, GscSummary } from '../lib/types';
import { useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';

/** The finding over a GA4 traffic chart, with the channel (or page, or AI source) that moved most. */
export function useTrafficFinding(metric: MetricKey, summary: Ga4Summary | undefined, opts: { daily?: boolean } = {}): Finding | null {
    const { compareOn, compareText } = useSiteRange();
    const { siteHost } = useSite();
    const driverReport = !compareOn ? null : metric === 'pageviews' ? 'pages' : metric === 'ai' ? 'referrers' : 'channels';
    const drivers = useGa4<Ga4BreakdownResponse>(summary ? driverReport : null);
    return useMemo(() => {
        if (!summary) return null;
        const t = summary.totals as unknown as Record<string, number>;
        const p = summary.previous as unknown as Record<string, number> | null;
        let list: Driver[] | undefined;
        let unit = 'sessions';
        const rows = drivers.data?.rows ?? [];
        if (metric === 'pageviews') {
            unit = 'views';
            list = rows.map((r) => ({ label: displayPage(pageRef(r.dims.pagePath, r.dims.hostName || siteHost), siteHost), cur: r.cur.screenPageViews ?? 0, prev: r.prev?.screenPageViews ?? 0 }));
        } else if (metric === 'ai') {
            list = rows.filter((r) => isAiSource(r.dims.sessionSource)).map((r) => ({ label: sourceLabel(r.dims.sessionSource), cur: r.cur.sessions ?? 0, prev: r.prev?.sessions ?? 0 }));
        } else if (metric === 'conversions') {
            unit = 'key events';
            list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.keyEvents ?? 0, prev: r.prev?.keyEvents ?? 0 }));
        } else if (metric === 'revenue') {
            unit = '';
            list = rows.map((r) => ({ label: r.dims.sessionDefaultChannelGroup, cur: r.cur.totalRevenue ?? 0, prev: r.prev?.totalRevenue ?? 0 }));
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
            series: opts.daily === false ? undefined : summary.series.map((s) => ({ date: s.date, value: (s as unknown as Record<string, number>)[metric] ?? 0 })),
            partialLast: true,
            ...(metric === 'revenue' ? { fmt: (n: number) => fmtCurrency(n, summary.currency, { compact: true }) } : {}),
        });
    }, [summary, drivers.data, metric, compareOn, compareText, siteHost, opts.daily]);
}

/** The finding over a Search Console chart: clicks led by a page, impressions by a query, CTR and position in points. */
export function useSearchFinding(metric: MetricKey, summary: GscSummary | undefined, opts: { daily?: boolean } = {}): Finding | null {
    const { compareOn, compareText } = useSiteRange();
    const { siteHost } = useSite();
    const report = !compareOn ? null : metric === 'clicks' ? 'pages' : metric === 'impressions' ? 'queries' : null;
    const drivers = useGsc<GscRowsResponse>(summary ? report : null);
    return useMemo(() => {
        if (!summary) return null;
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
        const rows = drivers.data?.rows ?? [];
        const lost = drivers.data?.lost ?? [];
        const list: Driver[] = [...rows, ...lost].filter((r) => r.prev !== undefined && r.prev !== null).map((r) => ({
            label: metric === 'clicks' ? displayPage(pageRef(r.key), siteHost) : `“${r.key}”`,
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
            series: opts.daily === false ? undefined : summary.series.map((s) => ({ date: s.date, value: s[metric as 'clicks'] })),
        });
    }, [summary, drivers.data, metric, compareOn, compareText, siteHost, opts.daily]);
}
