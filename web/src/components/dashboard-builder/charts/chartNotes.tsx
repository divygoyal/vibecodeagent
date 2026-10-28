'use client';

/**
 * Where a dashboard's time series read chart notes from (round 7). The owner's view and editor read
 * the signed-in user's notes per widget source, after the viewer's site switcher pick
 * (/api/dashboards/notes); a share link reads the owner's notes for the whole page, and only when
 * the owner switched them on (/api/dashboards/public/[token]/notes, which maps the viewer's opaque
 * site key like the query route). Anything else (marketing previews) draws no markers.
 */
import { createContext, useContext, type ReactNode } from 'react';
import useSWR from 'swr';

import { notesSourceOf, showsGoogle, showsNotes, widgetRange } from '@/lib/builder/chartMarks';
import type { CompileCtx } from '@/lib/builder/compile';
import type { ResolvedDates, SourceRef, TimeSeriesWidget } from '@/lib/builder/types';
import { fetchJson } from '../useWidgetData';

export type ChartNotesSource =
    /** `view`: the viewer's switcher picks (DashboardView and the editor add them), so notes follow the site switcher. */
    | { kind: 'owner'; defaultSource: SourceRef; canAdd: boolean; view?: CompileCtx }
    | { kind: 'public'; token: string; query: string; unlockKey?: string | null; enabled: boolean }
    | { kind: 'none' };

const Ctx = createContext<ChartNotesSource>({ kind: 'none' });

export function ChartNotesProvider({ value, children }: { value: ChartNotesSource; children: ReactNode }) {
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface WidgetNote { id?: number; date: string; title: string; description?: string | null }

const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false, keepPreviousData: true } as const;

/**
 * Notes and marker settings for one time series. `markers` is false where no layer is drawn at all
 * (outside a dashboard); `canAdd` with `scope` lets the owner add a note through /api/annotations.
 */
export function useWidgetNotes(widget: TimeSeriesWidget, resolved: ResolvedDates | undefined) {
    const src = useContext(Ctx);
    const mode = widget.config.annotations;
    const range = resolved ? widgetRange(widget, resolved) : null;
    const wantNotes = showsNotes(mode) && range !== null;

    let key: string | null = null;
    let init: RequestInit | undefined;
    if (wantNotes && src.kind === 'owner') {
        // The source the chart's data comes from after the site switcher (the engine's own resolution).
        const s = notesSourceOf(widget, src.defaultSource, src.view);
        if (s.type !== 'default') key = `/api/dashboards/notes?${new URLSearchParams({ src: JSON.stringify(s), start: range.start, end: range.end }).toString()}`;
    } else if (wantNotes && src.kind === 'public' && src.enabled) {
        key = `/api/dashboards/public/${src.token}/notes?${src.query}`;
        init = src.unlockKey ? { headers: { Authorization: `Bearer ${src.unlockKey}` } } : undefined;
    }
    const q = useSWR<{ scope?: string | null; notes: WidgetNote[] | Record<string, WidgetNote[]> }>(key ? [key, init?.headers ? 'k' : ''] : null, () => fetchJson(key!, init), SWR_OPTS);
    const raw = q.data?.notes;
    const notes: WidgetNote[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? raw[widget.id] ?? [] : [];
    return {
        markers: src.kind !== 'none' && (showsGoogle(mode) || showsNotes(mode)),
        range,
        notes,
        scope: q.data?.scope ?? null,
        canAdd: src.kind === 'owner' && src.canAdd && showsNotes(mode) && Boolean(range),
        failed: Boolean(q.error),
        refresh: () => void q.mutate(),
    };
}
