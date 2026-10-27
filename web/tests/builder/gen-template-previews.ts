/**
 * Generates src/lib/builder/templatePreviews.json: small value series per template widget,
 * computed by the real query engine over the demo generator (no network), so the template
 * gallery thumbnails show demo data shapes instead of fake lines.
 *
 * Run: cd web && npx --offline tsx tests/builder/gen-template-previews.ts
 */
import { writeFileSync } from 'node:fs';
import { demoAccessToken } from '@/lib/demo';
import { createDemoGoogleFetch } from '@/lib/sites/fetchInventory';
import { evaluateWidgets } from '@/lib/builder/server/engine';
import { buildFromTemplate, TEMPLATES } from '@/lib/builder/templates';
import type { DataFrame, WidgetDef } from '@/lib/builder/types';

globalThis.fetch = createDemoGoogleFetch() as typeof fetch;

function down(values: number[], n: number): number[] {
    if (values.length <= n) return values;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(values[Math.floor((i * (values.length - 1)) / (n - 1))]);
    return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

function seriesOf(frame: DataFrame | undefined, key: string): number[] {
    return (frame?.rows ?? []).map((r) => (typeof r[key] === 'number' ? (r[key] as number) : 0));
}

function preview(w: WidgetDef, parts: Record<string, DataFrame>): number[] | undefined {
    switch (w.type) {
        case 'scorecard': return down(seriesOf(parts.spark, `m:${w.config.metric.id}`), 16);
        case 'kpi-strip': return down(seriesOf(parts.spark, `m:${w.config.metrics[0].id}`), 16);
        case 'timeseries': {
            const f = parts.series;
            if (f?.seriesKeys?.length) return down((f.rows ?? []).map((r) => f.seriesKeys!.reduce((s, k) => s + (Number(r[k]) || 0), 0)), 24);
            return down(seriesOf(f, `m:${w.config.series[0].metric.id}`), 24);
        }
        case 'bar': {
            const f = parts.rows;
            if (f?.seriesKeys?.length) return (f.rows ?? []).slice(0, 6).map((r) => f.seriesKeys!.reduce((s, k) => s + (Number(r[k]) || 0), 0));
            return seriesOf(f, `m:${w.config.metrics[0].id}`).slice(0, 6);
        }
        case 'pie': return seriesOf(parts.rows, `m:${w.config.metric.id}`).slice(0, 6);
        case 'table': {
            const m = w.config.columns.find((c) => c.kind === 'metric');
            return m ? seriesOf(parts.rows, `m:${m.ref}`).slice(0, 6) : undefined;
        }
        case 'geo': return seriesOf(parts.rows, `m:${w.config.metric.id}`).slice(0, 6);
        case 'portfolio-grid': return seriesOf(parts.sites, `m:${w.config.metrics[0].id}`).slice(0, 6);
        default: return undefined;
    }
}

async function main() {
const out: Record<string, Record<string, number[]>> = {};
const token = demoAccessToken();
for (const t of [...TEMPLATES.map((x) => x.id)]) {
    const site = t === 'key-events-revenue' || t === 'ecommerce-funnel' ? { type: 'site' as const, siteId: 'creativeprints.example' } : { type: 'site' as const, siteId: 'acmeanalytics.example' };
    const doc = buildFromTemplate(t, { name: t, defaultSource: TEMPLATES.find((x) => x.id === t)!.portfolio ? { type: 'portfolio', include: 'all' } : site });
    const page = doc.pages[0];
    const res = await evaluateWidgets({
        widgets: page.layouts.lg.map((l) => ({ widget: doc.widgets[l.i], pageId: page.id })),
        defaultSource: doc.defaultSource,
        controlDefs: doc.controls,
        controls: { date: { range: { kind: 'preset', id: '3m' }, compare: { mode: 'none' } }, filters: {} },
    }, { userId: 'template-previews', getToken: async () => token, mode: 'owner', now: new Date('2026-10-26T12:00:00Z') });
    out[t] = {};
    for (const l of page.layouts.lg) {
        const r = res.results[l.i];
        if (r?.status !== 'ok') continue;
        const v = preview(doc.widgets[l.i], r.parts);
        if (v?.length) {
            const max = Math.max(...v, 1e-9);
            out[t][l.i] = v.map((x) => round(x / max)); // normalised 0..1, shapes only
        }
    }
}
writeFileSync(`${process.cwd()}/src/lib/builder/templatePreviews.json`, `${JSON.stringify(out)}\n`);
console.log(`wrote previews for ${Object.keys(out).length} templates`);
}

void main();
