import { Filter, Grid3x3, ScatterChart, type LucideIcon } from 'lucide-react';

import type { ChartType } from '@/lib/builder/charts/types';

/** Palette and outline icons of the round 9 chart widgets. */
export const CHART_ICONS: Record<ChartType, LucideIcon> = {
    heatmap: Grid3x3,
    scatter: ScatterChart,
    funnel: Filter,
};
