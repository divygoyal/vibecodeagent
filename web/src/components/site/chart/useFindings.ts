'use client';

import { useMemo } from 'react';

import type { MetricKey } from '@/lib/metrics';
import type { Finding } from '../lib/findings';
import type { Ga4BreakdownResponse, Ga4Summary, GscRowsResponse, GscSummary } from '../lib/types';
import { useGa4, useGsc, useSite, useSiteRange } from '../useSiteData';
import { searchDriverReport, searchFindingOf, trafficDriverReport, trafficFindingOf } from './findingRules';

/** The finding over a GA4 traffic chart, with the channel (or page, or AI source) that moved most. */
export function useTrafficFinding(metric: MetricKey, summary: Ga4Summary | undefined, opts: { daily?: boolean } = {}): Finding | null {
    const { compareOn, compareText } = useSiteRange();
    const { siteHost } = useSite();
    const drivers = useGa4<Ga4BreakdownResponse>(summary ? trafficDriverReport(metric, compareOn) : null);
    return useMemo(
        () => trafficFindingOf(metric, summary, drivers.data, { compareOn, compareText, siteHost, daily: opts.daily }),
        [summary, drivers.data, metric, compareOn, compareText, siteHost, opts.daily],
    );
}

/** The finding over a Search Console chart: clicks led by a page, impressions by a query, CTR and position in points. */
export function useSearchFinding(metric: MetricKey, summary: GscSummary | undefined, opts: { daily?: boolean } = {}): Finding | null {
    const { compareOn, compareText } = useSiteRange();
    const { siteHost } = useSite();
    const drivers = useGsc<GscRowsResponse>(summary ? searchDriverReport(metric, compareOn) : null);
    return useMemo(
        () => searchFindingOf(metric, summary, drivers.data, { compareOn, compareText, siteHost, daily: opts.daily }),
        [summary, drivers.data, metric, compareOn, compareText, siteHost, opts.daily],
    );
}
