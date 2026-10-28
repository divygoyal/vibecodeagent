'use client';

import type { ChartWidgetDef } from '@/lib/builder/charts/types';
import type { WidgetViewProps } from '../widgets/WidgetFrame';
import { HeatmapView } from './HeatmapView';
import { ScatterView } from './ScatterView';

/** The round 9 chart widgets, by type (WidgetRenderer sends every type it does not know here). */
export function ChartWidgetView(props: WidgetViewProps<ChartWidgetDef>) {
    const w = props.widget;
    switch (w.type) {
        case 'heatmap': return <HeatmapView {...props} widget={w} />;
        case 'scatter': return <ScatterView {...props} widget={w} />;
        default: return null;
    }
}
