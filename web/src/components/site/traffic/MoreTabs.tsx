'use client';

import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';

import { fmtFull, fmtPercent } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { Banner } from '@/components/ui/Banner';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { BreakdownTable } from '../BreakdownTable';
import { displayPage, pageRef } from '../lib/rules';
import type { Ga4BreakdownResponse, Ga4Row, Ga4Summary, RetentionResponse } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { LoadError } from '../SiteStates';
import { useGa4, useSite, useSiteRange } from '../useSiteData';
import { GoalsPanel } from './GoalsFunnels';

const v = (r: Ga4Row, k: string) => r.cur[k] ?? 0;
const p = (r: Ga4Row, k: string) => (r.prev === undefined ? undefined : r.prev === null ? null : r.prev[k] ?? 0);

/** Traffic > Events & goals: every GA4 event, key events, then saved goals. */
export function EventsTab() {
    const { compareOn, compareText } = useSiteRange();
    const events = useGa4<Ga4BreakdownResponse>('events');
    const summary = useGa4<Ga4Summary>('summary');
    const [only, setOnly] = useState<'all' | 'key'>('all');
    const rows = useMemo(() => (events.data?.rows ?? []).filter((r) => only === 'all' || v(r, 'keyEvents') > 0), [events.data, only]);
    const sessions = summary.data?.totals.sessions ?? 0;
    const keyNames = (events.data?.rows ?? []).filter((r) => v(r, 'keyEvents') > 0);
    const t = summary.data?.totals;
    const prev = compareOn ? summary.data?.previous ?? null : undefined;
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="conversions" label="Key events" value={t?.conversions} previous={prev === undefined ? undefined : prev?.conversions ?? null} loading={summary.state === 'loading'} comparisonLabel={compareText} />
                <MetricTile metric="conversions" label="Key event rate" format="percent" value={t && t.sessions ? t.conversions / t.sessions : null} previous={prev === undefined ? undefined : prev && prev.sessions ? prev.conversions / prev.sessions : null} loading={summary.state === 'loading'} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Event types" value={events.data?.rows.length ?? null} loading={events.state === 'loading'} />
                <MetricTile metric="conversions" label="Key event types" value={events.data ? keyNames.length : null} loading={events.state === 'loading'} />
            </div>
            {events.state === 'error' ? <LoadError error={events.error} onRetry={events.mutate} /> : (
                <BreakdownTable
                    caption="Events"
                    rows={rows}
                    rowKey={(r) => r.key}
                    loading={events.state === 'loading'}
                    label={{ header: 'Event', text: (r) => r.dims.eventName, cell: (r) => <span className="font-mono text-body-sm">{r.dims.eventName}{v(r, 'keyEvents') > 0 ? <span className="ml-2 rounded-badge bg-subtle px-1.5 font-sans text-meta text-fg-muted">key event</span> : null}</span> }}
                    heat={{ metric: only === 'key' ? 'conversions' : 'neutral', value: (r) => v(r, 'eventCount') }}
                    defaultSort="count"
                    exportName="events"
                    searchPlaceholder="Search events"
                    toolbarExtra={<SegmentedControl ariaLabel="Events shown" size="sm" variant="neutral" value={only} onChange={setOnly} options={[{ value: 'all', label: 'All events' }, { value: 'key', label: 'Key events' }]} />}
                    columns={[
                        { key: 'count', header: 'Event count', value: (r) => v(r, 'eventCount'), previous: compareOn ? (r) => p(r, 'eventCount') : undefined },
                        { key: 'users', header: 'Users', value: (r) => v(r, 'totalUsers'), hideOnMobile: true },
                        { key: 'key', header: 'Key events', value: (r) => v(r, 'keyEvents'), hideOnMobile: true },
                        { key: 'rate', header: 'Per session', format: 'percent', value: (r) => (sessions ? v(r, 'keyEvents') / sessions : 0), hideOnMobile: true },
                    ]}
                />
            )}
            <GoalsPanel />
        </div>
    );
}

/**
 * Traffic > Journeys. GA4's API has no path exploration, so the old page drew
 * invented paths. This keeps what GA4 really reports: how sessions start and
 * how deep they go.
 */
export function JourneysTab() {
    const { siteHost } = useSite();
    const { compareOn, compareText } = useSiteRange();
    const summary = useGa4<Ga4Summary>('summary');
    const landing = useGa4<Ga4BreakdownResponse>('landing');
    const t = summary.data?.totals;
    const prev = compareOn ? summary.data?.previous ?? null : undefined;
    const loading = summary.state === 'loading';
    const rows = useMemo(() => (landing.data?.rows ?? []).filter((r) => r.dims.landingPage && r.dims.landingPage !== '(not set)').map((r) => {
        const ref = pageRef(r.dims.landingPage, siteHost);
        return { r, label: displayPage(ref, siteHost) };
    }), [landing.data, siteHost]);
    const totalSessions = rows.reduce((a, x) => a + v(x.r, 'sessions'), 0);
    return (
        <div className="flex flex-col gap-4">
            <Banner variant="info" icon={Info}>
                Google Analytics doesn&apos;t share full click paths through its API, so this tab shows how visits start and how deep they go. For step-by-step flows, build a funnel.
            </Banner>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="pageviews" label="Pages per session" value={t && t.sessions ? Math.round((t.pageviews / t.sessions) * 100) / 100 : null} previous={prev === undefined ? undefined : prev && prev.sessions ? Math.round((prev.pageviews / prev.sessions) * 100) / 100 : null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Avg. session duration" format="duration" value={t?.avgDuration} previous={prev === undefined ? undefined : prev?.avgDuration ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Engaged sessions" value={t?.engagedSessions} previous={prev === undefined ? undefined : prev?.engagedSessions ?? null} loading={loading} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Bounce rate" format="percent" better="down" value={t ? 1 - t.engagementRate : null} previous={prev === undefined ? undefined : prev ? 1 - prev.engagementRate : null} loading={loading} comparisonLabel={compareText} />
            </div>
            {landing.state === 'error' ? <LoadError error={landing.error} onRetry={landing.mutate} /> : (
                <BreakdownTable
                    caption="Where sessions start"
                    rows={rows}
                    rowKey={(x) => x.r.key}
                    loading={landing.state === 'loading'}
                    label={{ header: 'Entry page', text: (x) => x.label }}
                    heat={{ metric: 'sessions', value: (x) => v(x.r, 'sessions') }}
                    defaultSort="sessions"
                    exportName="entry-pages"
                    searchPlaceholder="Search entry pages"
                    columns={[
                        { key: 'sessions', header: 'Sessions', value: (x) => v(x.r, 'sessions'), previous: compareOn ? (x) => p(x.r, 'sessions') : undefined },
                        { key: 'share', header: 'Share', format: 'percent', value: (x) => (totalSessions ? v(x.r, 'sessions') / totalSessions : 0), hideOnMobile: true },
                        { key: 'rate', header: 'Went deeper', format: 'percent', value: (x) => v(x.r, 'engagementRate'), hideOnMobile: true },
                        { key: 'bounce', header: 'Left at once', format: 'percent', better: 'down', value: (x) => v(x.r, 'bounceRate'), hideOnMobile: true },
                        { key: 'dur', header: 'Avg. duration', format: 'duration', value: (x) => v(x.r, 'averageSessionDuration'), hideOnMobile: true },
                        { key: 'conv', header: 'Conversions', value: (x) => v(x.r, 'keyEvents'), hideOnMobile: true },
                    ]}
                />
            )}
            <p className="text-meta text-fg-muted">&ldquo;Went deeper&rdquo; is GA4&apos;s engagement rate: the session lasted 10+ seconds, viewed 2+ pages or converted.</p>
        </div>
    );
}

const MODE_LABEL = { daily: 'Day', weekly: 'Week', monthly: 'Month' } as const;

/** Cell colour on the users (indigo) ramp, zero = surface (DESIGN 6.8). */
function rampStyle(pct: number | null) {
    if (pct === null) return undefined;
    const t = Math.max(0, Math.min(1, pct / 100));
    const strength = t === 0 ? 0 : Math.round(8 + Math.sqrt(t) * 70);
    return {
        background: `color-mix(in oklab, ${METRICS.users.color} ${strength}%, var(--color-surface))`,
        color: strength > 45 ? 'var(--color-fg-inverse)' : undefined,
    };
}

/** Traffic > Retention: cohorts by first visit (GA4 cohort report). */
export function RetentionTab() {
    const [mode, setMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const q = useGa4<RetentionResponse>('retention', { noRange: true, extra: { mode } });
    const d = q.data;
    const cols = d ? Math.max(...d.cohorts.map((c) => c.retention.length), 0) : 0;
    const label = MODE_LABEL[mode];
    const fmtCohort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: mode === 'monthly' ? undefined : 'numeric', year: mode === 'monthly' ? 'numeric' : undefined, timeZone: 'UTC' });
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm text-fg-muted">Share of new users who came back, by when they first visited. The date range above does not apply here.</p>
                <SegmentedControl ariaLabel="Cohort size" size="sm" variant="neutral" value={mode} onChange={setMode}
                    options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
            </div>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : null}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(mode === 'daily' ? [1, 7, 14] : [1, 2, 4]).map((n) => (
                    <MetricTile key={n} metric="users" label={`${label} ${n} retention`} format="percent" value={d ? (d.curve[n]?.retention ?? 0) / 100 : null} loading={q.state === 'loading'} />
                ))}
                <MetricTile metric="users" label="New users in cohorts" value={d ? d.cohorts.reduce((a, c) => a + c.users, 0) : null} loading={q.state === 'loading'} />
            </div>
            <Card padding="none" className="overflow-hidden">
                <div className="p-4 pb-0 md:p-5 md:pb-0"><CardHeader title="Cohorts" description={`Each row is the new users of one ${label.toLowerCase()}; each column how many were active ${label.toLowerCase()}s later.`} /></div>
                {q.state === 'loading' ? <div className="p-5"><Skeleton className="h-64" /></div> : !d || d.cohorts.length === 0 ? (
                    <EmptyState variant="inline" title="No cohort data yet" description="GA4 needs new users in the last few weeks to build cohorts." />
                ) : (
                    <div className="overflow-x-auto px-4 pb-4 md:px-5 md:pb-5">
                        <table className="w-full border-separate border-spacing-[2px] text-body-sm tabular-nums">
                            <caption className="sr-only">Retention by cohort</caption>
                            <thead>
                                <tr>
                                    <th scope="col" className="sticky left-0 z-[1] bg-surface px-2 py-1 text-left text-meta font-medium text-fg-muted">Cohort</th>
                                    <th scope="col" className="px-2 py-1 text-right text-meta font-medium text-fg-muted">Users</th>
                                    {Array.from({ length: cols }, (_, i) => <th key={i} scope="col" className="min-w-12 px-1 py-1 text-center text-meta font-medium text-fg-muted">{label} {i}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {d.cohorts.map((c) => (
                                    <tr key={c.date}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-surface px-2 py-1 text-left font-normal whitespace-nowrap text-fg">{fmtCohort(c.date)}</th>
                                        <td className="px-2 py-1 text-right text-fg-secondary">{fmtFull(c.users)}</td>
                                        {Array.from({ length: cols }, (_, i) => {
                                            const val = c.retention[i] ?? null;
                                            return (
                                                <td key={i} className="h-8 rounded-[4px] px-1 text-center text-meta" style={rampStyle(val)} title={val === null ? 'Not reached yet' : `${val}% of ${fmtFull(c.users)}`}>
                                                    {val === null ? '' : i === 0 ? '100%' : fmtPercent(val / 100, { tile: true })}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                <tr>
                                    <th scope="row" className="sticky left-0 z-[1] bg-surface px-2 py-1 text-left font-medium text-fg">Average</th>
                                    <td />
                                    {Array.from({ length: cols }, (_, i) => (
                                        <td key={i} className="px-1 py-1 text-center text-meta font-medium text-fg">{d.curve[i] ? fmtPercent(d.curve[i].retention / 100, { tile: true }) : ''}</td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                        <p className="mt-3 flex items-center gap-2 text-meta text-fg-muted">
                            <span>0%</span>
                            <span aria-hidden className="flex gap-0.5">{[2, 10, 30, 60, 100].map((x) => <span key={x} className="h-3 w-5 rounded-[3px] border border-border-subtle" style={rampStyle(x)} />)}</span>
                            <span>100%</span>
                            <span className="ml-2">Empty cells: not reached yet.</span>
                        </p>
                    </div>
                )}
            </Card>
        </div>
    );
}
