/**
 * Shared by the round 9 chart tests: Google answered by the demo generator (no network), a helper that
 * runs one widget through the real query engine, and small builders.
 */
import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { clearBuilderCache } from '@/lib/builder/server/cache';
import type { ControlDef, ControlState, DashboardQueryResponse, SourceRef, WidgetDef, WidgetResultOk } from '@/lib/builder/types';

export interface Call { url: string; body: any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const calls: Call[] = [];
const demoFetch = createDemoGoogleFetch();
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (/analyticsdata|searchAnalytics/.test(url)) calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return demoFetch(input, init);
}) as typeof fetch;

export const NOW = new Date('2026-10-26T12:00:00Z');
export const TOKEN = demoAccessToken();
export const ACME: SourceRef = { type: 'site', siteId: 'acmeanalytics.example' };

export const controlsOf = (range = '28d', extra: Partial<ControlState> = {}): ControlState => ({
    date: { range: { kind: 'preset', id: range as '28d' }, compare: { mode: 'none' } },
    filters: {},
    ...extra,
});

export function reset() {
    calls.length = 0;
    clearBuilderCache();
}

export async function run(widgets: WidgetDef[], controls: ControlState = controlsOf(), controlDefs: ControlDef[] = [], source: SourceRef = ACME): Promise<DashboardQueryResponse> {
    return evaluateWidgets(
        { widgets: widgets.map((widget) => ({ widget })), defaultSource: source, controlDefs, controls },
        { userId: 'u_charts', getToken: async () => TOKEN, mode: 'owner', now: NOW },
    );
}

export async function runOne(widget: WidgetDef, controls?: ControlState, controlDefs?: ControlDef[]): Promise<WidgetResultOk> {
    reset();
    const res = await run([widget], controls, controlDefs);
    const r = res.results[widget.id];
    if (r.status !== 'ok') throw new Error(`widget failed: ${r.code} ${r.message}`);
    return r;
}
