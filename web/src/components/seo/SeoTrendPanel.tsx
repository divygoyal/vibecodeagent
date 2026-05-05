'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnalyticsSubpagePanel } from '@/components/analytics/subpages/AnalyticsSubpageShell';

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
        <div className="rounded-[10px] border border-white/[0.08] bg-[#050505]/95 px-3 py-2 text-[11px] shadow-2xl backdrop-blur-sm">
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

function formatXTick(date: string): string {
    // Convert "2026-04-06" → "Apr 6"
    const d = new Date(date);
    if (isNaN(d.getTime())) return date.slice(5);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeoTrendPanel({ trend }: SeoTrendPanelProps) {
    const chartData = useMemo(() => trend.map(p => ({
        ...p,
        label: formatXTick(p.date),
    })), [trend]);

    const totalClicks = trend.reduce((s, p) => s + p.clicks, 0);
    const totalImpr = trend.reduce((s, p) => s + p.impressions, 0);

    return (
        <AnalyticsSubpagePanel
            title="Search trend"
            description="Clicks and impressions across the selected time range."
            action={
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.07] bg-[#0a0b0e] px-3 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:border-white/[0.12]"
                    disabled
                    title="Granularity"
                >
                    Daily
                    <ChevronDown className="h-3 w-3 text-zinc-500" />
                </button>
            }
        >
            {chartData.length > 1 ? (
                <>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id="seoTrendClicks" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.32} />
                                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="seoTrendImpr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.18} />
                                        <stop offset="100%" stopColor="#67e8f9" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 10, fill: '#71717a' }}
                                    axisLine={false}
                                    tickLine={false}
                                    minTickGap={32}
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
                                    stroke="#67e8f9"
                                    strokeWidth={1.5}
                                    fill="url(#seoTrendImpr)"
                                    isAnimationActive={false}
                                />
                                <Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="clicks"
                                    name="Clicks"
                                    stroke="#22d3ee"
                                    strokeWidth={2}
                                    fill="url(#seoTrendClicks)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex items-center gap-5 text-[12px] text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                            <span className="font-medium text-zinc-300">Clicks</span>
                            <span className="tabular-nums text-zinc-500">{totalClicks.toLocaleString()}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-200" />
                            <span className="font-medium text-zinc-300">Impressions</span>
                            <span className="tabular-nums text-zinc-500">{totalImpr.toLocaleString()}</span>
                        </span>
                    </div>
                </>
            ) : (
                <div className="flex h-[280px] items-center justify-center rounded-[12px] border border-white/[0.04] bg-[#0a0b0e] text-[12px] text-zinc-500">
                    Not enough data to draw a trend yet.
                </div>
            )}
        </AnalyticsSubpagePanel>
    );
}
