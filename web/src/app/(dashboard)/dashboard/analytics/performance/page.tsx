'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Gauge, Zap, Eye, Clock, Activity,
    Monitor, Smartphone, Tablet,
    Info, CheckCircle2, AlertTriangle, XCircle,
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAnalyticsContext } from '../layout';

// ─── Types ───

interface MetricSnapshot {
    value: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface OverviewMetrics {
    lcp: MetricSnapshot;
    inp: MetricSnapshot;
    cls: MetricSnapshot;
    fcp: MetricSnapshot;
    ttfb: MetricSnapshot;
}

interface TrendPoint {
    date: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
}

interface PageMetrics {
    page: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
}

interface DeviceMetrics {
    device: string;
    lcp: number;
    inp: number;
    cls: number;
    fcp: number;
    ttfb: number;
    score: number;
}

interface PerformanceData {
    overview: OverviewMetrics;
    trend: TrendPoint[];
    byPage: PageMetrics[];
    byDevice: DeviceMetrics[];
    score: number;
    source?: 'crux';
    origin?: string;
    collectionPeriod?: {
        firstDate: { year: number; month: number; day: number };
        lastDate: { year: number; month: number; day: number };
    };
}

// ─── Constants ───

type MetricKey = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

const METRIC_CONFIG: Record<MetricKey, {
    label: string;
    fullName: string;
    unit: string;
    icon: React.ElementType;
    color: string;
    thresholds: [number, number];
}> = {
    lcp: { label: 'LCP', fullName: 'Largest Contentful Paint', unit: 's', icon: Eye, color: '#34d399', thresholds: [2.5, 4.0] },
    inp: { label: 'INP', fullName: 'Interaction to Next Paint', unit: 'ms', icon: Zap, color: '#38bdf8', thresholds: [200, 500] },
    cls: { label: 'CLS', fullName: 'Cumulative Layout Shift', unit: '', icon: Activity, color: '#a78bfa', thresholds: [0.1, 0.25] },
    fcp: { label: 'FCP', fullName: 'First Contentful Paint', unit: 's', icon: Clock, color: '#fbbf24', thresholds: [1.8, 3.0] },
    ttfb: { label: 'TTFB', fullName: 'Time to First Byte', unit: 's', icon: Gauge, color: '#f472b6', thresholds: [0.8, 1.8] },
};

const DEVICE_ICONS: Record<string, React.ElementType> = {
    Desktop: Monitor,
    Mobile: Smartphone,
    Tablet: Tablet,
};

const RATING_STYLES: Record<string, { bg: string; text: string; label: string; icon: React.ElementType }> = {
    'good':               { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Good', icon: CheckCircle2 },
    'needs-improvement':  { bg: 'bg-amber-500/10',   text: 'text-amber-400',   label: 'Needs Work', icon: AlertTriangle },
    'poor':               { bg: 'bg-red-500/10',      text: 'text-red-400',     label: 'Poor', icon: XCircle },
};

// ─── Helpers ───

function formatMetric(key: MetricKey, value: number): string {
    const cfg = METRIC_CONFIG[key];
    if (key === 'inp') return `${Math.round(value)}${cfg.unit}`;
    if (key === 'cls') return value.toFixed(3);
    return `${value.toFixed(1)}${cfg.unit}`;
}

function rateMetric(key: MetricKey, value: number): 'good' | 'needs-improvement' | 'poor' {
    const [good, poor] = METRIC_CONFIG[key].thresholds;
    if (value < good) return 'good';
    if (value < poor) return 'needs-improvement';
    return 'poor';
}

// ─── Animated Number ───

function AnimatedValue({ value, formatter }: { value: number; formatter: (v: number) => string }) {
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        const duration = 800;
        const start = performance.now();
        const from = 0;
        const to = value;

        function tick(now: number) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(from + (to - from) * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }, [value]);

    return <span>{formatter(display)}</span>;
}

// ─── Score Ring ───

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const color = score >= 90 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171';

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={strokeWidth}
                />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{score}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Score</span>
            </div>
        </div>
    );
}

// ─── Custom Tooltip ───

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900/95 border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
            <p className="text-[10px] text-zinc-500 mb-1.5">{label}</p>
            {payload.map((entry: any) => (
                <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-zinc-400">{METRIC_CONFIG[entry.dataKey as MetricKey]?.label}:</span>
                    <span className="text-white font-medium">
                        {formatMetric(entry.dataKey as MetricKey, entry.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Main Page Component ───

export default function PerformancePage() {
    const { selectedProperty } = useAnalyticsContext();
    const [data, setData] = useState<PerformanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(['lcp', 'inp', 'cls']);
    const [sortKey, setSortKey] = useState<'page' | 'score'>('score');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        if (!selectedProperty) return;
        async function fetchData() {
            try {
                const res = await fetch(`/api/analytics/performance?propertyId=${selectedProperty}`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                }
            } catch (e) {
                console.error('Failed to fetch performance data:', e);
            } finally {
                setLoading(false);
            }
        }
        setLoading(true);
        setData(null);
        fetchData();
    }, [selectedProperty]);

    const sortedPages = useMemo(() => {
        if (!data) return [];
        return [...data.byPage].sort((a, b) => {
            const aVal = sortKey === 'page' ? a.page : a.score;
            const bVal = sortKey === 'page' ? b.page : b.score;
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });
    }, [data, sortKey, sortDir]);

    function toggleMetric(key: MetricKey) {
        setActiveMetrics(prev =>
            prev.includes(key)
                ? prev.length > 1 ? prev.filter(m => m !== key) : prev
                : [...prev, key]
        );
    }

    function handleSort(key: 'page' | 'score') {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'score' ? 'asc' : 'asc');
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-white/10 border-t-emerald-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex items-center justify-center py-20">
                <p className="text-zinc-500 text-sm">Failed to load performance data.</p>
            </div>
        );
    }

    const metrics = Object.entries(METRIC_CONFIG) as [MetricKey, typeof METRIC_CONFIG[MetricKey]][];

    return (
        <div className="space-y-6">
            {/* ─── Info Banner ─── */}
            {data.source === 'crux' ? (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.12]"
                >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <p className="text-xs text-emerald-300/80">
                        Powered by <span className="font-medium text-emerald-300">Chrome UX Report (CrUX)</span>
                        {data.origin && <span className="text-emerald-400/60"> for {data.origin}</span>}
                        {data.collectionPeriod && (
                            <span className="text-emerald-400/50">
                                {' '}({data.collectionPeriod.firstDate.year}-{String(data.collectionPeriod.firstDate.month).padStart(2, '0')}-{String(data.collectionPeriod.firstDate.day).padStart(2, '0')} to {data.collectionPeriod.lastDate.year}-{String(data.collectionPeriod.lastDate.month).padStart(2, '0')}-{String(data.collectionPeriod.lastDate.day).padStart(2, '0')})
                            </span>
                        )}
                    </p>
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/[0.12]"
                >
                    <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <p className="text-xs text-blue-300/80">
                        Showing mock data. Connect to the <span className="font-medium text-blue-300">CrUX API</span> for real Core Web Vitals from Chrome user experience reports.
                    </p>
                </motion.div>
            )}

            {/* ─── Score + Overview Cards ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5">
                {/* Score Ring Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    className="premium-card rounded-2xl p-6 flex flex-col items-center justify-center min-w-[180px]"
                >
                    <ScoreRing score={data.score} size={140} />
                    <p className="text-xs text-zinc-500 mt-3">Overall Performance</p>
                </motion.div>

                {/* Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {metrics.map(([key, cfg], i) => {
                        const snap = data.overview[key];
                        const style = RATING_STYLES[snap.rating];
                        const Icon = cfg.icon;
                        const StatusIcon = style.icon;

                        return (
                            <motion.div
                                key={key}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: i * 0.05 }}
                                className="premium-card rounded-xl p-4 flex flex-col gap-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}15` }}>
                                            <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                                        </div>
                                        <span className="text-xs font-semibold text-zinc-400">{cfg.label}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xl font-bold text-white tracking-tight">
                                        <AnimatedValue
                                            value={snap.value}
                                            formatter={(v) => formatMetric(key, v)}
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-600 mt-0.5">{cfg.fullName}</p>
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md w-fit ${style.bg}`}>
                                    <StatusIcon className={`w-3 h-3 ${style.text}`} />
                                    <span className={`text-[10px] font-semibold ${style.text}`}>{style.label}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Trend Chart ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="premium-card rounded-2xl p-5"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                    <div>
                        <h3 className="text-sm font-bold text-white">Web Vitals Trend</h3>
                        <p className="text-[11px] text-zinc-600 mt-0.5">Last 30 days</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {metrics.map(([key, cfg]) => {
                            const isActive = activeMetrics.includes(key);
                            return (
                                <button
                                    key={key}
                                    onClick={() => toggleMetric(key)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                        isActive
                                            ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                                            : 'bg-white/[0.02] text-zinc-600 border border-white/[0.04] hover:text-zinc-400 hover:border-white/[0.08]'
                                    }`}
                                >
                                    <div
                                        className="w-2 h-2 rounded-full transition-opacity"
                                        style={{ backgroundColor: cfg.color, opacity: isActive ? 1 : 0.3 }}
                                    />
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.trend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: '#71717a' }}
                                tickLine={false}
                                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                                tickFormatter={(v: string) => {
                                    const d = new Date(v);
                                    return `${d.getMonth() + 1}/${d.getDate()}`;
                                }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#71717a' }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            {metrics.map(([key, cfg]) =>
                                activeMetrics.includes(key) ? (
                                    <Line
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stroke={cfg.color}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                    />
                                ) : null
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ─── By Page + By Device ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
                {/* By Page */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="premium-card rounded-2xl p-5"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-white">By Page</h3>
                            <p className="text-[11px] text-zinc-600 mt-0.5">Performance breakdown per page</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th
                                        className="text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 pr-4 cursor-pointer hover:text-zinc-300 transition"
                                        onClick={() => handleSort('page')}
                                    >
                                        Page {sortKey === 'page' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                                    </th>
                                    {(['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as MetricKey[]).map(key => (
                                        <th key={key} className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 px-2 whitespace-nowrap">
                                            {METRIC_CONFIG[key].label}
                                        </th>
                                    ))}
                                    <th
                                        className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 pl-2 cursor-pointer hover:text-zinc-300 transition"
                                        onClick={() => handleSort('score')}
                                    >
                                        Score {sortKey === 'score' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedPages.map((row, i) => (
                                    <motion.tr
                                        key={row.page}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.2, delay: i * 0.03 }}
                                        className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition"
                                    >
                                        <td className="py-3 pr-4">
                                            <span className="text-xs text-white font-medium">{row.page}</span>
                                        </td>
                                        {(['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as MetricKey[]).map(key => {
                                            const rating = rateMetric(key, row[key]);
                                            const style = RATING_STYLES[rating];
                                            return (
                                                <td key={key} className="py-3 px-2 text-right">
                                                    <span className={`text-xs font-medium ${style.text}`}>
                                                        {formatMetric(key, row[key])}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td className="py-3 pl-2 text-right">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
                                                row.score >= 90
                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                    : row.score >= 50
                                                    ? 'bg-amber-500/10 text-amber-400'
                                                    : 'bg-red-500/10 text-red-400'
                                            }`}>
                                                {row.score}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* By Device */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    className="premium-card rounded-2xl p-5"
                >
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-white">By Device</h3>
                        <p className="text-[11px] text-zinc-600 mt-0.5">Device-level performance</p>
                    </div>
                    <div className="space-y-3">
                        {data.byDevice.map((device, i) => {
                            const DeviceIcon = DEVICE_ICONS[device.device] || Monitor;
                            const scoreColor = device.score >= 90 ? 'text-emerald-400' : device.score >= 50 ? 'text-amber-400' : 'text-red-400';
                            const scoreBg = device.score >= 90 ? 'bg-emerald-500/10' : device.score >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10';

                            return (
                                <motion.div
                                    key={device.device}
                                    initial={{ opacity: 0, x: 8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.3, delay: 0.25 + i * 0.08 }}
                                    className="bg-white/[0.025] border border-white/[0.06] rounded-xl p-4"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                                                <DeviceIcon className="w-4 h-4 text-zinc-400" />
                                            </div>
                                            <span className="text-sm font-semibold text-white">{device.device}</span>
                                        </div>
                                        <span className={`text-lg font-bold ${scoreColor}`}>{device.score}</span>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2">
                                        {(['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as MetricKey[]).map(key => {
                                            const rating = rateMetric(key, device[key]);
                                            const style = RATING_STYLES[rating];
                                            return (
                                                <div key={key} className="text-center">
                                                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">{METRIC_CONFIG[key].label}</p>
                                                    <p className={`text-[11px] font-semibold ${style.text}`}>
                                                        {formatMetric(key, device[key])}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {/* Score bar */}
                                    <div className="mt-3 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                        <motion.div
                                            className={`h-full rounded-full ${
                                                device.score >= 90 ? 'bg-emerald-400' : device.score >= 50 ? 'bg-amber-400' : 'bg-red-400'
                                            }`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${device.score}%` }}
                                            transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: [0.4, 0, 0.2, 1] }}
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>
            </div>

            {/* ─── Thresholds Legend ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="premium-card rounded-2xl p-5"
            >
                <h3 className="text-sm font-bold text-white mb-4">Core Web Vitals Thresholds</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {metrics.map(([key, cfg]) => (
                        <div key={key} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-2.5">
                                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: `${cfg.color}15` }}>
                                    <cfg.icon className="w-3 h-3" style={{ color: cfg.color }} />
                                </div>
                                <span className="text-xs font-semibold text-zinc-300">{cfg.label}</span>
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-emerald-400">Good</span>
                                    <span className="text-[10px] text-zinc-500">
                                        {'< '}{cfg.thresholds[0]}{cfg.unit || ''}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-amber-400">Needs Work</span>
                                    <span className="text-[10px] text-zinc-500">
                                        {cfg.thresholds[0]}{cfg.unit || ''} - {cfg.thresholds[1]}{cfg.unit || ''}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-red-400">Poor</span>
                                    <span className="text-[10px] text-zinc-500">
                                        {'> '}{cfg.thresholds[1]}{cfg.unit || ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
