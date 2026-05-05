'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import {
    AnalyticsSubpagePanel,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import SeoInsightsList, { type SeoRecommendation } from './SeoInsightsList';

const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });

export interface SeoTrendPoint {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface SeoTrendPanelProps {
    trend: SeoTrendPoint[];
    recommendations: SeoRecommendation[];
}

interface TooltipPayload {
    color?: string;
    name?: string;
    value?: number;
    dataKey?: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-[12px] border border-white/[0.08] bg-[#050505]/95 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="flex items-center gap-2 font-medium" style={{ color: entry.color }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}:
                    <span className="ml-auto tabular-nums text-white">
                        {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                    </span>
                </p>
            ))}
        </div>
    );
}

export default function SeoTrendPanel({ trend, recommendations }: SeoTrendPanelProps) {
    const chartData = useMemo(() => trend.map(p => ({
        ...p,
        label: p.date.slice(5), // MM-DD
    })), [trend]);

    return (
        <AnalyticsSubpagePanel
            title="Search trend"
            description="Clicks and impressions over the selected range, with prioritized recommendations."
            tone="emerald"
        >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                <div className="min-w-0">
                    {chartData.length > 1 ? (
                        <div className="h-[280px] rounded-[16px] border border-white/[0.04] bg-[#0d0e12] p-3">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                    <defs>
                                        <linearGradient id="seoTrendClicks" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.32} />
                                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="seoTrendImpr" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.18} />
                                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 10, fill: '#71717a' }}
                                        axisLine={false}
                                        tickLine={false}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        tick={{ fontSize: 10, fill: '#71717a' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={40}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tick={{ fontSize: 10, fill: '#71717a' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={50}
                                    />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey="impressions"
                                        name="Impressions"
                                        stroke="#22d3ee"
                                        strokeWidth={1.5}
                                        fill="url(#seoTrendImpr)"
                                        isAnimationActive={false}
                                    />
                                    <Area
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey="clicks"
                                        name="Clicks"
                                        stroke="#34d399"
                                        strokeWidth={2}
                                        fill="url(#seoTrendClicks)"
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[280px] items-center justify-center rounded-[16px] border border-white/[0.04] bg-[#0d0e12] text-[12px] text-zinc-500">
                            Not enough data to draw a trend yet.
                        </div>
                    )}
                </div>

                <div className="min-w-0">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Recommendations
                    </p>
                    <SeoInsightsList items={recommendations} maxItems={4} />
                </div>
            </div>
        </AnalyticsSubpagePanel>
    );
}
