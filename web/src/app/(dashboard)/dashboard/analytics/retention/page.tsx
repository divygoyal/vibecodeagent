'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
const ResponsiveContainer = dynamic(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(m => ({ default: m.AreaChart })), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => ({ default: m.Area })), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => ({ default: m.XAxis })), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => ({ default: m.YAxis })), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => ({ default: m.CartesianGrid })), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => ({ default: m.Tooltip })), { ssr: false });
import {
    Users, Calendar, BarChart3,
    Activity,
} from 'lucide-react';
import useSWR from 'swr';
import {
    AnalyticsInsightList,
    AnalyticsSubpageBadge,
    AnalyticsSubpageEmptyState,
    AnalyticsSubpageLoadingState,
    AnalyticsSubpageMetricCard,
    AnalyticsSubpageMetricGrid,
    AnalyticsSubpagePanel,
    AnalyticsSubpageShell,
    formatPercent,
} from '@/components/analytics/subpages/AnalyticsSubpageShell';
import { useAnalyticsContext } from '../layout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type RetentionMode = 'daily' | 'weekly' | 'monthly';

interface CohortData {
    date: string;
    users: number;
    retention: (number | null)[];
}

interface RetentionResponse {
    mode: string;
    cohorts: CohortData[];
    averages: { day1: number; day7: number; day14: number; day30: number };
    curve: { period: number; retention: number }[];
    trends: { day1: number; day7: number; day14: number; day30: number };
}

interface ChartTooltipEntry {
    name: string;
    color: string;
    value: number;
}

// ─── Mode Config ───

const MODE_CONFIG: Record<RetentionMode, { label: string; periodLabel: string; columns: number }> = {
    daily: { label: 'Daily', periodLabel: 'Day', columns: 14 },
    weekly: { label: 'Weekly', periodLabel: 'Week', columns: 8 },
    monthly: { label: 'Monthly', periodLabel: 'Month', columns: 6 },
};

// ─── Retention Cell Color ───

function retentionCellBg(value: number | null): string {
    if (value === null) return 'transparent';
    if (value >= 80) return 'rgba(52, 211, 153, 0.55)';
    if (value >= 50) return 'rgba(52, 211, 153, 0.40)';
    if (value >= 30) return 'rgba(52, 211, 153, 0.28)';
    if (value >= 20) return 'rgba(52, 211, 153, 0.18)';
    if (value >= 10) return 'rgba(52, 211, 153, 0.12)';
    if (value >= 5) return 'rgba(52, 211, 153, 0.07)';
    return 'rgba(52, 211, 153, 0.03)';
}

function retentionTextColor(value: number | null): string {
    if (value === null) return 'text-zinc-700';
    if (value >= 50) return 'text-white';
    if (value >= 20) return 'text-emerald-300';
    if (value >= 10) return 'text-emerald-400/80';
    return 'text-zinc-400';
}

// ─── Chart Tooltip ───

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: ChartTooltipEntry[];
    label?: string | number;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
            <p className="text-[11px] font-semibold text-white mb-2">{label}</p>
            <div className="space-y-1.5">
                {payload.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                            <span className="text-[10px] text-zinc-500">{e.name}</span>
                        </div>
                        <span className="text-xs font-bold text-white tabular-nums">{e.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Heatmap Cell Tooltip ───

function HeatmapTooltip({
    visible,
    cohortDate,
    period,
    periodLabel,
    retention,
    users,
    x,
    y,
}: {
    visible: boolean;
    cohortDate: string;
    period: number;
    periodLabel: string;
    retention: number;
    users: number;
    x: number;
    y: number;
}) {
    if (!visible) return null;

    const retainedUsers = Math.round((retention / 100) * users);

    return (
        <div
            className="fixed z-[100] pointer-events-none bg-[#050508] border border-white/[0.12] rounded-xl px-4 py-3 shadow-2xl min-w-[180px]"
            style={{ left: x + 12, top: y - 40 }}
        >
            <p className="text-[11px] font-semibold text-white mb-1.5">{cohortDate}</p>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-zinc-500">{periodLabel} {period}</span>
                    <span className="text-xs font-bold text-emerald-400 tabular-nums">{retention}%</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-zinc-500">Retained users</span>
                    <span className="text-xs font-bold text-white tabular-nums">{retainedUsers.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] text-zinc-500">Cohort size</span>
                    <span className="text-xs font-bold text-zinc-400 tabular-nums">{users.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}

// ─── Mode Switcher ───

function ModeSwitcher({ mode, onChange }: { mode: RetentionMode; onChange: (m: RetentionMode) => void }) {
    const modes: RetentionMode[] = ['daily', 'weekly', 'monthly'];

    return (
        <div className="flex items-center bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 gap-0.5">
            {modes.map((m) => (
                <button
                    key={m}
                    onClick={() => onChange(m)}
                    className={`relative px-3 sm:px-4 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200 ${
                        mode === m
                            ? 'text-white'
                            : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                    {mode === m && (
                        <motion.div
                            layoutId="mode-pill"
                            className="absolute inset-0 bg-emerald-500/15 border border-emerald-500/25 rounded-lg"
                            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                        />
                    )}
                    <span className="relative z-10 capitalize">{m}</span>
                </button>
            ))}
        </div>
    );
}

// ─── Cohort Heatmap ───

function CohortHeatmap({
    cohorts,
    mode,
}: {
    cohorts: CohortData[];
    mode: RetentionMode;
}) {
    const config = MODE_CONFIG[mode];
    const [tooltip, setTooltip] = useState<{
        visible: boolean;
        cohortDate: string;
        period: number;
        retention: number;
        users: number;
        x: number;
        y: number;
    }>({ visible: false, cohortDate: '', period: 0, retention: 0, users: 0, x: 0, y: 0 });

    const handleCellHover = useCallback((
        e: React.MouseEvent,
        cohort: CohortData,
        period: number,
        retention: number | null,
    ) => {
        if (retention === null) return;
        setTooltip({
            visible: true,
            cohortDate: cohort.date,
            period,
            retention,
            users: cohort.users,
            x: e.clientX,
            y: e.clientY,
        });
    }, []);

    const handleCellLeave = useCallback(() => {
        setTooltip(prev => ({ ...prev, visible: false }));
    }, []);

    return (
        <>
            <HeatmapTooltip
                visible={tooltip.visible}
                cohortDate={tooltip.cohortDate}
                period={tooltip.period}
                periodLabel={config.periodLabel}
                retention={tooltip.retention}
                users={tooltip.users}
                x={tooltip.x}
                y={tooltip.y}
            />

            <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
                <table className="w-full border-collapse text-xs min-w-[600px]">
                    <thead>
                        <tr>
                            <th className="text-left text-[10px] text-zinc-500 font-medium pb-3 pr-3 whitespace-nowrap sticky left-0 bg-black/95 z-10">
                                Cohort
                            </th>
                            <th className="text-right text-[10px] text-zinc-500 font-medium pb-3 px-2 whitespace-nowrap">
                                Users
                            </th>
                            {Array.from({ length: config.columns + 1 }, (_, i) => (
                                <th
                                    key={i}
                                    className="text-center text-[10px] text-zinc-500 font-medium pb-3 px-1 whitespace-nowrap"
                                >
                                    {config.periodLabel} {i}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cohorts.map((cohort, rowIdx) => (
                            <motion.tr
                                key={cohort.date}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 + rowIdx * 0.03, duration: 0.3 }}
                                className="group"
                            >
                                <td className="text-left text-[11px] text-zinc-300 font-medium py-1 pr-3 whitespace-nowrap sticky left-0 bg-black/95 z-10">
                                    {cohort.date}
                                </td>
                                <td className="text-right text-[11px] text-zinc-400 font-medium py-1 px-2 whitespace-nowrap tabular-nums">
                                    {cohort.users.toLocaleString()}
                                </td>
                                {Array.from({ length: config.columns + 1 }, (_, colIdx) => {
                                    const val = cohort.retention[colIdx] ?? null;
                                    return (
                                        <td
                                            key={colIdx}
                                            className="py-1 px-0.5"
                                            onMouseMove={(e) => handleCellHover(e, cohort, colIdx, val)}
                                            onMouseLeave={handleCellLeave}
                                        >
                                            <div
                                                className={`flex items-center justify-center rounded-md h-8 min-w-[48px] text-[11px] font-medium tabular-nums transition-all duration-150 ${
                                                    val !== null
                                                        ? `${retentionTextColor(val)} hover:ring-1 hover:ring-emerald-500/30 cursor-default`
                                                        : 'text-zinc-800'
                                                }`}
                                                style={{
                                                    backgroundColor: retentionCellBg(val),
                                                }}
                                            >
                                                {val !== null ? `${val}%` : '\u2014'}
                                            </div>
                                        </td>
                                    );
                                })}
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ─── Retention Curve Chart ───

function RetentionCurve({
    curve,
    mode,
}: {
    curve: { period: number; retention: number }[];
    mode: RetentionMode;
}) {
    const config = MODE_CONFIG[mode];

    return (
        <div className="h-[280px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.04)"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="period"
                        tick={{ fill: '#71717a', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                        tickFormatter={(v) => `${config.periodLabel} ${v}`}
                    />
                    <YAxis
                        tick={{ fill: '#71717a', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                        domain={[0, 100]}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="retention"
                        name="Avg. Retention"
                        stroke="#34d399"
                        strokeWidth={2.5}
                        fill="url(#retentionGradient)"
                        dot={{ r: 3, fill: '#34d399', stroke: '#050508', strokeWidth: 2 }}
                        activeDot={{ r: 5, fill: '#34d399', stroke: '#050508', strokeWidth: 2 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ─── Main Page ───

export default function RetentionPage() {
    const { selectedProperty } = useAnalyticsContext();
    const [mode, setMode] = useState<RetentionMode>('daily');
    const { data, isLoading, error } = useSWR<RetentionResponse>(
        selectedProperty ? `/api/analytics/retention?propertyId=${selectedProperty}&mode=${mode}` : null,
        fetcher,
        { keepPreviousData: true }
    );

    const config = MODE_CONFIG[mode];
    const checkpointCards = useMemo(() => {
        if (!data) return [];

        if (mode === 'daily') {
            return [
                { label: 'Day 1 Retention', helper: 'Average returning the next day.', value: data.averages.day1, trend: data.trends.day1, icon: Users, tone: 'emerald' as const },
                { label: 'Day 7 Retention', helper: 'Average returning after one week.', value: data.averages.day7, trend: data.trends.day7, icon: Calendar, tone: 'cyan' as const },
                { label: 'Day 14 Retention', helper: 'Average returning after two weeks.', value: data.averages.day14, trend: data.trends.day14, icon: Activity, tone: 'mixed' as const },
                { label: 'Day 30 Retention', helper: 'Average returning after one month.', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3, tone: 'amber' as const },
            ];
        }

        if (mode === 'weekly') {
            return [
                { label: 'Week 1 Retention', helper: 'Average returning in the following week.', value: data.averages.day1, trend: data.trends.day1, icon: Users, tone: 'emerald' as const },
                { label: 'Week 4 Retention', helper: 'Average returning after one month.', value: data.averages.day7, trend: data.trends.day7, icon: Calendar, tone: 'cyan' as const },
                { label: 'Week 6 Retention', helper: 'Average returning after six weeks.', value: data.averages.day14, trend: data.trends.day14, icon: Activity, tone: 'mixed' as const },
                { label: 'Week 8 Retention', helper: 'Average returning after two months.', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3, tone: 'amber' as const },
            ];
        }

        return [
            { label: 'Month 1 Retention', helper: 'Average returning the next month.', value: data.averages.day1, trend: data.trends.day1, icon: Users, tone: 'emerald' as const },
            { label: 'Month 2 Retention', helper: 'Average returning after two months.', value: data.averages.day7, trend: data.trends.day7, icon: Calendar, tone: 'cyan' as const },
            { label: 'Month 3 Retention', helper: 'Average returning after three months.', value: data.averages.day14, trend: data.trends.day14, icon: Activity, tone: 'mixed' as const },
            { label: 'Month 5 Retention', helper: 'Average returning after five months.', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3, tone: 'amber' as const },
        ];
    }, [data, mode]);

    if (isLoading && !data) {
        return <AnalyticsSubpageLoadingState title="Retention" />;
    }

    if (error) {
        return (
            <AnalyticsSubpageEmptyState
                title="Retention data is temporarily unavailable"
                description="We couldn't load the latest cohort view right now. Try again in a moment."
            />
        );
    }

    if (!data) {
        return null;
    }

    return (
        <AnalyticsSubpageShell
            eyebrow="Retention"
            title="Retention"
            description="Cohorts, return curves, and checkpoint retention."
            actions={(
                <div className="flex flex-wrap items-center gap-3">
                    <AnalyticsSubpageBadge label={`${config.label} cohorts`} tone="emerald" />
                    <ModeSwitcher mode={mode} onChange={setMode} />
                </div>
            )}
        >
            <AnalyticsSubpageMetricGrid>
                {checkpointCards.map((card) => (
                    <AnalyticsSubpageMetricCard
                        key={card.label}
                        label={card.label}
                        value={formatPercent(card.value, 1)}
                        icon={card.icon}
                        tone={card.tone}
                        trend={card.trend}
                    />
                ))}
            </AnalyticsSubpageMetricGrid>

            <AnalyticsSubpagePanel
                title="Cohort heatmap"
                action={<AnalyticsSubpageBadge label={`${data.cohorts.length} cohorts visible`} tone="mixed" />}
            >
                <CohortHeatmap cohorts={data.cohorts} mode={mode} />

                <div className="mt-4 flex items-center gap-4 border-t border-white/[0.06] pt-4">
                    <span className="text-[10px] font-medium text-zinc-600">Retention:</span>
                    <div className="flex items-center gap-1.5">
                        {[
                            { label: '0%', bg: retentionCellBg(2) },
                            { label: '10%', bg: retentionCellBg(10) },
                            { label: '20%', bg: retentionCellBg(20) },
                            { label: '50%', bg: retentionCellBg(50) },
                            { label: '100%', bg: retentionCellBg(100) },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center gap-1">
                                <div className="h-4 w-5 rounded" style={{ backgroundColor: item.bg }} />
                                <span className="text-[9px] text-zinc-600">{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <div className="h-4 w-5 rounded border border-zinc-800 bg-transparent" />
                        <span className="text-[9px] text-zinc-600">No data</span>
                    </div>
                </div>
            </AnalyticsSubpagePanel>

            <AnalyticsSubpagePanel
                title="Retention curve"
            >
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                    <RetentionCurve curve={data.curve} mode={mode} />
                    <div className="space-y-4">
                        <AnalyticsInsightList
                            items={[
                                {
                                    label: 'Fastest checkpoint',
                                    value: formatPercent(data.averages.day1, 1),
                                    note: `${config.periodLabel} 1 is the earliest checkpoint and usually the quickest signal of repeat value.`,
                                },
                                {
                                    label: 'Long-tail retention',
                                    value: formatPercent(data.averages.day30, 1),
                                    note: `Use this as the healthiest long-range benchmark for the current ${config.label.toLowerCase()} mode.`,
                                },
                                {
                                    label: 'Trend direction',
                                    value: data.trends.day7 >= 0 ? 'Improving' : 'Softening',
                                    note: `${data.trends.day7 >= 0 ? '+' : ''}${data.trends.day7.toFixed(1)}% change at the mid-cycle checkpoint.`,
                                },
                            ]}
                        />
                    </div>
                </div>
            </AnalyticsSubpagePanel>
        </AnalyticsSubpageShell>
    );
}
