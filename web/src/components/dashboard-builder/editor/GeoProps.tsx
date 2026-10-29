'use client';

import { useMemo } from 'react';

import { metricLabel } from '@/lib/builder/catalog';
import { allCountryCodes, countryName } from '@/lib/builder/countries';
import { geoLevelOf, GEO_LEVELS } from '@/lib/builder/geo';
import type { GeoWidget, WidgetDef } from '@/lib/builder/types';
import { Choice, Field, MetricPicker, Toggle } from './Fields';

/** Setup of a geo widget: countries (the original map), regions of one country, or city bubbles (round 9). */
export function GeoSetup({ widget, edit, source }: { widget: GeoWidget; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void; source: React.ReactNode }) {
    const c = widget.config;
    const level = geoLevelOf(c);
    const set = (patch: Partial<GeoWidget['config']>, title?: string) => edit((w) => ({ ...w, ...(title ? { title } : {}), config: { ...(w as GeoWidget).config, ...patch } }) as WidgetDef);
    const countries = useMemo(() => allCountryCodes().map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)), []);
    return (
        <>
            {source}
            <Field label="Show" hint={level === 'country' ? undefined : 'Region and city views use Google Analytics, which names regions and cities but gives no coordinates: regions are shaded on a map of the country (a ranked list where we have no shapes), cities are bubbles.'}>
                <Choice
                    ariaLabel="Geo view"
                    value={level}
                    onChange={(v) => {
                        // Search Console has no regions or cities: switch a Search Console metric to active users.
                        const gsc = c.metric.id.startsWith('gsc:');
                        const metric = v !== 'country' && gsc ? { id: 'ga4:activeUsers' } : c.metric;
                        // A title the editor wrote ("Users by country") follows the view; a title the owner typed stays.
                        const auto = (m: string, l: string) => `${metricLabel(m)} by ${l}`;
                        const title = !widget.title || widget.title === auto(c.metric.id, level) ? auto(metric.id, v) : undefined;
                        set({ level: v, metric, ...(v !== 'region' ? { country: undefined } : {}), ...(v !== 'country' && c.topList === 0 ? { topList: 5 as const } : {}) }, title);
                    }}
                    options={GEO_LEVELS.map((l) => ({ value: l.id, label: l.label }))}
                />
            </Field>
            <Field label="Metric"><MetricPicker value={c.metric.id} families={level === 'country' ? undefined : ['ga4']} onChange={(id) => set({ metric: { id } })} /></Field>
            {level === 'region' ? (
                <Field label="Country" hint="Viewers can switch country on the widget.">
                    <Choice ariaLabel="Country" value={c.country ?? ''} onChange={(v) => set({ country: v || undefined })} options={[{ value: '', label: 'The top country' }, ...countries.map((x) => ({ value: x.code, label: x.name }))]} />
                </Field>
            ) : null}
            <Field label={level === 'country' ? 'Ranked list' : 'Rows in the list'}>
                <Choice
                    ariaLabel="Ranked list"
                    value={String(level !== 'country' && c.topList === 0 ? 5 : c.topList) as '0' | '5' | '10'}
                    onChange={(v) => set({ topList: Number(v) as 0 | 5 | 10 })}
                    options={[...(level === 'country' ? [{ value: '0' as const, label: 'Hide' }] : []), { value: '5', label: 'Top 5' }, { value: '10', label: 'Top 10' }]}
                />
            </Field>
            {level !== 'region' ? (
                <Field label="Projection"><Choice ariaLabel="Projection" value={c.projection} onChange={(v) => set({ projection: v })} options={[{ value: 'naturalEarth', label: 'Natural Earth' }, { value: 'mercator', label: 'Mercator' }]} /></Field>
            ) : null}
            {level === 'country' ? <Toggle label="Legend" checked={c.showLegend} onChange={(v) => set({ showLegend: v })} /> : null}
            {level === 'city' ? <p className="rounded-control bg-surface-sunken p-3 text-meta text-fg-muted">The map zooms to where your visitors are. Cities it does not know (small towns) stay in the list.</p> : null}
        </>
    );
}
