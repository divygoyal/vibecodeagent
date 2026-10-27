/**
 * Fault injection for demo data mode (TC_DEMO_DATA=1, dev only): make the
 * simulated Google APIs fail the way the real ones do, so every page can be
 * checked for a clear empty/error state instead of a crash or a spinner.
 *
 * Sources, merged:
 *   TC_DEMO_FAULTS=<spec>          env, the whole server (restart to change)
 *   tc_demo_faults=<spec>          cookie, one browser (no restart)
 *   demo-access:main~<spec>        suffix on a demo token, one demo user, including
 *                                  background syncs and crons (login.mjs scenario users)
 *
 * <spec> is a comma (or +) separated list of [scope:]fault[:ms]
 *   faults  403 (no access) · 429 (quota) · 500 · timeout[:ms] (default 30000; honours the
 *           caller's AbortSignal, then 504) · empty (no rows) · revoked (refresh → invalid_grant,
 *           data calls → 401) · huge (counts × 10,000,000)
 *   scopes  ga4 · gsc · psi · list (GA4 account summaries, Search Console site list, admin
 *           list commands) · all. Without a scope a fault hits ga4 + gsc + psi data calls,
 *           so the user still sees their sites and every report fails.
 * Examples: `429`, `gsc:403`, `ga4:timeout:8000,gsc:empty`, `all:500`, `revoked`, `huge`.
 */

export type DemoFaultKind = '403' | '429' | '500' | 'timeout' | 'empty' | 'revoked' | 'huge';
export type DemoFaultScope = 'ga4' | 'gsc' | 'psi' | 'list' | 'all' | 'data';
export type DemoCallScope = 'ga4' | 'gsc' | 'psi' | 'list' | 'token';

export interface DemoFault {
    kind: DemoFaultKind;
    scope: DemoFaultScope;
    ms?: number;
}

export const DEMO_FAULT_COOKIE = 'tc_demo_faults';
export const DEMO_FAULT_TIMEOUT_MS = 30_000;
const HUGE_FACTOR = 10_000_000;

const KINDS: Record<string, DemoFaultKind> = {
    '403': '403', forbidden: '403', noaccess: '403', denied: '403',
    '429': '429', quota: '429', ratelimit: '429',
    '500': '500', error: '500', internal: '500',
    timeout: 'timeout', slow: 'timeout', hang: 'timeout',
    empty: 'empty', norows: 'empty',
    revoked: 'revoked', invalid_grant: 'revoked',
    huge: 'huge', big: 'huge',
};
const SCOPES = new Set<DemoFaultScope>(['ga4', 'gsc', 'psi', 'list', 'all', 'data']);

export function parseDemoFaults(raw: string | null | undefined): DemoFault[] {
    if (!raw) return [];
    const out: DemoFault[] = [];
    for (const token of raw.split(/[,+\s]+/)) {
        const parts = token.trim().toLowerCase().split(':').filter(Boolean);
        if (!parts.length) continue;
        let scope: DemoFaultScope = 'data';
        let kind: DemoFaultKind | null = null;
        let ms: number | undefined;
        for (const p of parts) {
            if (SCOPES.has(p as DemoFaultScope) && !kind) scope = p as DemoFaultScope;
            else if (KINDS[p] && !kind) kind = KINDS[p];
            else if (/^\d+$/.test(p) && kind) ms = Number(p);
        }
        if (kind) out.push({ kind, scope, ms });
    }
    return out;
}

/** Faults that apply to one kind of call. 'revoked' applies everywhere a token is used. */
export function faultsFor(faults: DemoFault[], call: DemoCallScope): DemoFault[] {
    return faults.filter((f) => {
        if (f.kind === 'revoked') return call !== 'psi';
        if (call === 'token') return false;
        if (f.scope === 'all') return true;
        if (f.scope === 'data') return call === 'ga4' || call === 'gsc' || call === 'psi';
        return f.scope === call;
    });
}

/** Splits 'demo-access:main~429+gsc:empty' into the token proper and its fault spec. */
export function splitFaultToken(token: string | null | undefined): { token: string | null; spec: string } {
    if (!token) return { token: token ?? null, spec: '' };
    const i = token.indexOf('~');
    if (i < 0 || !token.startsWith('demo-')) return { token, spec: '' };
    return { token: token.slice(0, i), spec: token.slice(i + 1) };
}

function googleError(code: number, status: string, message: string): Response {
    return new Response(JSON.stringify({ error: { code, message, status } }), {
        status: code,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'x-tc-demo-data': '1', 'x-tc-demo-fault': status },
    });
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new DOMException('This operation was aborted', 'AbortError'));
        if (signal?.aborted) return abort();
        const t = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => { clearTimeout(t); abort(); }, { once: true });
    });
}

/**
 * The error a fault produces before the call is answered, or null to answer
 * normally. A timeout waits (rejecting when the caller aborts) and then 504s.
 */
export async function demoFaultBefore(faults: DemoFault[], call: DemoCallScope, signal?: AbortSignal | null): Promise<Response | null> {
    for (const f of faultsFor(faults, call)) {
        switch (f.kind) {
            case 'revoked':
                if (call === 'token') {
                    return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
                        status: 400,
                        headers: { 'content-type': 'application/json; charset=UTF-8', 'x-tc-demo-data': '1', 'x-tc-demo-fault': 'invalid_grant' },
                    });
                }
                return googleError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.');
            case '403':
                return call === 'gsc' || call === 'list'
                    ? googleError(403, 'PERMISSION_DENIED', "User does not have sufficient permission for this site. See also: https://support.google.com/webmasters/answer/2451999.")
                    : googleError(403, 'PERMISSION_DENIED', 'User does not have sufficient permissions for this property.');
            case '429':
                return googleError(429, 'RESOURCE_EXHAUSTED', call === 'ga4'
                    ? 'Exhausted property tokens per hour for this property. Try again later.'
                    : 'Search Analytics load quota exceeded. Try again later.');
            case '500':
                return googleError(500, 'INTERNAL', 'Internal error encountered.');
            case 'timeout':
                await sleep(f.ms ?? DEMO_FAULT_TIMEOUT_MS, signal);
                return googleError(504, 'DEADLINE_EXCEEDED', 'The request was not answered in time.');
            default:
                break;
        }
    }
    return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const COUNT_TYPES = new Set(['TYPE_INTEGER', 'TYPE_CURRENCY']);
const scaleStr = (v: unknown) => (v === undefined || v === null || v === '' ? v : String(Math.round(Number(v) * HUGE_FACTOR)));

function hugeGa4Report(r: any): any {
    const types: string[] = (r?.metricHeaders || []).map((h: any) => h?.type || '');
    const fix = (row: any) => {
        if (!row?.metricValues) return row;
        return { ...row, metricValues: row.metricValues.map((m: any, i: number) => (COUNT_TYPES.has(types[i]) ? { ...m, value: scaleStr(m.value) } : m)) };
    };
    return {
        ...r,
        rows: r?.rows?.map(fix),
        totals: r?.totals?.map(fix),
        maximums: r?.maximums?.map(fix),
        minimums: r?.minimums?.map(fix),
    };
}

function emptyGa4Report(r: any): any {
    const { rows: _rows, totals: _t, maximums: _mx, minimums: _mn, ...rest } = r || {};
    void _rows; void _t; void _mx; void _mn;
    return { ...rest, rowCount: 0 };
}

/** Rewrites a successful demo answer for 'empty' and 'huge'. */
export async function demoFaultAfter(faults: DemoFault[], call: DemoCallScope, res: Response): Promise<Response> {
    const active = faultsFor(faults, call).filter((f) => f.kind === 'empty' || f.kind === 'huge');
    if (!active.length || !res.ok || call === 'token') return res;
    let body: any;
    try { body = await res.clone().json(); } catch { return res; }
    for (const f of active) {
        if (f.kind === 'empty') {
            if (call === 'list') {
                if ('accountSummaries' in body) body = {};
                else if ('siteEntry' in body) body = {};
                else if (Array.isArray(body?.data)) body = { ...body, data: [] };
            } else if (Array.isArray(body?.reports)) body = { ...body, reports: body.reports.map(emptyGa4Report) };
            else if ('metricHeaders' in body || 'dimensionHeaders' in body || 'rowCount' in body) body = emptyGa4Report(body);
            else if (Array.isArray(body?.rows)) { const { rows: _r, ...rest } = body; void _r; body = rest; }
            else if (Array.isArray(body?.sitemap)) body = {};
        } else if (f.kind === 'huge' && call !== 'list') {
            if (Array.isArray(body?.reports)) body = { ...body, reports: body.reports.map(hugeGa4Report) };
            else if ('metricHeaders' in body) body = hugeGa4Report(body);
            else if (Array.isArray(body?.rows)) {
                body = { ...body, rows: body.rows.map((r: any) => ({ ...r, clicks: Math.round((r.clicks ?? 0) * HUGE_FACTOR), impressions: Math.round((r.impressions ?? 0) * HUGE_FACTOR) })) };
            }
        }
    }
    const headers = new Headers(res.headers);
    headers.set('x-tc-demo-fault', active.map((f) => f.kind).join(','));
    return new Response(JSON.stringify(body), { status: res.status, headers });
}
