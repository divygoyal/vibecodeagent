/**
 * v1 widget-data compatibility (BUILDER.md 6.7): the old GET /widget-data routes keep answering
 * for one release, but through the v2 engine (per-widget, batched, cached, date-correct) and
 * reshaped into the v1 map. Delete with the routes after the release.
 */
import { getMetric } from '../catalog';
import { migrateV1toV2, type V1Row } from '../migrate';
import type { CellValue, ControlState, DatePresetId } from '../types';
import { evaluateDoc } from './service';
import type { EngineDeps } from './engine';

const RANGES: Record<string, DatePresetId> = { '7d': '7d', '14d': '14d', '30d': '30d', '90d': '90d' };

function plain(row: Record<string, CellValue>): Record<string, CellValue> {
    const out: Record<string, CellValue> = {};
    for (const [k, v] of Object.entries(row)) {
        if (k.endsWith(':prev') || k === '__other') continue;
        if (k.startsWith('d:')) out[k.slice(2)] = v;
        else if (k.startsWith('m:')) out[getMetric(k.slice(2))?.api ?? k.slice(2)] = v;
    }
    return out;
}

export async function v1WidgetData(row: V1Row, range: string, deps: EngineDeps): Promise<{ widgetData: Record<string, unknown>; fetchedAt: string }> {
    const doc = migrateV1toV2(row);
    const controls: ControlState = { date: { range: { kind: 'preset', id: RANGES[range] ?? '30d' }, compare: { mode: 'previous_period' } }, filters: {} };
    const res = await evaluateDoc(doc, controls, deps);
    const widgetData: Record<string, unknown> = {};
    const v1Types = new Map<string, string>();
    if (Array.isArray(row.widgets)) for (const w of row.widgets as Array<{ id?: string; type?: string; metric?: string }>) if (w?.id) v1Types.set(w.id, w.type ?? '');
    for (const [id, w] of Object.entries(doc.widgets)) {
        const r = res.results[id];
        if (!r || r.status !== 'ok') {
            widgetData[id] = null;
            continue;
        }
        if (w.type === 'scorecard') {
            const t = r.parts.total?.rows[0] ?? {};
            widgetData[id] = { value: t[`m:${w.config.metric.id}`] ?? 0, previousValue: t[`m:${w.config.metric.id}:prev`] ?? undefined };
        } else if (w.type === 'text') {
            widgetData[id] = null;
        } else {
            const frame = r.parts.series ?? r.parts.rows;
            const rows = (frame?.rows ?? []).map(plain);
            if (v1Types.get(id) === 'keywords-table' || v1Types.get(id) === 'seo-performance') widgetData[id] = rows;
            else widgetData[id] = rows;
        }
    }
    return { widgetData, fetchedAt: new Date().toISOString() };
}
