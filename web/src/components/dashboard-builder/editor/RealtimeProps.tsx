'use client';

import { REALTIME_BREAKDOWNS, REALTIME_TOPS, normalizeRealtimeConfig } from '@/lib/builder/realtime';
import type { RealtimeBreakdown, RealtimeWidget, WidgetDef } from '@/lib/builder/types';
import { Choice, Field, Toggle } from './Fields';

/** Setup of a realtime widget (round 9). `source` is the shared Source field of the properties panel. */
export function RealtimeSetup({ widget, edit, source }: { widget: RealtimeWidget; edit: (fn: (w: WidgetDef) => WidgetDef, key?: string) => void; source: React.ReactNode }) {
    const c = normalizeRealtimeConfig(widget.config);
    const set = (patch: Partial<RealtimeWidget['config']>) => edit((w) => ({ ...w, config: { ...(w as RealtimeWidget).config, ...patch } }) as WidgetDef);
    return (
        <>
            {source}
            <Field label="List under the number" hint="Google's realtime report has no traffic source, so the list is Country, City, Page or Device.">
                <Choice
                    ariaLabel="Realtime list"
                    value={c.breakdown}
                    onChange={(v) => set({ breakdown: v as RealtimeBreakdown })}
                    options={REALTIME_BREAKDOWNS.map((b) => ({ value: b.id, label: b.id === 'none' ? 'None' : b.label }))}
                />
            </Field>
            {c.breakdown !== 'none' ? (
                <Field label="Rows">
                    <Choice ariaLabel="Rows" value={String(c.top) as '3' | '5' | '8'} onChange={(v) => set({ top: Number(v) as 3 | 5 | 8 })} options={REALTIME_TOPS.map((n) => ({ value: String(n), label: String(n) }))} />
                </Field>
            ) : null}
            <Toggle label="Bars for the last 30 minutes" checked={c.bars} onChange={(v) => set({ bars: v })} />
            <p className="rounded-control bg-surface-sunken p-3 text-meta text-fg-muted">Updates every minute while the dashboard is on screen. It ignores the date range, and only country, city and device filters apply.</p>
        </>
    );
}
