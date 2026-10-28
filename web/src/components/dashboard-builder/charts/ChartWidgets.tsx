'use client';

import type { ChartWidgetDef } from '@/lib/builder/charts/types';
import type { WidgetViewProps } from '../widgets/WidgetFrame';
import { FunnelView } from './FunnelView';
import { HeatmapView } from './HeatmapView';
import { PivotView } from './PivotView';
import { ScatterView } from './ScatterView';
import { TreemapView } from './TreemapView';

/** The round 9 chart widgets, by type (WidgetRenderer sends every type it does not know here). */
export function ChartWidgetView(props: WidgetViewProps<ChartWidgetDef>) {
    const w = props.widget;
    switch (w.type) {
        case 'heatmap': return <HeatmapView {...props} widget={w} />;
        case 'funnel': return <FunnelView {...props} widget={w} />;
        case 'treemap': return <TreemapView {...props} widget={w} />;
        case 'pivot': return <PivotView {...props} widget={w} />;
        case 'scatter': return <ScatterView {...props} widget={w} />;
        default: return null;
    }
}
