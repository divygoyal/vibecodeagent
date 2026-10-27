'use client';

import { useMemo, useState } from 'react';

import { fmtFull } from '@/lib/format';
import { METRICS } from '@/lib/metrics';
import { WeekHourHeatmap } from '@/components/charts/WeekHourHeatmap';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { FindingLine } from '../Finding';
import { peakHoursFinding, peakWindow } from '../lib/findings';
import type { Ga4Heatmap } from '../lib/types';
import { LoadError } from '../SiteStates';
import { useGa4 } from '../useSiteData';

/** Peak hours (GA4 dayOfWeek x hour) with the busiest 3 hours outlined and said in words. */
export function PeakHoursCard({ className }: { className?: string }) {
    const q = useGa4<Ga4Heatmap>('heatmap');
    const [metric, setMetric] = useState<'sessions' | 'users'>('sessions');
    const grid = q.data?.[metric];
    const unit = metric === 'sessions' ? 'sessions' : 'users';
    const { finding, peak } = useMemo(() => ({
        finding: grid ? peakHoursFinding(grid, unit) : null,
        peak: grid ? peakWindow(grid, 3) : null,
    }), [grid, unit]);
    const total = grid ? grid.flat().reduce((a, b) => a + b, 0) : 0;
    const tz = q.data?.timeZone;

    return (
        <Card as="section" aria-label="Peak hours" className={className}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                    <h3 className="text-title-sm text-fg">Peak hours</h3>
                    <p className="text-meta text-fg-muted">
                        {unit[0].toUpperCase() + unit.slice(1)} by weekday and hour{tz ? `, ${tz.replace(/_/g, ' ')} time` : ', in your GA4 time zone'}
                        {q.data && q.data.days < 14 ? ' · pick 28 days or more for a steadier pattern' : ''}
                    </p>
                </div>
                <SegmentedControl ariaLabel="Peak hours metric" size="sm" variant="neutral" value={metric} onChange={setMetric}
                    options={[{ value: 'sessions', label: 'Sessions' }, { value: 'users', label: 'Users' }]} />
            </div>
            {q.state === 'error' ? <LoadError error={q.error} onRetry={q.mutate} /> : q.state === 'loading' || !grid ? (
                <div className="flex flex-col gap-2"><Skeleton className="h-4 w-1/2" />{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div>
            ) : total === 0 ? (
                <EmptyState variant="inline" title={`No ${unit} in this period`} />
            ) : (
                <>
                    <FindingLine finding={finding} />
                    <WeekHourHeatmap grid={grid} color={METRICS[metric === 'sessions' ? 'sessions' : 'users'].color} format={fmtFull} unit={unit} highlight={peak && peak.ratio >= 1.15 ? peak : null} />
                </>
            )}
        </Card>
    );
}
