'use client';

/**
 * Client data hook of the realtime widget (round 9). One request per widget, repeated every 60 s while the widget
 * is on screen and the tab is visible; nothing runs while it is hidden or scrolled out of view.
 *
 * Owner view, TV mode and the editor ask POST /api/dashboards/realtime with the widget and the viewer's picks;
 * share links ask GET /api/dashboards/public/[token]/realtime?w=<id> (the server reads the saved widget and the
 * owner's Google access; the owner's token never reaches the browser).
 */
import { useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { canonicalJson } from '@/lib/builder/compile';
import { publicRealtimeQuery, REALTIME_REFRESH_MS, type RealtimeResponse } from '@/lib/builder/realtime';
import type { ControlState, RealtimeWidget } from '@/lib/builder/types';
import { useChartSource } from './charts/chartNotes';
import { fetchJson } from './useWidgetData';

const EMPTY_STATE: ControlState = { date: { range: { kind: 'preset', id: '28d' }, compare: { mode: 'none' } }, filters: {} };

export function useRealtime(widget: RealtimeWidget, active: boolean) {
    const src = useChartSource();

    const request = useMemo(() => {
        if (src.kind === 'public') {
            const q = publicRealtimeQuery(src.query, widget.id);
            return {
                key: `pub:${src.token}:${q}:${src.unlockKey ? 'k' : ''}`,
                load: () => fetchJson<RealtimeResponse>(`/api/dashboards/public/${src.token}/realtime?${q}`, {
                    headers: src.unlockKey ? { Authorization: `Bearer ${src.unlockKey}` } : undefined,
                    credentials: 'same-origin',
                }),
            };
        }
        if (src.kind === 'owner') {
            const view = src.view;
            const controls = view?.controls ?? EMPTY_STATE;
            const controlDefs = (view?.controlDefs ?? []).filter((c) => c.type === 'filter' || c.type === 'site' || c.type === 'variable');
            // Only what changes the answer is in the key: the widget, the source and the viewer's site / filter picks.
            const key = `own:${canonicalJson({ w: { s: widget.source, c: widget.config, f: widget.filters ?? null, i: widget.ignoreControls ?? null }, d: src.defaultSource, defs: controlDefs, s: controls.site ?? null, f: controls.filters, x: controls.interaction ?? null, p: view?.pageId ?? null })}`;
            return {
                key,
                load: () => fetchJson<RealtimeResponse>('/api/dashboards/realtime', {
                    method: 'POST',
                    body: JSON.stringify({ widget, defaultSource: src.defaultSource, controlDefs, controls: { ...controls, drill: undefined } }),
                }),
            };
        }
        return null;
    }, [src, widget]);

    const lastAt = useRef(0);
    const q = useSWR<RealtimeResponse>(request ? ['rt', request.key] : null, () => request!.load(), {
        refreshInterval: REALTIME_REFRESH_MS,
        refreshWhenHidden: false,
        refreshWhenOffline: false,
        revalidateOnFocus: true,
        dedupingInterval: 15_000,
        keepPreviousData: true,
        // SWR stops its polling timer while a key has an error, so a single failed read would end the live view: retry
        // every 30 s (60 s after a rate limit), but not for a dashboard that is gone or no longer ours, and not hidden.
        shouldRetryOnError: true,
        onErrorRetry: (err, _key, _config, revalidate, opts) => {
            const status = (err as { status?: number } | undefined)?.status;
            if (status === 401 || status === 403 || status === 404 || opts.retryCount >= 30) return;
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            setTimeout(() => void revalidate({ retryCount: opts.retryCount + 1 }), status === 429 ? 60_000 : 30_000);
        },
        isPaused: () => !active,
        onSuccess: () => { lastAt.current = Date.now(); },
    });

    // Back in view after a pause: read again when the last answer is older than the refresh interval.
    const { mutate } = q;
    useEffect(() => {
        if (active && lastAt.current && Date.now() - lastAt.current >= REALTIME_REFRESH_MS - 5_000) void mutate();
    }, [active, mutate]);

    return { enabled: Boolean(request), data: q.data, error: q.error as Error | undefined, loading: Boolean(request) && !q.data && !q.error, refetching: q.isValidating && Boolean(q.data), retry: () => void q.mutate() };
}
