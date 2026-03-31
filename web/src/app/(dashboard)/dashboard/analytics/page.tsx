'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Target,
    Globe, Download, RefreshCw, Filter as FilterIcon, BarChart3,
    Maximize2, ChevronDown
} from 'lucide-react';
import { exportAnalyticsData } from '@/lib/exportUtils';
import { useAnalyticsData } from '@/lib/useDashboardData';
import LastUpdated from '@/components/dashboard/LastUpdated';
import { useAnalyticsContext } from './layout';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import DataRow from '@/components/analytics/DataRow';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import TableActionMenu, { useTableActions } from '@/components/TableActionMenu';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { AnnotationBadge, getAnnotations } from '@/components/AnnotationBadge';
import { SkeletonDashboard } from '@/components/analytics/SkeletonLoader';
import DrilldownDrawer from '@/components/analytics/DrilldownDrawer';
import { useFilterStore, type DashboardFilters } from '@/stores/analyticsFilterStore';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });

// ─── Helpers ───
function fmt(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}
function fmtDur(s: number) { return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`; }

function Change({ value, suffix = '%' }: { value: number; suffix?: string }) {
    if (value === 0) return <span className="text-[9px] sm:text-[10px] text-zinc-600">--</span>;
    const up = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] font-semibold tabular-nums truncate max-w-full ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" /> : <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />}
            <span className="truncate">{up ? '+' : ''}{value}{suffix}</span>
        </span>
    );
}

function Bar({ value, max, color = 'bg-blue-500/40' }: { value: number; max: number; color?: string }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-zinc-300 text-xs tabular-nums font-medium min-w-[32px] sm:min-w-[40px] text-right">{value?.toLocaleString()}</span>
            <div className="flex-1 h-[5px] bg-white/[0.04] rounded-full overflow-hidden min-w-[40px] sm:min-w-[60px]">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[200px]">
            <p className="text-[11px] font-semibold text-white mb-2">{label}</p>
            <div className="space-y-1.5">
                {payload.map((e: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: e.color }} />
                            <span className="text-[10px] text-zinc-500">{e.name}</span>
                        </div>
                        <span className="text-xs font-bold text-white tabular-nums">{e.value?.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Sparkline ───
function Sparkline({ data, dataKey, color = '#34d399' }: { data: any[]; dataKey: string; color?: string }) {
    if (!data.length) return null;
    return (
        <div className="h-[40px] w-full -mt-1">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#spark-${dataKey})`}
                          strokeWidth={1.5} dot={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

const CARD = 'premium-card stat-card-hover';

// ─── Tab Button ───
function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition whitespace-nowrap ${
                active ? 'bg-white/[0.06] text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
        >
            {label}
        </button>
    );
}

// ─── Chart Stat Switcher ───
type ChartStat = 'activeUsers' | 'sessions' | 'pageViews' | 'bounceRate';
const CHART_STATS: { key: ChartStat; label: string; color: string }[] = [
    { key: 'activeUsers', label: 'Users', color: '#34d399' },
    { key: 'sessions', label: 'Sessions', color: '#22d3ee' },
    { key: 'pageViews', label: 'Pageviews', color: '#a78bfa' },
    { key: 'bounceRate', label: 'Bounce Rate', color: '#f472b6' },
];

// ─── Time Bucket ───
type TimeBucket = 'day' | 'week' | 'month';
const BUCKET_LABELS: Record<TimeBucket, string> = { day: 'Day', week: 'Week', month: 'Month' };
const BUCKET_OPTIONS: TimeBucket[] = ['day', 'week', 'month'];

function getISOWeek(d: Date): number {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function aggregateByBucket(data: any[], bucket: TimeBucket): any[] {
    if (!data.length) return data;

    if (bucket === 'day') return data;

    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const d = new Date(item.date);
        let key: string;
        if (bucket === 'week') {
            const wk = getISOWeek(d);
            key = `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
        } else {
            key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    }

    return Object.entries(groups).map(([key, items]) => {
        const sumUsers = items.reduce((s, d) => s + (d.activeUsers || 0), 0);
        const sumSessions = items.reduce((s, d) => s + (d.sessions || 0), 0);
        const sumPageViews = items.reduce((s, d) => s + (d.pageViews || 0), 0);
        const avgBounce = items.reduce((s, d) => s + (d.bounceRate || 0), 0) / items.length;
        let label: string;
        if (bucket === 'week') {
            const firstDate = new Date(items[0].date);
            label = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            const [y, m] = key.split('-');
            const dt = new Date(Number(y), Number(m) - 1);
            label = dt.toLocaleDateString('en-US', { month: 'short' }) + " \u2019" + String(y).slice(2);
        }
        return {
            date: label,
            activeUsers: sumUsers,
            sessions: sumSessions,
            pageViews: sumPageViews,
            bounceRate: Math.round(avgBounce * 10) / 10,
        };
    });
}

function TimeBucketDropdown({ bucket, setBucket }: { bucket: TimeBucket; setBucket: (b: TimeBucket) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-[10px] text-zinc-400 border border-white/[0.06] rounded-md px-2 py-1 hover:border-white/[0.12] hover:text-zinc-300 transition"
            >
                {BUCKET_LABELS[bucket]}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-white/[0.08] rounded-lg shadow-xl py-1 min-w-[90px]">
                    {BUCKET_OPTIONS.map(opt => (
                        <button
                            key={opt}
                            onClick={() => { setBucket(opt); setOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-[11px] transition ${
                                bucket === opt
                                    ? 'text-white bg-white/[0.06]'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                        >
                            {BUCKET_LABELS[opt]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Overview Page ───
export default function AnalyticsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data: analyticsData, isLoading, isError, refresh } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);
    const { filters, toggleFilter } = useFilterStore();
    const [drilldown, setDrilldown] = useState<any>(null);
    const [chartStat, setChartStat] = useState<ChartStat>('activeUsers');
    const [bucket, setBucket] = useState<TimeBucket>('day');
    const { auditPage, analyzeWithAI, optimizePage, copyToClipboard, openExternal } = useTableActions();

    useEffect(() => {
        const handler = () => {
            if (analyticsData) exportAnalyticsData(analyticsData);
        };
        window.addEventListener('trafficclaw:export-analytics', handler);
        return () => window.removeEventListener('trafficclaw:export-analytics', handler);
    }, [analyticsData]);

    if (isLoading && !analyticsData) return <SkeletonDashboard />;
    if (isError && !analyticsData) {
        const errorMsg = isError?.message || isError?.toString?.() || 'Failed to load analytics data';
        const isTokenError = errorMsg.toLowerCase().includes('token') || errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('401');
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <BarChart3 className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-red-400 text-sm font-medium">Analytics data unavailable</p>
                <p className="text-zinc-500 text-xs max-w-md text-center">{errorMsg}</p>
                <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => refresh()} className="px-4 py-2 text-xs text-blue-400 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition border border-blue-500/20">
                        Retry
                    </button>
                    {isTokenError && (
                        <button onClick={() => signIn('google')} className="px-4 py-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition border border-emerald-500/20">
                            Re-connect Google
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const kpis = analyticsData?.kpis;
    const traffic: any[] = analyticsData?.traffic || [];
    const pages: any[] = analyticsData?.pages || [];
    const devices: any[] = analyticsData?.devices || [];
    const countries: any[] = analyticsData?.countries || [];
    const browsers: any[] = analyticsData?.browsers || [];
    const operatingSystems: any[] = analyticsData?.operatingSystems || [];
    const channels: any[] = analyticsData?.channels || [];
    const referrers: any[] = analyticsData?.referrers || [];
    const cities: any[] = analyticsData?.cities || [];
    const entryPages: any[] = analyticsData?.entryPages || [];
    const languages: any[] = analyticsData?.languages || [];

    // ─── Cross-filtering ───
    const fCountries = filters.country.length > 0 ? countries.filter((c: any) => filters.country.includes(c.country)) : countries;
    const fCities = filters.country.length > 0 ? cities.filter((c: any) => filters.country.includes(c.country)) : cities;
    const fReferrers = filters.referrer.length > 0 ? referrers.filter((r: any) => filters.referrer.includes(r.name)) : referrers;
    const fPages = filters.page.length > 0 ? pages.filter((p: any) => filters.page.includes(p.page)) : pages;
    const fDevices = filters.device.length > 0 ? devices.filter((d: any) => filters.device.includes(d.device)) : devices;
    const fBrowsers = filters.browser.length > 0 ? browsers.filter((b: any) => filters.browser.includes(b.name)) : browsers;
    const fOS = filters.os.length > 0 ? operatingSystems.filter((o: any) => filters.os.includes(o.name)) : operatingSystems;
    const fChannels = filters.channel.length > 0 ? channels.filter((c: any) => filters.channel.includes(c.name)) : channels;
    const fEntryPages = filters.page.length > 0 ? entryPages.filter((p: any) => filters.page.includes(p.page)) : entryPages;

    // Max values for progress bars
    const maxRef = Math.max(...referrers.map((r: any) => r.value || 0), 1);
    const maxPageViews = Math.max(...pages.map((p: any) => p.views || 0), 1);
    const maxCountryUsers = Math.max(...countries.map((c: any) => c.users || 0), 1);
    const maxEntryPageSessions = Math.max(...entryPages.map((p: any) => p.sessions || 0), 1);

    const anyFilterActive = Object.values(filters).some(arr => arr.length > 0);

    // ─── Cross-filter: recalculate KPIs ───
    const filteredKpis = useMemo(() => {
        if (!kpis || !anyFilterActive) return null;
        let ratio = 1;
        if (filters.country.length > 0) {
            const filteredUsers = fCountries.reduce((s: number, c: any) => s + (c.users || 0), 0);
            const totalUsers = countries.reduce((s: number, c: any) => s + (c.users || 0), 0);
            ratio = Math.min(ratio, totalUsers > 0 ? filteredUsers / totalUsers : 0);
        }
        if (filters.page.length > 0) {
            const filteredViews = fPages.reduce((s: number, p: any) => s + (p.views || 0), 0);
            const totalViews = pages.reduce((s: number, p: any) => s + (p.views || 0), 0);
            ratio = Math.min(ratio, totalViews > 0 ? filteredViews / totalViews : 0);
        }
        if (filters.device.length > 0) {
            const filteredSessions = fDevices.reduce((s: number, d: any) => s + (d.sessions || 0), 0);
            const totalSessions = devices.reduce((s: number, d: any) => s + (d.sessions || 0), 0);
            ratio = Math.min(ratio, totalSessions > 0 ? filteredSessions / totalSessions : 0);
        }
        if (filters.browser.length > 0) {
            const filteredVal = fBrowsers.reduce((s: number, b: any) => s + (b.value || 0), 0);
            const totalVal = browsers.reduce((s: number, b: any) => s + (b.value || 0), 0);
            ratio = Math.min(ratio, totalVal > 0 ? filteredVal / totalVal : 0);
        }
        if (filters.channel.length > 0) {
            const filteredVal = fChannels.reduce((s: number, c: any) => s + (c.value || 0), 0);
            const totalVal = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
            ratio = Math.min(ratio, totalVal > 0 ? filteredVal / totalVal : 0);
        }
        if (filters.referrer.length > 0) {
            const filteredVal = fReferrers.reduce((s: number, r: any) => s + (r.value || 0), 0);
            const totalVal = referrers.reduce((s: number, r: any) => s + (r.value || 0), 0);
            ratio = Math.min(ratio, totalVal > 0 ? filteredVal / totalVal : 0);
        }
        if (filters.os.length > 0) {
            const filteredVal = fOS.reduce((s: number, o: any) => s + (o.value || 0), 0);
            const totalVal = operatingSystems.reduce((s: number, o: any) => s + (o.value || 0), 0);
            ratio = Math.min(ratio, totalVal > 0 ? filteredVal / totalVal : 0);
        }
        return {
            totalUsers: Math.round(kpis.totalUsers * ratio),
            totalSessions: Math.round(kpis.totalSessions * ratio),
            totalPageViews: Math.round(kpis.totalPageViews * ratio),
            avgBounceRate: kpis.avgBounceRate,
            _ratio: ratio,
        };
    }, [kpis, anyFilterActive, filters, fCountries, fPages, fDevices, fBrowsers, fChannels, fReferrers, fOS, countries, pages, devices, browsers, channels, referrers, operatingSystems]);

    // Filtered traffic for chart
    const chartTraffic = useMemo(() => {
        if (!anyFilterActive || !filteredKpis) return traffic;
        const r = filteredKpis._ratio;
        return traffic.map((d: any) => ({
            ...d,
            activeUsers: Math.round((d.activeUsers || 0) * r),
            sessions: Math.round((d.sessions || 0) * r),
            pageViews: Math.round((d.pageViews || 0) * r),
        }));
    }, [traffic, anyFilterActive, filteredKpis]);

    // Aggregate chart data based on selected time bucket
    const bucketedTraffic = useMemo(() => aggregateByBucket(chartTraffic, bucket), [chartTraffic, bucket]);

    const displayKpis = filteredKpis || kpis;
    const activeStat = CHART_STATS.find(s => s.key === chartStat)!;

    // Sparkline data: last 14 days with computed fields
    const sparklineData = useMemo(() => {
        const recent = chartTraffic.slice(-14);
        return recent.map((d: any) => ({
            ...d,
            pagesPerSession: d.sessions > 0 ? d.pageViews / d.sessions : 0,
        }));
    }, [chartTraffic]);

    return (
        <div className="space-y-2 sm:space-y-3 overflow-hidden">
            {/* Data freshness */}
            {analyticsData && (
                <div className="flex justify-end">
                    <LastUpdated timestamp={new Date()} onRefresh={() => refresh()} isRefreshing={isLoading} />
                </div>
            )}

            {/* ─── 1. Compact KPI Strip with Sparklines ─── */}
            {kpis && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${CARD} overflow-hidden`}
                >
                    <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-white/[0.04]">
                        {[
                            { label: 'Users', value: displayKpis?.totalUsers ?? kpis.totalUsers, change: kpis.changeUsers, format: 'number', sparkKey: 'activeUsers', statKey: 'activeUsers' as ChartStat, color: '#34d399' },
                            { label: 'Sessions', value: displayKpis?.totalSessions ?? kpis.totalSessions, change: kpis.changeSessions, format: 'number', sparkKey: 'sessions', statKey: 'sessions' as ChartStat, color: '#22d3ee' },
                            { label: 'Page Views', value: displayKpis?.totalPageViews ?? kpis.totalPageViews, change: kpis.changePageViews, format: 'number', sparkKey: 'pageViews', statKey: 'pageViews' as ChartStat, color: '#a78bfa' },
                            { label: 'Pages / Session', value: kpis.pagesPerSession || 0, change: 0, format: 'decimal', sparkKey: 'pagesPerSession', statKey: 'pageViews' as ChartStat, color: '#fbbf24' },
                            { label: 'Bounce Rate', value: displayKpis?.avgBounceRate ?? kpis.avgBounceRate, change: kpis.changeBounceRate, format: 'percent', sparkKey: 'bounceRate', statKey: 'bounceRate' as ChartStat, color: '#f472b6' },
                            { label: 'Avg Duration', value: kpis.avgSessionDuration || 0, change: 0, format: 'duration', sparkKey: 'avgSessionDuration', statKey: 'sessions' as ChartStat, color: '#60a5fa' },
                        ].map((k, i) => (
                            <div
                                key={i}
                                className={`px-3 py-2 text-center cursor-pointer transition-colors ${chartStat === k.statKey ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}
                                onClick={() => setChartStat(k.statKey)}
                            >
                                <p className="text-[10px] font-medium text-zinc-500 mb-0.5 truncate">{k.label}</p>
                                <p className="text-lg sm:text-xl md:text-2xl font-medium text-white tabular-nums leading-tight">
                                    {k.format === 'duration' ? fmtDur(k.value)
                                        : k.format === 'percent' ? `${k.value}%`
                                        : k.format === 'decimal' ? (typeof k.value === 'number' ? k.value.toFixed(1) : k.value)
                                        : <AnimatedCounter value={k.value} formatter={fmt} />
                                    }
                                </p>
                                <Change value={k.change} />
                                <Sparkline data={sparklineData} dataKey={k.sparkKey} color={k.color} />
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ─── 2. Full-Width Chart with Stat Switcher ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.08 }}
                className={`${CARD} p-3 sm:p-5 overflow-hidden`}
            >
                {/* Chart header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[11px] text-zinc-500 font-medium hidden sm:inline">TrafficClaw</span>
                        <h3 className="text-sm sm:text-base font-semibold text-white">{activeStat.label}</h3>
                        {anyFilterActive && (
                            <span className="flex items-center gap-1 text-[9px] text-blue-400 bg-blue-500/[0.08] border border-blue-500/20 rounded-md px-2 py-0.5 flex-shrink-0">
                                <FilterIcon className="w-2.5 h-2.5" /> Filtered
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => refresh()} className="p-1.5 rounded text-zinc-600 hover:text-blue-400 transition">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => analyticsData && exportAnalyticsData(analyticsData)} className="p-1.5 rounded text-zinc-600 hover:text-white transition">
                            <Download className="w-3.5 h-3.5" />
                        </button>
                        <TimeBucketDropdown bucket={bucket} setBucket={setBucket} />
                    </div>
                </div>

                {/* Stat switcher buttons */}
                <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
                    {CHART_STATS.map(stat => (
                        <button
                            key={stat.key}
                            onClick={() => setChartStat(stat.key)}
                            className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition whitespace-nowrap border ${
                                chartStat === stat.key
                                    ? 'bg-white/[0.06] text-white border-white/[0.1]'
                                    : 'text-zinc-500 hover:text-zinc-300 border-transparent hover:border-white/[0.06]'
                            }`}
                        >
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: stat.color }} />
                            {stat.label}
                        </button>
                    ))}
                </div>

                {/* Area chart */}
                <div className="h-[220px] sm:h-[300px] overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={bucketedTraffic} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                            <defs>
                                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={activeStat.color} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={activeStat.color} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: '#3f3f46' }}
                                tickFormatter={(v: string) => {
                                    // Aggregated buckets already have pre-formatted labels
                                    if (bucket === 'week' || bucket === 'month') return v;
                                    const d = new Date(v);
                                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#3f3f46' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                                type="monotone"
                                dataKey={chartStat}
                                name={activeStat.label}
                                stroke={activeStat.color}
                                fill="url(#chartGrad)"
                                strokeWidth={2}
                                dot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ─── 3. Traffic Sources + Pages (tabbed panels, two-column) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
                <TrafficSourcesPanel
                    referrers={fReferrers}
                    channels={fChannels}
                    allChannels={channels}
                    maxRef={maxRef}
                    filters={filters}
                    toggleFilter={toggleFilter}
                    analyzeWithAI={analyzeWithAI}
                    openExternal={openExternal}
                    copyToClipboard={copyToClipboard}
                />
                <PagesPanel
                    pages={fPages}
                    entryPages={fEntryPages}
                    maxPageViews={maxPageViews}
                    maxEntryPageSessions={maxEntryPageSessions}
                    filters={filters}
                    toggleFilter={toggleFilter}
                    auditPage={auditPage}
                    optimizePage={optimizePage}
                    analyzeWithAI={analyzeWithAI}
                    openExternal={openExternal}
                    copyToClipboard={copyToClipboard}
                />
            </div>

            {/* ─── 4. Technology + Geography (tabbed panels, two-column) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
                <TechPanel
                    devices={fDevices}
                    browsers={fBrowsers}
                    operatingSystems={fOS}
                    allDevices={devices}
                    allBrowsers={browsers}
                    allOS={operatingSystems}
                    filters={filters}
                    toggleFilter={toggleFilter}
                    analyzeWithAI={analyzeWithAI}
                    copyToClipboard={copyToClipboard}
                />
                <GeoPanel
                    countries={fCountries}
                    cities={fCities}
                    languages={languages}
                    allCountries={countries}
                    maxUsers={maxCountryUsers}
                    filters={filters}
                    toggleFilter={toggleFilter}
                    analyzeWithAI={analyzeWithAI}
                    copyToClipboard={copyToClipboard}
                />
            </div>

            {/* ─── 5. Intelligence Cards ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 overflow-hidden">
                <EngagementCard kpis={kpis} />
                <LoyaltyCard kpis={kpis} />
                <DiversityCard channels={channels} />
            </div>

            <DrilldownDrawer open={!!drilldown} onClose={() => setDrilldown(null)} data={drilldown} />
        </div>
    );
}

// ─── Traffic Sources Tabbed Panel ───
function TrafficSourcesPanel({
    referrers, channels, allChannels, maxRef, filters, toggleFilter,
    analyzeWithAI, openExternal, copyToClipboard,
}: {
    referrers: any[]; channels: any[]; allChannels: any[]; maxRef: number;
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
    analyzeWithAI: any; openExternal: any; copyToClipboard: any;
}) {
    const [tab, setTab] = useState<'referrers' | 'channels' | 'utm'>('referrers');

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className={`${CARD} p-3 sm:p-5 overflow-hidden min-w-0`}
        >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1">
                    <TabBtn label="Referrers" active={tab === 'referrers'} onClick={() => setTab('referrers')} />
                    <TabBtn label="Channels" active={tab === 'channels'} onClick={() => setTab('channels')} />
                    <TabBtn label="UTM" active={tab === 'utm'} onClick={() => setTab('utm')} />
                </div>
                <button className="p-1 text-zinc-600 hover:text-zinc-400 transition" title="Expand">
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {tab === 'referrers' && (
                <AnalyticsTable
                    data={referrers}
                    searchKey={(item: any) => item.name}
                    searchPlaceholder="Search referrers..."
                    maxRows={10}
                    onRowClick={(item: any) => toggleFilter('referrer', item.name)}
                    activeRow={(item: any) => filters.referrer.includes(item.name)}
                    columns={[
                        {
                            key: 'referrer', label: 'Referrer', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => (
                                <div className="flex items-center gap-2">
                                    <ReferrerIcon referrer={item.name} />
                                    <span className="text-zinc-300 text-xs truncate max-w-[140px]">{item.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'events', label: 'Sessions', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.value,
                            render: (item: any) => <Bar value={item.value} max={maxRef} />,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze traffic from referrer "${item.name}": how can we get more traffic from this source?`, ''),
                                    openExternal(item.name || ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'events', dir: 'desc' }}
                />
            )}

            {tab === 'channels' && (
                <AnalyticsTable
                    data={channels}
                    showSearch={false}
                    maxRows={10}
                    onRowClick={(item: any) => toggleFilter('channel', item.name)}
                    activeRow={(item: any) => filters.channel.includes(item.name)}
                    columns={[
                        {
                            key: 'name', label: 'Channel', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span>,
                        },
                        {
                            key: 'value', label: 'Visitors', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.value,
                            render: (item: any) => {
                                const total = allChannels.reduce((s: number, c: any) => s + (c.value || 0), 0);
                                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                    <div className="flex items-center gap-2">
                                        <span className="text-zinc-300 text-xs tabular-nums min-w-[36px] text-right">{item.value?.toLocaleString()}</span>
                                        <div className="flex-1 h-[5px] bg-white/[0.04] rounded-full overflow-hidden min-w-[40px]">
                                            <div className="h-full rounded-full bg-emerald-500/40" style={{ width: `${pct}%`, transition: 'width 0.4s' }} />
                                        </div>
                                        <span className="text-zinc-500 text-[10px] tabular-nums min-w-[28px] text-right">{pct}%</span>
                                    </div>
                                );
                            },
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze traffic from channel "${item.name}": how can we grow this channel?`, ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'value', dir: 'desc' }}
                />
            )}

            {tab === 'utm' && (
                <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                    UTM tracking coming soon
                </div>
            )}
        </motion.div>
    );
}

// ─── Pages Tabbed Panel ───
function PagesPanel({
    pages, entryPages, maxPageViews, maxEntryPageSessions, filters, toggleFilter,
    auditPage, optimizePage, analyzeWithAI, openExternal, copyToClipboard,
}: {
    pages: any[]; entryPages: any[]; maxPageViews: number; maxEntryPageSessions: number;
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
    auditPage: any; optimizePage: any; analyzeWithAI: any; openExternal: any; copyToClipboard: any;
}) {
    const [tab, setTab] = useState<'pages' | 'entries' | 'exits'>('pages');

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className={`${CARD} p-3 sm:p-5 overflow-hidden min-w-0`}
        >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1">
                    <TabBtn label="Pages" active={tab === 'pages'} onClick={() => setTab('pages')} />
                    <TabBtn label="Entry Pages" active={tab === 'entries'} onClick={() => setTab('entries')} />
                    <TabBtn label="Exit Pages" active={tab === 'exits'} onClick={() => setTab('exits')} />
                </div>
                <button className="p-1 text-zinc-600 hover:text-zinc-400 transition" title="Expand">
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {tab === 'pages' && (
                <AnalyticsTable
                    data={pages}
                    searchKey={(item: any) => item.page}
                    searchPlaceholder="Search pages..."
                    maxRows={10}
                    onRowClick={(item: any) => toggleFilter('page', item.page)}
                    activeRow={(item: any) => filters.page.includes(item.page)}
                    columns={[
                        {
                            key: 'page', label: 'Path', sortable: true,
                            getValue: (item: any) => item.page,
                            render: (item: any) => (
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-zinc-300 text-xs truncate max-w-[160px] block">{item.page}</span>
                                    {getAnnotations({ clicks: item.views, impressions: item.views }).map(type => (
                                        <AnnotationBadge key={type} type={type} />
                                    ))}
                                </div>
                            ),
                        },
                        {
                            key: 'views', label: 'Views', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.views,
                            render: (item: any) => <Bar value={item.views} max={maxPageViews} color="bg-indigo-500/40" />,
                        },
                        {
                            key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.bounceRate || 0,
                            render: (item: any) => (
                                <span className={`text-xs tabular-nums ${(item.bounceRate || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {item.bounceRate}%
                                </span>
                            ),
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    auditPage(item.page || ''),
                                    optimizePage(item.page || ''),
                                    analyzeWithAI(`Analyze page performance: ${item.page}`, ''),
                                    openExternal(item.page || ''),
                                    copyToClipboard(item.page || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'views', dir: 'desc' }}
                />
            )}

            {tab === 'entries' && (
                <AnalyticsTable
                    data={entryPages}
                    searchKey={(item: any) => item.page}
                    searchPlaceholder="Search entry pages..."
                    maxRows={10}
                    columns={[
                        {
                            key: 'page', label: 'Path', sortable: true,
                            getValue: (item: any) => item.page,
                            render: (item: any) => (
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-zinc-300 text-xs truncate max-w-[160px] block">{item.page}</span>
                                    {getAnnotations({ clicks: item.sessions, impressions: item.views }).map(type => (
                                        <AnnotationBadge key={type} type={type} />
                                    ))}
                                </div>
                            ),
                        },
                        {
                            key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.sessions,
                            render: (item: any) => <Bar value={item.sessions} max={maxEntryPageSessions} color="bg-cyan-500/40" />,
                        },
                        {
                            key: 'users', label: 'Users', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.users || 0,
                            render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.users?.toLocaleString() || '--'}</span>,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    auditPage(item.page || ''),
                                    analyzeWithAI(`Analyze entry page: ${item.page}`, ''),
                                    openExternal(item.page || ''),
                                    copyToClipboard(item.page || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'sessions', dir: 'desc' }}
                />
            )}

            {tab === 'exits' && (
                <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                    Exit pages coming soon
                </div>
            )}
        </motion.div>
    );
}

// ─── Technology Tabbed Panel ───
function TechPanel({
    devices, browsers, operatingSystems, filters, toggleFilter,
    analyzeWithAI, copyToClipboard,
}: {
    devices: any[]; browsers: any[]; operatingSystems: any[];
    allDevices?: any[]; allBrowsers?: any[]; allOS?: any[];
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
    analyzeWithAI: any; copyToClipboard: any;
}) {
    const [tab, setTab] = useState<'browsers' | 'devices' | 'os' | 'screen'>('browsers');

    const data = tab === 'devices' ? devices.map((d: any) => ({ name: d.device, value: d.sessions, pct: d.percentage }))
        : tab === 'browsers' ? browsers.map((b: any) => ({ name: b.name, value: b.value, pct: b.percentage }))
        : tab === 'os' ? operatingSystems.map((o: any) => ({ name: o.name, value: o.value, pct: o.percentage }))
        : [];

    const dim = tab === 'devices' ? 'device' : tab === 'browsers' ? 'browser' : 'os';
    const maxVal = Math.max(...data.map((d: any) => d.value || 0), 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className={`${CARD} p-3 sm:p-5 overflow-hidden min-w-0`}
        >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1">
                    <TabBtn label="Browsers" active={tab === 'browsers'} onClick={() => setTab('browsers')} />
                    <TabBtn label="Devices" active={tab === 'devices'} onClick={() => setTab('devices')} />
                    <TabBtn label="OS" active={tab === 'os'} onClick={() => setTab('os')} />
                    <TabBtn label="Screen" active={tab === 'screen'} onClick={() => setTab('screen')} />
                </div>
                <button className="p-1 text-zinc-600 hover:text-zinc-400 transition" title="Expand">
                    <Maximize2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {tab === 'screen' ? (
                <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                    Screen dimensions coming soon
                </div>
            ) : (
                <AnalyticsTable
                    data={data}
                    showSearch={false}
                    maxRows={10}
                    onRowClick={(item: any) => toggleFilter(dim, item.name)}
                    activeRow={(item: any) => filters[dim].includes(item.name)}
                    columns={[
                        {
                            key: 'name', label: 'Name', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => (
                                <div className="flex items-center gap-2">
                                    {tab === 'devices' ? <DeviceIcon device={item.name} /> : tab === 'browsers' ? <BrowserIcon browser={item.name} /> : <OSIcon os={item.name} />}
                                    <span className="text-zinc-300 text-xs">{item.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'value', label: 'Sessions', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.value,
                            render: (item: any) => <Bar value={item.value} max={maxVal} color="bg-cyan-500/40" />,
                        },
                        {
                            key: 'pct', label: '%', align: 'right' as const,
                            render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.pct}%</span>,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze ${item.name} traffic: ${item.value} sessions. Are there optimization opportunities?`, ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'value', dir: 'desc' }}
                />
            )}
        </motion.div>
    );
}

// ─── Geography Tabbed Panel ───
function GeoPanel({
    countries, cities, languages, allCountries, maxUsers, filters, toggleFilter,
    analyzeWithAI, copyToClipboard,
}: {
    countries: any[]; cities: any[]; languages: any[]; allCountries: any[];
    maxUsers: number; filters: DashboardFilters;
    toggleFilter: (dim: any, val: string) => void;
    analyzeWithAI: any; copyToClipboard: any;
}) {
    const [tab, setTab] = useState<'countries' | 'regions' | 'cities' | 'languages' | 'map'>('countries');

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className={`${CARD} p-3 sm:p-5 overflow-hidden min-w-0`}
        >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    <TabBtn label="Countries" active={tab === 'countries'} onClick={() => setTab('countries')} />
                    <TabBtn label="Regions" active={tab === 'regions'} onClick={() => setTab('regions')} />
                    <TabBtn label="Cities" active={tab === 'cities'} onClick={() => setTab('cities')} />
                    <TabBtn label="Languages" active={tab === 'languages'} onClick={() => setTab('languages')} />
                    <TabBtn label="Map" active={tab === 'map'} onClick={() => setTab('map')} />
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {allCountries.slice(0, 4).map((c: any, i: number) => (
                        <CountryFlag key={i} country={c.country} />
                    ))}
                </div>
            </div>

            {tab === 'countries' && (
                <AnalyticsTable
                    data={countries.map((c: any) => ({ name: c.country, events: c.users, sessions: c.sessions || 0 }))}
                    searchKey={(item: any) => item.name}
                    searchPlaceholder="Search countries..."
                    maxRows={10}
                    onRowClick={(item: any) => toggleFilter('country', item.name)}
                    activeRow={(item: any) => filters.country.includes(item.name)}
                    columns={[
                        {
                            key: 'name', label: 'Country', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => (
                                <div className="flex items-center gap-2">
                                    <CountryFlag country={item.name} />
                                    <span className="text-zinc-300 text-xs truncate max-w-[120px]">{item.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'events', label: 'Users', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.events,
                            render: (item: any) => <Bar value={item.events} max={maxUsers} color="bg-violet-500/40" />,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze traffic from ${item.name}: ${item.events} users. What opportunities exist for this market?`, ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'events', dir: 'desc' }}
                />
            )}

            {tab === 'regions' && (
                <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                    Regional breakdown coming soon
                </div>
            )}

            {tab === 'cities' && (
                <AnalyticsTable
                    data={cities.map((c: any) => ({ name: `${c.city}, ${c.country}`, events: c.users }))}
                    searchKey={(item: any) => item.name}
                    searchPlaceholder="Search cities..."
                    maxRows={10}
                    columns={[
                        {
                            key: 'name', label: 'City', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => (
                                <div className="flex items-center gap-2">
                                    <CountryFlag country={item.name.split(', ').pop() || ''} />
                                    <span className="text-zinc-300 text-xs truncate max-w-[140px]">{item.name}</span>
                                </div>
                            ),
                        },
                        {
                            key: 'events', label: 'Users', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.events,
                            render: (item: any) => <Bar value={item.events} max={maxUsers} color="bg-violet-500/40" />,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze traffic from city ${item.name}: ${item.events} users.`, ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'events', dir: 'desc' }}
                />
            )}

            {tab === 'languages' && (
                <AnalyticsTable
                    data={languages}
                    showSearch={false}
                    maxRows={10}
                    columns={[
                        {
                            key: 'name', label: 'Language', sortable: true,
                            getValue: (item: any) => item.name,
                            render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span>,
                        },
                        {
                            key: 'value', label: 'Visitors', align: 'right' as const, sortable: true,
                            getValue: (item: any) => item.value,
                            render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span>,
                        },
                        {
                            key: 'pct', label: '%', align: 'right' as const,
                            render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.percentage}%</span>,
                        },
                        {
                            key: 'actions', label: '', align: 'right' as const, width: '40px',
                            render: (item: any) => (
                                <TableActionMenu size="sm" actions={[
                                    analyzeWithAI(`Analyze traffic from ${item.name} language: ${item.value} users. What opportunities exist?`, ''),
                                    copyToClipboard(item.name || ''),
                                ]} />
                            ),
                        },
                    ]}
                    defaultSort={{ key: 'value', dir: 'desc' }}
                />
            )}

            {tab === 'map' && (
                <div className="h-[260px] sm:h-[300px] -mx-3 -mb-3 sm:-mx-5 sm:-mb-5">
                    <WorldMap
                        byCountry={allCountries.map((c: any) => ({ country: c.country, users: c.users }))}
                        byCity={cities.map((c: any) => ({ city: c.city, country: c.country, users: c.users }))}
                        onBubbleClick={(name: string) => toggleFilter('country', name)}
                        activeCountry={filters.country[0] || null}
                    />
                </div>
            )}
        </motion.div>
    );
}

// ─── Intelligence: Engagement Card ───
function EngagementCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const score = Math.min(100, Math.round(
        (Math.min(kpis.avgSessionDuration / 300, 1) * 30) + (Math.min(kpis.pagesPerSession / 5, 1) * 25) +
        (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25) + (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
    ));
    const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
    const bg = score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${CARD} p-3 sm:p-5 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-2 sm:mb-3 min-w-0">
                <Target className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <h4 className="text-sm sm:text-base font-semibold text-white truncate">Engagement Score</h4>
            </div>
            <div className="flex items-end gap-2 mb-1.5 sm:mb-2">
                <AnimatedCounter value={score} className={`text-2xl sm:text-3xl font-bold ${color}`} />
                <span className="text-[10px] sm:text-xs text-zinc-600 mb-0.5 sm:mb-1">/ 100</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${bg}`} />
            </div>
        </motion.div>
    );
}

// ─── Intelligence: Loyalty Card ───
function LoyaltyCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const returning = kpis.returningUsers || 0;
    const total = kpis.totalUsers || 1;
    const loyaltyPct = Math.round((returning / total) * 100);
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${CARD} p-3 sm:p-5 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-2 sm:mb-3 min-w-0">
                <Users className="w-4 h-4 text-pink-400 flex-shrink-0" />
                <h4 className="text-sm sm:text-base font-semibold text-white truncate">Audience Loyalty</h4>
            </div>
            <div className="flex justify-between text-[10px] sm:text-xs mb-1">
                <span className="text-zinc-600">New</span>
                <span className="text-zinc-600">Returning</span>
            </div>
            <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden flex">
                <motion.div initial={{ width: 0 }} animate={{ width: `${100 - loyaltyPct}%` }} transition={{ duration: 0.6 }} className="h-full bg-violet-500/50" />
                <motion.div initial={{ width: 0 }} animate={{ width: `${loyaltyPct}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="h-full bg-emerald-500/50" />
            </div>
            <div className="flex justify-between text-[10px] mt-1.5">
                <span className="text-violet-400 font-medium">{100 - loyaltyPct}% new</span>
                <span className="text-emerald-400 font-medium">{loyaltyPct}% returning</span>
            </div>
        </motion.div>
    );
}

// ─── Intelligence: Source Diversity Card ───
function DiversityCard({ channels }: { channels: any[] }) {
    if (!channels.length) return null;
    const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
    const shares = channels.map((c: any) => (c.value || 0) / Math.max(total, 1));
    const entropy = -shares.reduce((s: number, p: number) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(Math.max(channels.length, 1));
    const score = Math.round((entropy / Math.max(maxEntropy, 0.01)) * 100);
    const color = score >= 60 ? 'text-emerald-400' : score >= 35 ? 'text-amber-400' : 'text-red-400';
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${CARD} p-3 sm:p-5 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-2 sm:mb-3 min-w-0">
                <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <h4 className="text-sm sm:text-base font-semibold text-white truncate">Source Diversity</h4>
            </div>
            <div className="flex items-end gap-1 mb-2 sm:mb-3">
                <AnimatedCounter value={score} className={`text-2xl sm:text-3xl font-bold ${color}`} />
                <span className="text-[10px] sm:text-xs text-zinc-600 mb-0.5 sm:mb-1">/ 100</span>
            </div>
            <div className="space-y-1.5">
                {channels.slice(0, 4).map((c: any, i: number) => {
                    const pct = Math.round(((c.value || 0) / Math.max(total, 1)) * 100);
                    return (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-zinc-400 min-w-[80px] truncate">{c.name}</span>
                            <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500/40 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-zinc-600 tabular-nums min-w-[28px] text-right">{pct}%</span>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}
