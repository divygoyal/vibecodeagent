'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import {
    Users, TrendingUp, TrendingDown, Calendar, BarChart3,
    Activity, Loader2,
} from 'lucide-react';
import useSWR from 'swr';

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

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[160px]">
            <p className="text-[11px] font-semibold text-white mb-2">{label}</p>
            <div className="space-y-1.5">
                {payload.map((e: any, i: number) => (
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

// ─── Overview Card ───

function OverviewCard({
    label,
    subLabel,
    value,
    trend,
    icon: Icon,
    delay,
}: {
    label: string;
    subLabel: string;
    value: number;
    trend: number;
    icon: any;
    delay: number;
}) {
    const isPositive = trend >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="premium-card p-4 sm:p-5"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">{label}</span>
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                    isPositive
                        ? 'text-emerald-400 bg-emerald-500/8 border-emerald-500/15'
                        : 'text-red-400 bg-red-500/8 border-red-500/15'
                }`}>
                    {isPositive ? (
                        <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                        <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    {isPositive ? '+' : ''}{trend}%
                </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{value}%</p>
            <p className="text-[10px] text-zinc-600 mt-1">{subLabel}</p>
        </motion.div>
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
    const [mode, setMode] = useState<RetentionMode>('daily');
    const { data, isLoading, error } = useSWR<RetentionResponse>(
        `/api/analytics/retention?mode=${mode}`,
        fetcher,
        { keepPreviousData: true }
    );

    const config = MODE_CONFIG[mode];

    // Overview card configs adapted by mode
    const overviewCards = useMemo(() => {
        if (!data) return [];

        if (mode === 'daily') {
            return [
                { label: 'Day 1 Retention', subLabel: 'Avg. returning next day', value: data.averages.day1, trend: data.trends.day1, icon: Users },
                { label: 'Day 7 Retention', subLabel: 'Avg. returning after 1 week', value: data.averages.day7, trend: data.trends.day7, icon: Calendar },
                { label: 'Day 14 Retention', subLabel: 'Avg. returning after 2 weeks', value: data.averages.day14, trend: data.trends.day14, icon: Activity },
                { label: 'Day 30 Retention', subLabel: 'Avg. returning after 1 month', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3 },
            ];
        }

        if (mode === 'weekly') {
            return [
                { label: 'Week 1 Retention', subLabel: 'Avg. returning after 1 week', value: data.averages.day1, trend: data.trends.day1, icon: Users },
                { label: 'Week 4 Retention', subLabel: 'Avg. returning after 1 month', value: data.averages.day7, trend: data.trends.day7, icon: Calendar },
                { label: 'Week 6 Retention', subLabel: 'Avg. returning after 6 weeks', value: data.averages.day14, trend: data.trends.day14, icon: Activity },
                { label: 'Week 8 Retention', subLabel: 'Avg. returning after 2 months', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3 },
            ];
        }

        // monthly
        return [
            { label: 'Month 1 Retention', subLabel: 'Avg. returning next month', value: data.averages.day1, trend: data.trends.day1, icon: Users },
            { label: 'Month 2 Retention', subLabel: 'Avg. returning after 2 months', value: data.averages.day7, trend: data.trends.day7, icon: Calendar },
            { label: 'Month 3 Retention', subLabel: 'Avg. returning after 3 months', value: data.averages.day14, trend: data.trends.day14, icon: Activity },
            { label: 'Month 5 Retention', subLabel: 'Avg. returning after 5 months', value: data.averages.day30, trend: data.trends.day30, icon: BarChart3 },
        ];
    }, [data, mode]);

    if (isLoading && !data) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium">Failed to load retention data</p>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-6">
            {/* ─── Header ─── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-400" />
                        Retention Analysis
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Track how many users return after their first visit
                    </p>
                </div>
                <ModeSwitcher mode={mode} onChange={setMode} />
            </motion.div>

            {/* ─── Overview Cards ─── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {overviewCards.map((card, i) => (
                    <OverviewCard key={card.label} {...card} delay={0.05 + i * 0.04} />
                ))}
            </div>

            {/* ─── Cohort Heatmap ─── */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="premium-card p-5 sm:p-6"
            >
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Cohort Retention Heatmap</h3>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                            Each row shows a cohort and their return rate over time
                        </p>
                    </div>
                </div>

                <CohortHeatmap cohorts={data.cohorts} mode={mode} />

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
                    <span className="text-[10px] text-zinc-600 font-medium">Retention:</span>
                    <div className="flex items-center gap-1.5">
                        {[
                            { label: '0%', bg: retentionCellBg(2) },
                            { label: '10%', bg: retentionCellBg(10) },
                            { label: '20%', bg: retentionCellBg(20) },
                            { label: '50%', bg: retentionCellBg(50) },
                            { label: '100%', bg: retentionCellBg(100) },
                        ].map((item) => (
                            <div key={item.label} className="flex items-center gap-1">
                                <div
                                    className="w-5 h-4 rounded"
                                    style={{ backgroundColor: item.bg }}
                                />
                                <span className="text-[9px] text-zinc-600">{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                        <div className="w-5 h-4 rounded border border-zinc-800 bg-transparent" />
                        <span className="text-[9px] text-zinc-600">No data</span>
                    </div>
                </div>
            </motion.div>

            {/* ─── Retention Curve ─── */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="premium-card p-5 sm:p-6"
            >
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">Retention Curve</h3>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                            Average retention % across all cohorts for each {config.periodLabel.toLowerCase()}
                        </p>
                    </div>
                </div>

                <RetentionCurve curve={data.curve} mode={mode} />
            </motion.div>
        </div>
    );
}
