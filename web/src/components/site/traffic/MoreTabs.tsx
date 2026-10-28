'use client';

import { useMemo, useState } from 'react';

import { fmtFull, fmtPercent } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { Banner } from '@/components/ui/Banner';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { BreakdownTable } from '../BreakdownTable';
import type { Ga4BreakdownResponse, Ga4Row, Ga4Summary, RetentionResponse } from '../lib/types';
import { MetricTile } from '../MetricTile';
import { LoadError } from '../SiteStates';
import { useGa4, useSiteRange } from '../useSiteData';
import { useTabParam } from '../useTabParam';
import { COHORT_MODES } from '../lib/cohorts';
import { GoalsPanel } from './GoalsFunnels';

const v = (r: Ga4Row, k: string) => r.cur[k] ?? 0;
const p = (r: Ga4Row, k: string) => (r.prev === undefined ? undefined : r.prev === null ? null : r.prev[k] ?? 0);

/** Traffic > Events & goals: every GA4 event, key events, then saved goals. */
export function EventsTab() {
    const { compareOn, compareText } = useSiteRange();
    const events = useGa4<Ga4BreakdownResponse>('events');
    const summary = useGa4<Ga4Summary>('summary');
    const [only, setOnly] = useState<'all' | 'key'>('all');
    const all = useMemo(() => events.data?.rows ?? [], [events.data]);
    const keyNames = all.filter((r) => v(r, 'keyEvents') > 0);
    const hasKey = keyNames.length > 0;
    // Round 4: events with no hits this period (they only exist in the comparison) are trimmed, and the key-event
    // columns show only under "Key events", so 11 rows of "0 / 0%" never fill the table.
    const live = useMemo(() => all.filter((r) => v(r, 'eventCount') > 0), [all]);
    const rows = useMemo(() => live.filter((r) => only === 'all' || !hasKey || v(r, 'keyEvents') > 0), [live, only, hasKey]);
    const trimmed = all.length - live.length;
    const sessions = summary.data?.totals.sessions ?? 0;
    const keyView = hasKey && only === 'key';
    const t = summary.data?.totals;
    const prev = compareOn ? summary.data?.previous ?? null : undefined;
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricTile metric="conversions" label="Key events" value={t?.conversions} previous={prev === undefined ? undefined : prev?.conversions ?? null} loading={summary.state === 'loading'} comparisonLabel={compareText} />
                <MetricTile metric="conversions" label="Key event rate" format="percent" value={t && t.sessions ? t.conversions / t.sessions : null} previous={prev === undefined ? undefined : prev && prev.sessions ? prev.conversions / prev.sessions : null} loading={summary.state === 'loading'} comparisonLabel={compareText} />
                <MetricTile metric="sessions" label="Event types" value={events.data ? live.length : null} loading={events.state === 'loading'} />
                <MetricTile metric="conversions" label="Key event types" value={events.data ? keyNames.length : null} loading={events.state === 'loading'} />
            </div>
            {events.data && !hasKey && live.length > 0 ? (
                <Banner variant="neutral">
                    None of these events is a key event yet. In GA4, open Admin › Data display › Events and turn on
                    &ldquo;Mark as key event&rdquo; for the ones that matter (a sign-up, a purchase, a lead form). They show up here from then on.
                </Banner>
            ) : null}
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
                    toolbarExtra={hasKey ? <SegmentedControl ariaLabel="Events shown" size="sm" variant="neutral" value={only} onChange={setOnly} options={[{ value: 'all', label: 'All events' }, { value: 'key', label: 'Key events' }]} /> : undefined}
                    columns={[
                        { key: 'count', header: 'Event count', value: (r) => v(r, 'eventCount'), previous: compareOn ? (r) => p(r, 'eventCount') : undefined },
                        { key: 'users', header: 'Users', value: (r) => v(r, 'totalUsers'), hideOnMobile: true },
                        // All events: a per-session rate every row has. Key events view: the key-event count and rate.
                        ...(keyView ? [
                            { key: 'key', header: 'Key events', value: (r: Ga4Row) => v(r, 'keyEvents'), hideOnMobile: true },
                            { key: 'rate', header: 'Key event rate', format: 'percent' as const, value: (r: Ga4Row) => (sessions ? v(r, 'keyEvents') / sessions : null), hideOnMobile: true },
                        ] : [
                            { key: 'per', header: 'Per session', format: 'decimal' as const, value: (r: Ga4Row) => (sessions ? v(r, 'eventCount') / sessions : null), hideOnMobile: true },
                        ]),
                    ]}
                />
            )}
            {trimmed > 0 || hasKey ? (
                <p className="-mt-2 text-meta text-fg-muted">
                    {trimmed > 0 ? `${fmtFull(trimmed)} ${trimmed === 1 ? 'event' : 'events'} with no hits in this period not shown. ` : ''}
                    {/* GA4 can count a key event once per session, so its Event count may be higher than its key events (round 4 polish). */}
                    {hasKey ? `Key events follow each event’s counting setting in GA4 (once per event or once per session), so a key event’s Event count can be higher than its key events.${keyView ? '' : ' Switch to Key events to see those counts.'}` : ''}
                </p>
            ) : null}
            <GoalsPanel />
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
    // In the URL (?cohort=), so the Traffic header can name the same cohort window.
    const [mode, setMode] = useTabParam(COHORT_MODES, { name: 'cohort' });
    const q = useGa4<RetentionResponse>('retention', { noRange: true, extra: { mode } });
    const d = q.data;
    const cols = d ? Math.max(...d.cohorts.map((c) => c.retention.length), 0) : 0;
    const label = MODE_LABEL[mode];
    const fmtCohort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: mode === 'monthly' ? undefined : 'numeric', year: mode === 'monthly' ? 'numeric' : undefined, timeZone: 'UTC' });
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm text-fg-muted">Share of new users who came back, by when they first visited.</p>
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
