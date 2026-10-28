'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Lock } from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtDateRange } from '@/lib/format';
import { applyThemePreset, type Mode, type ThemeId } from '@/lib/builder/themes';
import type { BarWidget, KpiStripWidget, ThemeV2, TimeSeriesWidget, WidgetDef } from '@/lib/builder/types';
import { useIsMobile } from '@/lib/useIsMobile';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { dashRootProps } from '@/components/dashboard-builder/theme/DashTheme';
import { BarView, TimeSeriesView } from '@/components/dashboard-builder/widgets/Charts';
import { KpiStripView } from '@/components/dashboard-builder/widgets/Scorecard';
import type { WidgetViewProps } from '@/components/dashboard-builder/widgets/WidgetFrame';
import type { LiveDashboardRow, LiveDashRange } from '../homeLive';
import { LiveFrame } from './parts';

const RANGES: { value: LiveDashRange; label: string; aria: string }[] = [
    { value: '7d', label: '7d', aria: 'Last 7 days' },
    { value: '28d', label: '28d', aria: 'Last 28 days' },
    { value: '3m', label: '3m', aria: 'Last 3 months' },
];
const THEME_CHOICES: { value: ThemeId; label: string }[] = [
    { value: 'trafficclaw', label: 'TrafficClaw' },
    { value: 'executive', label: 'Executive' },
    { value: 'midnight', label: 'Midnight' },
];

/** The builder's grid (DashboardCanvas): 32 px rows, 16 px gaps. */
const px = (rows: number) => rows * 48 - 16;

/** The home page's current theme (the html data-theme the home theme script and switch maintain). */
function subscribe(cb: () => void) {
    const mo = new MutationObserver(cb);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
}
function usePageMode(): Mode {
    return useSyncExternalStore(subscribe, () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'), () => 'light');
}

function themeOf(id: ThemeId, mode: Mode): ThemeV2 {
    const base: ThemeV2 = { mode, header: { show: false, logoPosition: 'left', showDates: false }, badge: { show: false } };
    return applyThemePreset(base, id);
}

/**
 * A small sample dashboard (round 6): the first dashboard the live demo seeds (the Site overview template on the tour
 * site), drawn by the builder's own widgets (KPI strip, time series, bar list) with the engine's results for each
 * quick range. The range chip switches between them; the theme choice previews three of the builder's themes.
 */
export function DashboardLive({ data }: { data: LiveDashboardRow }) {
    const [range, setRange] = useState<LiveDashRange>('28d');
    const [themeId, setThemeId] = useState<ThemeId>('trafficclaw');
    const phone = useIsMobile();
    const pageMode = usePageMode();
    const page = data.byRange[range];
    const resolved = page.resolved;
    const root = useMemo(() => dashRootProps(themeOf(themeId, pageMode), pageMode), [themeId, pageMode]);
    const byId = useMemo(() => Object.fromEntries(data.widgets.map((w) => [w.id, w])) as Record<string, WidgetDef>, [data.widgets]);
    const bp = phone ? 'sm' : 'lg';
    const props = (w: WidgetDef, height: number): WidgetViewProps => ({
        widget: w,
        result: page.results[w.id],
        loading: false,
        refetching: false,
        resolved,
        compare: 'previous_period',
        height,
        bp,
        mode: 'view',
        vars: { site: data.host, date_range: fmtDateRange(resolved.range.start, resolved.range.end) },
    });
    const kpis = byId.w_kpis as KpiStripWidget | undefined;
    const search = byId.w_search as TimeSeriesWidget | undefined;
    const queries = byId.w_queries as BarWidget | undefined;
    const chartH = px(7);
    return (
        <LiveFrame hint={<>Change the date range<span className="max-sm:hidden"> or the theme</span>.</>} href={data.links.dashboards} linkLabel="Open in the live demo">
            <div {...root?.attrs} {...(root ? { 'data-dash-panel': '' } : {})} style={root?.style} className={cn('flex flex-col gap-4', root?.className)}>
                <div data-dash-header="" className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                        <h4 className="truncate text-title text-fg md:text-heading">{data.name}</h4>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-fg-muted">
                            {data.host}
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1"><Lock aria-hidden size={12} /> Private</span>
                        </p>
                    </div>
                    <div data-live-theme="" className="max-sm:hidden">
                        <SegmentedControl<ThemeId> ariaLabel="Theme" size="sm" variant="neutral" value={themeId} onChange={setThemeId} options={THEME_CHOICES} />
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <SegmentedControl<LiveDashRange>
                        ariaLabel="Date range"
                        value={range}
                        onChange={setRange}
                        options={RANGES.map((r) => ({ value: r.value, label: r.label, ariaLabel: r.aria }))}
                    />
                    <p data-live-range-text="" className="text-meta text-fg-muted tabular-nums">
                        {fmtDateRange(resolved.range.start, resolved.range.end)}
                        {resolved.compare ? ` · vs ${fmtDateRange(resolved.compare.start, resolved.compare.end)}` : ''}
                    </p>
                </div>
                {kpis ? <div style={{ height: phone ? undefined : px(3) }}><KpiStripView {...(props(kpis, px(3)) as WidgetViewProps<KpiStripWidget>)} /></div> : null}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {search ? <div className="min-w-0 md:col-span-2" style={{ height: chartH }}><TimeSeriesView {...(props(search, chartH) as WidgetViewProps<TimeSeriesWidget>)} /></div> : null}
                    {queries ? <div className="min-w-0 max-md:hidden" style={{ height: chartH }}><BarView {...(props(queries, chartH) as WidgetViewProps<BarWidget>)} /></div> : null}
                </div>
            </div>
        </LiveFrame>
    );
}
