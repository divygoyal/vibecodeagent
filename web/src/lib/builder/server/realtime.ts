/**
 * Realtime widget server side (round 9). One GA4 Realtime API read per property: the 30 minute total, the per
 * minute bars and (optionally) one ranked breakdown, three small calls that run in parallel and are cached.
 *
 * Caching and who may see what:
 * - Snapshots are cached per USER + property + breakdown + filter (never property only: round 3 fixed a leak
 *   where a property-only key served one user's visitors to anyone who asked for that id while it was warm).
 * - A public share link never calls Google more than once per 30 seconds per dashboard + widget + the viewer's
 *   own picks (publicResultKey), however many viewers or refreshes there are.
 * - The source of a widget always comes from the saved dashboard and the OWNER's own site directory; the
 *   viewer's query string can only carry the switcher picks the owner allowed (checked by the route).
 * - Owner tokens never leave this module: results hold counts, labels and page titles, nothing else.
 */
import { createHash } from 'node:crypto';
import { runGARealtime } from '@/lib/googleApi';
import { GoogleBreakerOpenError, reportGoogleOutcome, withGoogleSlot } from '@/lib/googleLimiter';
import { applyViewerControls, canonicalJson, widgetFilters } from '../compile';
import {
    mergeRaw, normalizeRealtimeConfig, parsePerMinute, parseRows, parseTotal, publicResultKey, REALTIME_BREAKDOWNS,
    REALTIME_MAX_SITES, REALTIME_MINUTES, REALTIME_OWNER_TTL_MS, REALTIME_PUBLIC_TTL_MS, snapshotKey, splitRealtimeFilters,
    type RawSnapshot, type RealtimeResponse,
} from '../realtime';
import type { ControlDef, ControlState, DashboardDocV2, RealtimeWidget, SourceRef, WidgetErrorCode } from '../types';
import { ga4Filter, type EngineDeps } from './engine';
import { safeLabeler } from './service';
import { loadSiteDirectory, resolvePortfolio, resolveSiteRef, sourceLabel, type ResolvedSite, type SiteDirectory } from './sources';

// ── Small TTL cache (single flight) ──────────────────────────────────────

interface Entry { value: unknown; at: number; ttl: number }
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 2000;

/**
 * Value of `key` when younger than its TTL, else compute it once (concurrent callers share the promise).
 * `ttlOf` decides how long a computed value lives (errors live shorter than answers).
 */
export async function cachedRealtime<T>(key: string, ttlOf: (v: T) => number, fn: () => Promise<T>, now: () => number = Date.now): Promise<T> {
    const hit = store.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.value as T;
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = fn().then((v) => {
        store.set(key, { value: v, at: now(), ttl: ttlOf(v) });
        if (store.size > MAX_ENTRIES) {
            const t = now();
            for (const [k, e] of store) if (t - e.at >= e.ttl) store.delete(k);
            while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
        }
        return v;
    }).finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
}

export function clearRealtimeCache(): void {
    store.clear();
    inflight.clear();
}

export function realtimeCacheSize(): number {
    return store.size;
}

// ── Errors ───────────────────────────────────────────────────────────────

const TEXT: Partial<Record<WidgetErrorCode, string>> = {
    NOT_CONNECTED: 'Connect Google to see this data.',
    NO_ACCESS: 'You no longer have access to this site. Choose another site.',
    NO_GA4_SOURCE: 'Link a Google Analytics property to this site to see who is online.',
    QUOTA: 'Google is rate limiting this property. Try again in a minute.',
    UPSTREAM: 'Google did not answer. Try again.',
    INVALID: 'This widget is not set up correctly.',
    UNSUPPORTED_FOR_PORTFOLIO: `Choose up to ${REALTIME_MAX_SITES} sites to see who is online across them.`,
};

type Fail = Extract<RealtimeResponse, { status: 'error' }>;

function fail(code: WidgetErrorCode, message?: string, extra: Partial<Fail> = {}): Fail {
    return { status: 'error', code, message: message ?? TEXT[code] ?? 'Not available.', retryable: code === 'QUOTA' || code === 'UPSTREAM', ...extra };
}

function statusOf(err: unknown): number {
    const msg = err instanceof Error ? err.message : String(err);
    return Number(/Google API error (\d{3})/.exec(msg)?.[1] ?? 0);
}

function classify(err: unknown): Fail {
    if (err instanceof GoogleBreakerOpenError) return fail('QUOTA', undefined, { retryAfterSec: err.retryAfterSec });
    const msg = err instanceof Error ? err.message : String(err);
    const status = statusOf(err);
    if (status === 429 || /RESOURCE_EXHAUSTED/.test(msg)) return fail('QUOTA', undefined, { retryAfterSec: 60 });
    if (status === 401) return fail('NOT_CONNECTED', 'Google sign-in expired. Reconnect Google.');
    if (status === 403) return fail('NO_ACCESS');
    return fail('UPSTREAM');
}

/** Error answers live shorter than data; the number is 5 s for the owner and 15 s on public links. */
export function realtimeTtl(r: RealtimeResponse, mode: 'owner' | 'public'): number {
    if (r.status === 'ok') return mode === 'public' ? REALTIME_PUBLIC_TTL_MS : REALTIME_OWNER_TTL_MS;
    return mode === 'public' ? 15_000 : 5_000;
}

// ── Google ───────────────────────────────────────────────────────────────

export interface RealtimeDeps {
    /** Owner identity: cache key and limiter key. */
    userId: string;
    mode: 'owner' | 'public';
    getToken: () => Promise<string | null>;
    getTokenFor?: (asset: { kind: 'ga4' | 'gsc'; id: string }) => Promise<string | null>;
    /** Site directory override (tests). */
    loadDirectory?: (token: string) => Promise<SiteDirectory>;
    /** Replaces the Google call (tests). */
    report?: (token: string, property: string, body: Record<string, unknown>) => Promise<unknown>;
    now?: () => number;
}

/**
 * The realtime widget a public request may read: it must exist, be a realtime widget and sit on a page the share
 * shows (hidden pages are not part of a share link).
 */
export function publicRealtimeWidget(doc: Pick<DashboardDocV2, 'widgets' | 'pages'>, widgetId: string): RealtimeWidget | null {
    const w = doc.widgets[widgetId];
    if (!w || w.type !== 'realtime') return null;
    return doc.pages.some((p) => !p.hidden && p.layouts.lg.some((l) => l.i === widgetId)) ? w : null;
}

/** The engine's owner deps (token getters, identity) as realtime deps. */
export function realtimeDeps(d: Pick<EngineDeps, 'userId' | 'getToken' | 'getTokenFor'>, mode: 'owner' | 'public'): RealtimeDeps {
    return { userId: d.userId, getToken: d.getToken, getTokenFor: d.getTokenFor, mode };
}

interface Resolved {
    sites: ResolvedSite[];
    label: string;
    denied: boolean;
}

function resolveSites(src: SourceRef, dir: SiteDirectory, label: (s: SourceRef) => string): Resolved | Fail {
    if (src.type === 'portfolio') {
        const sites = resolvePortfolio(src, dir);
        if (!sites.length) return fail('NO_ACCESS', 'No sites to show. Connect Google or pick other sites.');
        return { sites, label: label(src), denied: false };
    }
    if (src.type === 'site') {
        const s = resolveSiteRef(src, dir);
        if (!s) return fail('NO_ACCESS', `You no longer have access to ${label(src)}. Choose another site.`);
        return { sites: [s], label: label(src), denied: Boolean(s.ga4Denied) };
    }
    return fail('INVALID');
}

async function fetchRaw(
    token: string, property: string, breakdown: RealtimeWidget['config']['breakdown'], filter: Record<string, unknown> | undefined, deps: RealtimeDeps,
): Promise<RawSnapshot> {
    const send = deps.report ?? runGARealtime;
    const extra = filter ? { dimensionFilter: filter } : {};
    const call = (body: Record<string, unknown>) => withGoogleSlot('ga4', property, deps.userId, 1, async () => {
        try {
            const r = await send(token, property, { ...body, ...extra });
            reportGoogleOutcome('ga4', property, 200);
            return r as Parameters<typeof parseTotal>[0];
        } catch (err) {
            reportGoogleOutcome('ga4', property, statusOf(err) || 500);
            throw err;
        }
    });
    const metrics = [{ name: 'activeUsers' }];
    const api = REALTIME_BREAKDOWNS.find((b) => b.id === breakdown)?.api ?? null;
    // The total is required. The bars and the list are optional: a failed one is left out, not shown as zeros.
    const [total, minutes, rows] = await Promise.all([
        call({ metrics, minuteRanges: [{ startMinutesAgo: REALTIME_MINUTES - 1, endMinutesAgo: 0 }] }),
        call({ dimensions: [{ name: 'minutesAgo' }], metrics, limit: REALTIME_MINUTES }).catch(() => null),
        api ? call({ dimensions: [{ name: api }], metrics, orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 25 }).catch(() => null) : Promise.resolve(null),
    ]);
    return {
        activeUsers: parseTotal(total),
        perMinute: minutes ? parsePerMinute(minutes) : [],
        rows: parseRows(rows, 25),
        fetchedAt: (deps.now ?? Date.now)(),
    };
}

/**
 * Answer for one realtime widget as the caller sees it. The widget comes from a saved dashboard or, for the
 * editor, from the owner's own inline copy; either way sources resolve against the OWNER's site directory.
 */
export async function evaluateRealtime(
    input: { widget: RealtimeWidget; defaultSource: SourceRef; controlDefs: ControlDef[]; controls: ControlState; pageId?: string },
    deps: RealtimeDeps,
): Promise<RealtimeResponse> {
    const now = deps.now ?? Date.now;
    const ctx = { controlDefs: input.controlDefs, controls: input.controls, pageId: input.pageId };
    // The viewer's site switcher pick (already checked against the owner's list by the route).
    const widget = applyViewerControls(input.widget, ctx) as RealtimeWidget;
    const cfg = normalizeRealtimeConfig(widget.config);

    const token = await deps.getToken().catch(() => null);
    if (!token) return fail('NOT_CONNECTED');
    let dir: SiteDirectory;
    try {
        dir = deps.loadDirectory ? await deps.loadDirectory(token) : await loadSiteDirectory(deps.userId, token);
    } catch (err) {
        return classify(err);
    }
    const defaultSource: SourceRef = input.defaultSource.type === 'default' ? { type: 'portfolio', include: 'all' } : input.defaultSource;
    const src = !widget.source || widget.source.type === 'default' ? defaultSource : widget.source;
    // Public viewers get host names only (never property ids or GA4 display names): the same labeller as the public doc.
    const label = deps.mode === 'public' ? safeLabeler(dir) : (s: SourceRef) => sourceLabel(s, dir);
    const resolved = resolveSites(src, dir, label);
    if ('status' in resolved) return resolved;
    const withGa4 = resolved.sites.filter((s) => s.ga4);
    if (!withGa4.length) return fail(resolved.sites.length === 1 && (resolved.sites[0].ga4Denied) ? 'NO_ACCESS' : 'NO_GA4_SOURCE', undefined, { sourceLabel: resolved.label });
    if (withGa4.length > REALTIME_MAX_SITES) return fail('UNSUPPORTED_FOR_PORTFOLIO', undefined, { sourceLabel: resolved.label });

    // Filters the realtime report understands (country, city, device); the dashboard's other filters are counted, not applied.
    const { apply, ignored } = splitRealtimeFilters(widgetFilters(widget, ctx).map((f) => f.clause));
    const filter = apply.length ? ga4Filter(apply) : undefined;
    const filterKey = createHash('sha1').update(canonicalJson(filter ?? null)).digest('hex').slice(0, 10);
    const ttl = deps.mode === 'public' ? REALTIME_PUBLIC_TTL_MS : REALTIME_OWNER_TTL_MS;

    const tokenMemo = new Map<string, Promise<string>>();
    const tokenFor = (property: string): Promise<string> => {
        if (!deps.getTokenFor) return Promise.resolve(token);
        let p = tokenMemo.get(property);
        if (!p) {
            p = deps.getTokenFor({ kind: 'ga4', id: property }).then((t) => t ?? token, () => token);
            tokenMemo.set(property, p);
        }
        return p;
    };
    try {
        const raws = await Promise.all(withGa4.map((s) => cachedRealtime(
            snapshotKey(deps.userId, s.ga4!, cfg.breakdown, filterKey),
            () => ttl,
            async () => fetchRaw(await tokenFor(s.ga4!), s.ga4!, cfg.breakdown, filter, deps),
            now,
        )));
        const raw = raws.length === 1 ? { ...raws[0], rows: raws[0].rows.slice(0, cfg.top) } : mergeRaw(raws.map((r) => ({ ...r, perMinute: r.perMinute.length === REALTIME_MINUTES ? r.perMinute : new Array<number>(REALTIME_MINUTES).fill(0) })), cfg.top);
        const hasBars = raws.every((r) => r.perMinute.length === REALTIME_MINUTES);
        return {
            status: 'ok',
            snapshot: {
                activeUsers: raw.activeUsers,
                perMinute: hasBars ? raw.perMinute : [],
                breakdown: cfg.breakdown === 'none' ? null : { by: cfg.breakdown, rows: raw.rows },
                fetchedAt: new Date(raw.fetchedAt).toISOString(),
                sourceLabel: resolved.label,
                sites: withGa4.length,
                ...(ignored ? { filtersIgnored: ignored } : {}),
            },
        };
    } catch (err) {
        return { ...classify(err), sourceLabel: resolved.label };
    }
}

/**
 * The public link's answer: at most one real evaluation per 30 seconds for this share link + widget + the
 * viewer's own picks (site switcher, allowed filters), shared by every viewer and every refresh.
 */
export function evaluatePublicRealtime(
    args: { shareToken: string; ownerId: string; widget: RealtimeWidget; defaultSource: SourceRef; controlDefs: ControlDef[]; controls: ControlState; pageId?: string },
    deps: RealtimeDeps,
): Promise<RealtimeResponse> {
    const picks = createHash('sha1').update(canonicalJson({ s: args.controls.site ?? null, f: args.controls.filters, x: args.controls.interaction ?? null })).digest('hex').slice(0, 16);
    return cachedRealtime(
        publicResultKey(args.shareToken, args.ownerId, args.widget.id, picks),
        (r) => realtimeTtl(r, 'public'),
        () => evaluateRealtime(args, { ...deps, mode: 'public' }),
        deps.now ?? Date.now,
    );
}

