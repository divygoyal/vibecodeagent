'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Eye, Hash, MousePointer, Search, type LucideIcon } from 'lucide-react';
import { formatCompactNumber, formatPercent } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import type { SeoTrendPoint } from './SeoTrendPanel';

const SparkLine = dynamic(() => import('recharts').then(m => ({ default: m.LineChart })), { ssr: false });
const SparkLineSeries = dynamic(() => import('recharts').then(m => ({ default: m.Line })), { ssr: false });
const SparkResponsive = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });

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
    trend: SeoTrendPoint[];
    /** Days in the current range, used to compute the comparison-period label. */
    rangeDays: number;
}

function formatRangeLabel(rangeDays: number): string {
    // Comparison period = the rangeDays preceding the current range.
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - rangeDays - 1); // inclusive end of comparison
    const start = new Date(end);
    start.setDate(start.getDate() - rangeDays + 1);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `vs ${fmt(start)} – ${fmt(end)}`;
}

function TrendPill({ value, invert = false }: { value: number; invert?: boolean }) {
    const positive = invert ? value <= 0 : value >= 0;
    const Icon = positive ? ArrowUp : ArrowDown;
    return (
        <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            <Icon className="h-3 w-3" />
            {value >= 0 ? '+' : ''}{value.toFixed(1)}%
        </span>
    );
}

interface KpiCardProps {
    icon: LucideIcon;
    iconTone: string;
    label: string;
    value: string;
    rangeLabel: string;
    change: number;
    invertChange?: boolean;
    sparklineData?: SeoTrendPoint[];
    sparkKey?: keyof SeoTrendPoint;
    sparkColor?: string;
}

function KpiCard({ icon: Icon, iconTone, label, value, rangeLabel, change, invertChange, sparklineData, sparkKey, sparkColor }: KpiCardProps) {
    const sparkData = sparklineData && sparkKey ? sparklineData.slice(-14) : null;
    return (
        <div className="rounded-[18px] border border-white/[0.06] bg-[#0d0e12] px-5 py-4 transition-colors hover:border-white/[0.1]">
            <div className="flex items-start justify-between gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${iconTone}`}>
                    <Icon className="h-4 w-4" />
                </div>
                {sparkData && sparkData.length > 1 && sparkColor ? (
                    <div className="h-7 w-20 opacity-80">
                        <SparkResponsive width="100%" height="100%">
                            <SparkLine data={sparkData}>
                                <SparkLineSeries
                                    type="monotone"
                                    dataKey={sparkKey as string}
                                    stroke={sparkColor}
                                    strokeWidth={1.5}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </SparkLine>
                        </SparkResponsive>
                    </div>
                ) : null}
            </div>
            <p className="mt-3 text-[12px] font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-[1.85rem] font-semibold leading-none tracking-[-0.025em] text-white">{value}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-zinc-600">{rangeLabel}</span>
                <TrendPill value={change} invert={invertChange} />
            </div>
        </div>
    );
}

export default function SeoKpiGrid({ kpis, trend, rangeDays }: SeoKpiGridProps) {
    const rangeLabel = useMemo(() => formatRangeLabel(rangeDays), [rangeDays]);

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
                icon={MousePointer}
                iconTone="border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300"
                label="Total Clicks"
                value={formatCompactNumber(kpis.totalClicks)}
                rangeLabel={rangeLabel}
                change={kpis.changeClicks}
                sparklineData={trend}
                sparkKey="clicks"
                sparkColor="#34d399"
            />
            <KpiCard
                icon={Eye}
                iconTone="border-violet-500/20 bg-violet-500/[0.08] text-violet-300"
                label="Total Impressions"
                value={formatCompactNumber(kpis.totalImpressions)}
                rangeLabel={rangeLabel}
                change={kpis.changeImpressions}
                sparklineData={trend}
                sparkKey="impressions"
                sparkColor="#a78bfa"
            />
            <KpiCard
                icon={Hash}
                iconTone="border-zinc-500/20 bg-zinc-500/[0.08] text-zinc-300"
                label="Average CTR"
                value={formatPercent(kpis.avgCTR)}
                rangeLabel={rangeLabel}
                change={kpis.changeCTR}
                sparklineData={trend}
                sparkKey="ctr"
                sparkColor="#fbbf24"
            />
            <KpiCard
                icon={Search}
                iconTone="border-amber-500/20 bg-amber-500/[0.08] text-amber-300"
                label="Average Position"
                value={kpis.avgPosition.toFixed(1)}
                rangeLabel={rangeLabel}
                change={-kpis.changePosition}
                invertChange
                sparklineData={trend}
                sparkKey="position"
                sparkColor="#fb923c"
            />
        </div>
    );
}
