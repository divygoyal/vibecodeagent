'use client';

import { useMemo } from 'react';

import { fmtDay, fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { ChartCard } from '@/components/charts/ChartCard';
import { DualAxisChart } from '@/components/charts/DualAxisChart';
import { Table } from '@/components/ui/Table';
import { ChartMarkers, IntervalSwitch, toAnnotations, useChartMarkers, useInterval } from '../chart/ChartExtras';
import { FindingLine } from '../Finding';
import { overlayFinding } from '../lib/findings';
import { bucketStart } from '../lib/intervals';
import type { Ga4OrganicSeries, GscSummary } from '../lib/types';
import { downloadCsv, useGa4, useGsc, useSiteRange } from '../useSiteData';

/**
 * Search Console clicks and GA4 sessions from Google organic search on one
 * chart, each on its own labelled axis, over the Search Console days (GA4 is
 * cut to the same days so the lines line up).
 */
export function SearchVsTrafficCard({ className }: { className?: string }) {
    const { dr, searchDays } = useSiteRange();
    const { interval } = useInterval(searchDays);
    const gsc = useGsc<GscSummary>('summary');
    const ga = useGa4<Ga4OrganicSeries>('organic', { searchRange: true, unfiltered: true });
    const lastDate = gsc.data?.lastDate ?? dr.resolvedSearch.end;

    const rows = useMemo(() => {
        if (!gsc.data || !ga.data) return [];
        const sessions = new Map(ga.data.series.map((p) => [p.date, p.sessions]));
        const daily = gsc.data.series.map((p) => ({ date: p.date, clicks: p.clicks, sessions: sessions.get(p.date) ?? 0 }));
        if (interval === 'day') return daily;
        const start = daily[0]?.date ?? '';
        const out = new Map<string, { date: string; clicks: number; sessions: number }>();
        for (const p of daily) {
            const b = bucketStart(p.date, interval);
            const key = b < start ? start : b;
            const r = out.get(key) ?? { date: key, clicks: 0, sessions: 0 };
            r.clicks += p.clicks;
            r.sessions += p.sessions;
            out.set(key, r);
        }
        return [...out.values()];
    }, [gsc.data, ga.data, interval]);

    const finding = useMemo(() => (rows.length ? overlayFinding(rows.map((r) => r.clicks), rows.map((r) => r.sessions)) : null), [rows]);
    const dates = useMemo(() => rows.map((r) => r.date), [rows]);
    const marks = useChartMarkers(dates, dr.resolvedSearch.start, lastDate);
    const err = gsc.state === 'error' ? gsc : ga.state === 'error' ? ga : null;
    const loading = gsc.state === 'loading' || ga.state === 'loading';
    const empty = !loading && !err && rows.every((r) => !r.clicks && !r.sessions);

    return (
        <ChartCard
            className={className}
            title="Search clicks vs organic visits"
            subtitle="Search Console clicks and GA4 sessions from google / organic, same days"
            actions={<IntervalSwitch days={searchDays} />}
            state={err ? 'error' : loading ? 'loading' : empty ? 'empty' : gsc.state === 'refetching' || ga.state === 'refetching' ? 'refetching' : 'ready'}
            error={{ message: err?.error?.message, onRetry: err?.mutate }}
            empty={{ title: 'No search clicks or organic visits in this period' }}
            height={260}
            footer="Search Console counts clicks on Google web results; GA4 counts the sessions that follow. Consent banners, ad blockers and image or Discover clicks make them differ."
            onDownloadCsv={rows.length ? () => downloadCsv('search-vs-organic.csv', ['date', 'gsc_clicks', 'ga4_google_organic_sessions'], rows.map((r) => [r.date, r.clicks, r.sessions])) : undefined}
            tableView={rows.length ? (
                <Table
                    rows={rows}
                    rowKey={(r) => r.date}
                    card={false}
                    pagination={{ pageSize: 50 }}
                    columns={[
                        { key: 'date', header: interval === 'day' ? 'Date' : `${interval[0].toUpperCase()}${interval.slice(1)} of`, cell: (r) => fmtDay(r.date) },
                        { key: 'clicks', header: 'Search clicks', align: 'right', cell: (r) => fmtFull(r.clicks) },
                        { key: 'sessions', header: 'Organic sessions', align: 'right', cell: (r) => fmtFull(r.sessions) },
                    ]}
                />
            ) : undefined}
        >
            <FindingLine finding={finding} />
            <DualAxisChart
                data={rows}
                left={{ key: 'clicks', label: 'Search clicks (Search Console)', color: METRICS.clicks.color }}
                right={{ key: 'sessions', label: 'Google organic sessions (GA4)', color: METRICS.sessions.color }}
                annotations={toAnnotations(marks.markers)}
                titleFor={interval === 'day' ? undefined : (d) => `${interval === 'week' ? 'Week' : 'Month'} of ${fmtDay(d)}`}
                height={260}
                ariaLabel="Search Console clicks and GA4 Google organic sessions over time"
            />
            <ChartMarkers markers={marks.markers} start={dr.resolvedSearch.start} end={lastDate} notesKey={marks.notesKey} scope={marks.scope} onChanged={marks.mutateNotes} notesFailed={marks.notesFailed} />
        </ChartCard>
    );
}
