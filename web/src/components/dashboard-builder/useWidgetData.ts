'use client';

/**
 * Client data hooks for the builder (BUILDER.md 8.4 "Client cache").
 *
 * - usePageResults: one request per page (owner view in saved mode, public view).
 * - useInlineResult: per-widget SWR in the editor; a 30 ms batcher sends every widget that
 *   changed in one inline POST, so editing one widget refetches only that widget.
 *
 * keepPreviousData: control changes never blank a chart (the frame shows the old render at
 * 60% opacity while it refetches).
 */
import useSWR from 'swr';
import { canonicalJson, compileWidget } from '@/lib/builder/compile';
import { widgetMeta } from '@/lib/builder/registry';
import type {
    ControlDef,
    ControlState,
    DashboardQueryResponse,
    ResolvedDates,
    SourceRef,
    WidgetDef,
    WidgetResult,
} from '@/lib/builder/types';

export class QueryHttpError extends Error {
    constructor(readonly status: number, message: string, readonly body?: Record<string, unknown>) {
        super(message);
    }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new QueryHttpError(res.status, typeof body.error === 'string' ? body.error : `Request failed (${res.status})`, body);
    return body as T;
}

const SWR_OPTS = { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false } as const;

/** Whole-page results (owner saved mode or public share). key = null pauses. */
export function usePageResults(key: string | null, load: () => Promise<DashboardQueryResponse>, refreshMs = 0) {
    return useSWR<DashboardQueryResponse>(key, load, { ...SWR_OPTS, refreshInterval: refreshMs });
}

export function ownerPageLoader(dashboardId: string, pageId: string, controls: ControlState, fresh = false) {
    return () => fetchJson<DashboardQueryResponse>('/api/dashboards/query', { method: 'POST', body: JSON.stringify({ dashboardId, pageId, controls, fresh }) });
}

export function publicPageLoader(token: string, query: URLSearchParams, unlockKey?: string | null) {
    return () => fetchJson<DashboardQueryResponse>(`/api/dashboards/public/${token}/query?${query.toString()}`, {
        headers: unlockKey ? { Authorization: `Bearer ${unlockKey}` } : undefined,
        credentials: 'same-origin',
    });
}

// ── editor batcher ───────────────────────────────────────────────────────

export interface InlineCtx {
    defaultSource: SourceRef;
    controlDefs: ControlDef[];
    controls: ControlState;
    pageId?: string;
    timezone?: string;
}

interface Pending {
    widget: WidgetDef;
    resolve: (v: { result: WidgetResult | undefined; resolved: ResolvedDates }) => void;
    reject: (e: unknown) => void;
}

const groups = new Map<string, { ctx: InlineCtx; items: Pending[] }>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
    timer = null;
    const all = [...groups.values()];
    groups.clear();
    for (const g of all) {
        // Same widget twice in one tick: ask once.
        const byId = new Map<string, Pending[]>();
        for (const p of g.items) byId.set(p.widget.id, [...(byId.get(p.widget.id) ?? []), p]);
        const ids = [...byId.keys()];
        for (let i = 0; i < ids.length; i += 40) {
            const chunk = ids.slice(i, i + 40);
            const widgets = chunk.map((id) => byId.get(id)![byId.get(id)!.length - 1].widget);
            fetchJson<DashboardQueryResponse>('/api/dashboards/query', {
                method: 'POST',
                body: JSON.stringify({ widgets, defaultSource: g.ctx.defaultSource, controlDefs: g.ctx.controlDefs, controls: { ...g.ctx.controls, pageId: g.ctx.pageId }, timezone: g.ctx.timezone }),
            }).then((res) => {
                for (const id of chunk) for (const p of byId.get(id)!) p.resolve({ result: res.results[id], resolved: res.resolved });
            }, (err) => {
                for (const id of chunk) for (const p of byId.get(id)!) p.reject(err);
            });
        }
    }
}

function enqueue(widget: WidgetDef, ctx: InlineCtx, ctxKey: string) {
    return new Promise<{ result: WidgetResult | undefined; resolved: ResolvedDates }>((resolve, reject) => {
        const g = groups.get(ctxKey) ?? { ctx, items: [] };
        g.items.push({ widget, resolve, reject });
        groups.set(ctxKey, g);
        if (!timer) timer = setTimeout(flush, 30);
    });
}

/** Stable key: what the widget asks Google for, not how it looks. */
export function widgetDataKey(widget: WidgetDef, ctx: InlineCtx): string {
    const compiled = compileWidget(widget, { controlDefs: ctx.controlDefs, controls: ctx.controls, pageId: ctx.pageId });
    // Tables: the change order and (round 7) the trend column change what the engine returns.
    const t = widget.type === 'table' ? (widget.config.trend ? [widget.config.sortByChange ?? false, 'trend'] : (widget.config.sortByChange ?? false)) : null;
    return canonicalJson({ q: compiled.queries, d: widget.dateOverride ?? null, t });
}

export function useInlineResult(widget: WidgetDef, ctx: InlineCtx, enabled = true) {
    const isStatic = widgetMeta(widget.type).static;
    const ctxKey = canonicalJson({ s: ctx.defaultSource, c: ctx.controls, p: ctx.pageId ?? null, tz: ctx.timezone ?? null, f: ctx.controlDefs.filter((c) => c.type === 'filter' || c.type === 'site' || c.type === 'metric' || c.type === 'grain' || c.type === 'searchType') });
    const key = enabled && !isStatic ? ['wq', widget.id, widgetDataKey(widget, ctx), ctxKey] : null;
    return useSWR(key, () => enqueue(widget, ctx, ctxKey), SWR_OPTS);
}

export { fetchJson };
