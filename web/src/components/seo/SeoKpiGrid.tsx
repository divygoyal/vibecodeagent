'use client';

import { Eye, Hash, MousePointer, Search } from 'lucide-react';
import {
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    formatCompactNumber,
    formatPercent,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';

export interface SeoKpis {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    indexedPages?: number;
    crawlErrors?: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
}

interface SeoKpiGridProps {
    kpis: SeoKpis;
}

export default function SeoKpiGrid({ kpis }: SeoKpiGridProps) {
    return (
        <AnalyticsSubpageMetricGrid>
            <AnalyticsSubpageMetricCard
                label="Clicks"
                value={formatCompactNumber(kpis.totalClicks)}
                helper="Total organic clicks in range"
                icon={MousePointer}
                tone="emerald"
                trend={kpis.changeClicks}
            />
            <AnalyticsSubpageMetricCard
                label="Impressions"
                value={formatCompactNumber(kpis.totalImpressions)}
                helper="Times your pages appeared in search"
                icon={Eye}
                tone="cyan"
                trend={kpis.changeImpressions}
            />
            <AnalyticsSubpageMetricCard
                label="Avg. CTR"
                value={formatPercent(kpis.avgCTR)}
                helper="Clicks divided by impressions"
                icon={Hash}
                tone="mixed"
                trend={kpis.changeCTR}
            />
            <AnalyticsSubpageMetricCard
                label="Avg. Position"
                value={kpis.avgPosition.toFixed(1)}
                helper="Lower is better. Position 1 = top of SERP"
                icon={Search}
                tone="amber"
                trend={-kpis.changePosition}
            />
        </AnalyticsSubpageMetricGrid>
    );
}
