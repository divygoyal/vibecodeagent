'use client';

import type { WidgetDef } from '@/lib/builder/types';
import type { WidgetViewProps } from './WidgetFrame';
import { KpiStripView, ScorecardView } from './Scorecard';
import { BarView, PieView, TimeSeriesView } from './Charts';
import { TableView } from './TableView';
import { RealtimeView } from './RealtimeView';
import { GeoView, ImageView, PortfolioGridView, SectionView, TextView } from './Other';

/** One widget, any type. Props carry the result for this widget from the page or inline query. */
export function WidgetRenderer(props: WidgetViewProps) {
    const w: WidgetDef = props.widget;
    switch (w.type) {
        case 'scorecard': return <ScorecardView {...props} widget={w} />;
        case 'kpi-strip': return <KpiStripView {...props} widget={w} />;
        case 'timeseries': return <TimeSeriesView {...props} widget={w} />;
        case 'bar': return <BarView {...props} widget={w} />;
        case 'pie': return <PieView {...props} widget={w} />;
        case 'table': return <TableView {...props} widget={w} />;
        case 'geo': return <GeoView {...props} widget={w} />;
        case 'text': return <TextView {...props} widget={w} />;
        case 'section': return <SectionView {...props} widget={w} />;
        case 'image': return <ImageView {...props} widget={w} />;
        case 'portfolio-grid': return <PortfolioGridView {...props} widget={w} />;
        case 'realtime': return <RealtimeView {...props} widget={w} />;
        default: return null;
    }
}
