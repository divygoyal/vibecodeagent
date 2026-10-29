'use client';

import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { BarList } from '@/components/charts';
import { EmptyState } from '@/components/ui';
import { metricColor } from '@/lib/builder/catalog';
import { countryName } from '@/lib/builder/countries';
import {
    ageLabel, normalizeRealtimeConfig, REALTIME_MINUTES, realtimeBreakdownLabel, realtimeFailureView, realtimeFrameResult, realtimeRows,
    type RealtimeResponse, type RealtimeSnapshot,
} from '@/lib/builder/realtime';
import type { RealtimeWidget, WidgetResult } from '@/lib/builder/types';
import { useChartSource } from '../charts/chartNotes';
import { useRealtime } from '../useRealtime';
import { WidgetError, WidgetFrame, type WidgetViewProps } from './WidgetFrame';
import { dsKey } from './metricUi';

const USERS = 'ga4:activeUsers';

/** True while the element is on screen (always true where IntersectionObserver is missing). */
function useOnScreen<T extends Element>(): [(el: T | null) => void, boolean] {
    const [el, setEl] = useState<T | null>(null);
    const [on, setOn] = useState(true);
    useEffect(() => {
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: '120px' });
        io.observe(el);
        return () => io.disconnect();
    }, [el]);
    return [setEl, on];
}

function rowLabel(by: string, key: string): string {
    if (by === 'country') return countryName(key);
    if (by === 'device') return key.charAt(0).toUpperCase() + key.slice(1);
    return key;
}

/** One bar per minute of the last 30; the right-most bar is the current minute. */
function MinuteBars({ values, height, color }: { values: number[]; height: number; color: string }) {
    const max = Math.max(1, ...values);
    const last = values.length - 1;
    return (
        <div className="shrink-0">
            <div role="img" aria-label={`Active users per minute over the last ${REALTIME_MINUTES} minutes; this minute ${values[last] ?? 0}`} className="flex items-end gap-[2px]" style={{ height }}>
                {values.map((v, i) => (
                    <span
                        key={i}
                        title={`${i === last ? 'This minute' : `${last - i} min ago`}: ${v}`}
                        className="min-w-0 flex-1 rounded-[2px]"
                        data-minute={i === last ? 'now' : undefined}
                        style={{ height: Math.max(2, Math.round((v / max) * height)), background: color, opacity: v === 0 ? 0.22 : i === last ? 1 : 0.62 }}
                    />
                ))}
            </div>
            <div className="mt-1 flex justify-between text-caption text-fg-muted"><span>{REALTIME_MINUTES} min ago</span><span>now</span></div>
        </div>
    );
}

function LiveBadge({ stale }: { stale: boolean }) {
    return (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-badge bg-subtle px-2 py-0.5 text-caption font-medium text-fg-secondary" data-testid="rt-live">
            <span aria-hidden className="relative flex size-2">
                {!stale ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" /> : null}
                <span className={cn('relative inline-flex size-2 rounded-full', stale ? 'bg-fg-muted' : 'bg-up')} />
            </span>
            {stale ? 'Paused' : 'Live'}
        </span>
    );
}

/**
 * The card's error state: one plain sentence (and Try again). The technical line is for the owner only, behind a
 * "Details" toggle; a public link never carries it.
 */
export function RealtimeError({ failure, owner, onRetry }: { failure: Extract<RealtimeResponse, { status: 'error' }>; owner: boolean; onRetry?: () => void }) {
    const [open, setOpen] = useState(false);
    const result = realtimeFrameResult(failure);
    const detail = owner ? failure.detail : undefined;
    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="rt-error">
            <div className="min-h-0 flex-1">
                {result.status === 'error' ? <WidgetError result={result} onRetry={onRetry} compact /> : null}
            </div>
            {detail ? (
                <div className="shrink-0 pb-1 text-center">
                    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-md px-1.5 py-0.5 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg" data-testid="rt-details-toggle" data-pdf-ignore="true">
                        {open ? 'Hide details' : 'Details'}
                    </button>
                    {open ? <p className="mx-auto mt-1 max-w-full break-words rounded-control bg-surface-sunken px-2 py-1 text-left font-mono text-caption text-fg-muted" data-testid="rt-detail">{detail}</p> : null}
                </div>
            ) : null}
        </div>
    );
}

export function RealtimeView(props: WidgetViewProps<RealtimeWidget>) {
    const { widget, height } = props;
    const cfg = normalizeRealtimeConfig(widget.config);
    const src = useChartSource();
    const [watch, onScreen] = useOnScreen<HTMLDivElement>();
    const rt = useRealtime(widget, onScreen);
    // The age in the footnote moves on its own between reads.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!onScreen) return;
        const t = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(t);
    }, [onScreen]);

    const response = rt.data;
    const owner = src.kind === 'owner';
    const snap: RealtimeSnapshot | undefined = response?.status === 'ok' ? response.snapshot : undefined;
    // Never the raw error string: the server's error answers are plain already, and a failed request is turned into one.
    const failure = useMemo(() => (snap && !rt.error ? undefined : realtimeFailureView(response, rt.error, { owner })), [response, rt.error, owner, snap]);
    const result: WidgetResult | undefined = useMemo(() => (response?.status === 'ok' ? realtimeFrameResult(response) : undefined), [response]);
    // A failed refresh keeps the last numbers on screen and says so.
    const refreshFailed = Boolean(snap && rt.error);

    const showTitle = widget.showTitle !== false;
    const foot = snap
        ? [
            `Updated ${ageLabel(snap.fetchedAt, now)}`,
            snap.sites > 1 ? 'Users on several sites count once per site' : '',
            snap.filtersIgnored ? `${snap.filtersIgnored} filter${snap.filtersIgnored === 1 ? '' : 's'} not applied: live data only knows country, city and device` : '',
            refreshFailed ? 'Could not refresh' : '',
        ].filter(Boolean).join(' · ')
        : '';
    const rows = snap?.breakdown ? realtimeRows(height, cfg.top, { title: showTitle, bars: cfg.bars && Boolean(snap.perMinute.length), footnote: Boolean(foot) }) : 0;
    const barHeight = height > 360 ? 56 : 40;
    const color = metricColor(USERS);
    const by = snap?.breakdown?.by;

    return (
        <WidgetFrame props={{ ...props, result, loading: props.loading || rt.loading, refetching: rt.refetching, onRetry: rt.retry }} footnote={foot ? { node: foot, text: foot } : undefined}>
            <div ref={watch} className="flex h-full min-h-0 flex-col gap-3" data-realtime={snap ? 'ready' : 'loading'}>
                {!rt.enabled ? (
                    <EmptyState variant="inline" title="Live data shows on your dashboards" description={src.kind === 'none' ? 'Open this dashboard to see who is online.' : undefined} />
                ) : failure && !snap ? (
                    <RealtimeError failure={failure} owner={owner} onRetry={failure.retryable ? rt.retry : undefined} />
                ) : snap ? (
                    <>
                        <div className="flex items-end gap-3">
                            <span className="text-stat-lg tabular-nums text-fg" data-testid="rt-active" aria-live="polite">{snap.activeUsers.toLocaleString('en-US')}</span>
                            <div className="mb-1 min-w-0 leading-tight">
                                <p className="truncate text-body-sm font-medium text-fg-secondary">{snap.activeUsers === 1 ? 'active user' : 'active users'}</p>
                                <p className="truncate text-meta text-fg-muted">in the last {REALTIME_MINUTES} minutes</p>
                            </div>
                            <LiveBadge stale={!onScreen || refreshFailed} />
                        </div>
                        {cfg.bars && snap.perMinute.length ? <MinuteBars values={snap.perMinute} height={barHeight} color={color} /> : null}
                        {rows > 0 && by && snap.breakdown ? (
                            snap.breakdown.rows.length ? (
                                <BarList
                                    items={snap.breakdown.rows.map((r) => ({ key: r.key, label: rowLabel(by, r.key), text: rowLabel(by, r.key), value: r.users }))}
                                    metric={dsKey(USERS)}
                                    limit={rows}
                                    formatValue={(v) => v.toLocaleString('en-US')}
                                    labelHeader={realtimeBreakdownLabel(by)}
                                    className="min-h-0 overflow-hidden"
                                />
                            ) : <p className="text-body-sm text-fg-muted">No {realtimeBreakdownLabel(by).toLowerCase()} data right now.</p>
                        ) : null}
                    </>
                ) : null}
            </div>
        </WidgetFrame>
    );
}
