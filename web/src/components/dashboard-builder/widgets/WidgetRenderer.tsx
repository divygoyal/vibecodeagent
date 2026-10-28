'use client';

import { resolveWidgetDates } from '@/lib/builder/widgetDates';
import type { CompareSpec, Iso, WidgetDef } from '@/lib/builder/types';
import type { WidgetViewProps } from './WidgetFrame';
import { KpiStripView, ScorecardView } from './Scorecard';
import { BarView, PieView, TimeSeriesView } from './Charts';
import { TableView } from './TableView';
import { ChartWidgetView } from '../charts/ChartWidgets';
import { EmbedView } from './EmbedView';
import { GeoCityView, GeoRegionView } from './GeoRegions';
import { RealtimeView } from './RealtimeView';
import { GeoView, ImageView, PortfolioGridView, SectionView, TextView } from './Other';

/** One widget, any type. Props carry the result for this widget from the page or inline query. */
export function WidgetRenderer(raw: WidgetViewProps) {
    const w: WidgetDef = raw.widget;
    // Round 9: the days this widget reads. Own dates (dateOverride) change them; the comparison follows (widgetDates.ts).
    const r = raw.resolved;
    const props: WidgetViewProps = r
        ? (() => {
            const spec = raw.compareSpec ?? specFromMode(raw.compare, r.compare);
            const dates = resolveWidgetDates(w.dateOverride, { range: r.range, compare: r.compare, compareSpec: spec, today: r.today });
            return { ...raw, dates, compare: dates.compareSpec.mode };
        })()
        : raw;
    switch (w.type) {
        case 'scorecard': return <ScorecardView {...props} widget={w} />;
        case 'kpi-strip': return <KpiStripView {...props} widget={w} />;
        case 'timeseries': return <TimeSeriesView {...props} widget={w} />;
        case 'bar': return <BarView {...props} widget={w} />;
        case 'pie': return <PieView {...props} widget={w} />;
        case 'table': return <TableView {...props} widget={w} />;
        case 'geo': return w.config.level === 'region' ? <GeoRegionView {...props} widget={w} /> : w.config.level === 'city' ? <GeoCityView {...props} widget={w} /> : <GeoView {...props} widget={w} />;
        case 'text': return <TextView {...props} widget={w} />;
        case 'section': return <SectionView {...props} widget={w} />;
        case 'image': return <ImageView {...props} widget={w} />;
        case 'portfolio-grid': return <PortfolioGridView {...props} widget={w} />;
        case 'realtime': return <RealtimeView {...props} widget={w} />;
        case 'embed': return <EmbedView {...props} widget={w} />;
        default: return <ChartWidgetView {...props} widget={w} />; // round 9 charts
    }
}

/** The dashboard's comparison rule when only its mode is known (callers that do not pass `compareSpec`). */
function specFromMode(mode: CompareSpec['mode'], range: { start: Iso; end: Iso } | undefined): CompareSpec {
    if (mode === 'previous_period' || mode === 'previous_year') return { mode };
    if (mode === 'custom' && range) return { mode, start: range.start, end: range.end };
    return { mode: 'none' };
}
