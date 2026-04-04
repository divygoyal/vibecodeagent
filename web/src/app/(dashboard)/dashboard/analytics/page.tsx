'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Target,
    Globe, Download, RefreshCw, Filter as FilterIcon, BarChart3,
    ChevronDown, Maximize2, ChevronRight
} from 'lucide-react';
import { exportAnalyticsData, exportAnalyticsZip } from '@/lib/exportUtils';
import { useAnalyticsData } from '@/lib/useDashboardData';
import LastUpdated from '@/components/dashboard/LastUpdated';
import { useAnalyticsContext } from './layout';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import DataRow from '@/components/analytics/DataRow';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { SkeletonDashboard } from '@/components/analytics/SkeletonLoader';
import DrilldownDrawer from '@/components/analytics/DrilldownDrawer';
import { useFilterStore, type DashboardFilters } from '@/stores/analyticsFilterStore';
import { useAnnotationStore, type ChartAnnotation } from '@/stores/annotationStore';
import { getAnnotationLines, AddAnnotationButton, ToggleAnnotationsButton } from '@/components/ChartAnnotations';
import AnnotationModal from '@/components/AnnotationModal';

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

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const current = payload.find((e: any) => !e.dataKey.startsWith('prev'));
    const previous = payload.find((e: any) => e.dataKey.startsWith('prev'));
    return (
        <div className="bg-[#050508] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[200px]">
            <p className="text-[11px] font-semibold text-white mb-2">{label}</p>
            <div className="space-y-1.5">
                {current && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: current.color }} />
                            <span className="text-[10px] text-zinc-500">{current.name}</span>
                        </div>
                        <span className="text-xs font-bold text-white tabular-nums">{current.value?.toLocaleString()}</span>
                    </div>
                )}
                {previous && previous.value != null && (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full border border-zinc-600 bg-transparent" />
                            <span className="text-[10px] text-zinc-600">{previous.name}</span>
                        </div>
                        <span className="text-xs font-medium text-zinc-500 tabular-nums">{previous.value?.toLocaleString()}</span>
                    </div>
                )}
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

// ─── Color palette for data panels ───
const PANEL_COLORS = [
    '#34d399', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24',
    '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#38bdf8',
    '#f87171', '#a3e635', '#c084fc', '#2dd4bf', '#facc15',
];

const CHANNEL_COLORS: Record<string, string> = {
    'Organic Search': '#34d399',
    'Direct': '#22d3ee',
    'Referral': '#fb923c',
    'Social': '#a78bfa',
    'Paid Search': '#f472b6',
    'Email': '#fbbf24',
    'Display': '#60a5fa',
    'Affiliates': '#4ade80',
    'Video': '#e879f9',
    'Organic Social': '#2dd4bf',
};

const REFERRER_COLORS: Record<string, string> = {
    'google': '#34d399',
    '(direct)': '#22d3ee',
    'bing': '#60a5fa',
    'yahoo': '#a78bfa',
    'duckduckgo': '#fb923c',
    'facebook': '#3b82f6',
    'twitter': '#38bdf8',
    'linkedin': '#0ea5e9',
    'reddit': '#f87171',
    'youtube': '#f472b6',
    'instagram': '#e879f9',
    'pinterest': '#f472b6',
    'baidu': '#fbbf24',
};

function getItemColor(name: string, index: number, colorMap?: Record<string, string>): string {
    if (colorMap) {
        const key = Object.keys(colorMap).find(k => name.toLowerCase().includes(k.toLowerCase()));
        if (key) return colorMap[key];
    }
    return PANEL_COLORS[index % PANEL_COLORS.length];
}

// ─── Tab Button ───
function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-2.5 py-1 text-[12px] rounded-md transition whitespace-nowrap ${
                active ? 'text-white font-semibold bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] font-medium'
            }`}
        >
            {label}
        </button>
    );
}

// ─── Metric Pill (for panel column headers) ───
function MetricPill({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-2 py-0.5 text-[10px] rounded-full transition whitespace-nowrap border ${
                active
                    ? 'text-zinc-200 border-white/[0.1] bg-white/[0.06] font-semibold'
                    : 'text-zinc-500 border-white/[0.04] hover:border-white/[0.08] hover:text-zinc-400 font-medium'
            }`}
        >
            {label}
        </button>
    );
}

// ─── See All Link ───
function SeeAllBtn({ count, label }: { count: number; label: string }) {
    if (count <= 8) return null;
    return (
        <div className="flex justify-center py-2 border-t border-white/[0.04]">
            <button className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition font-medium">
                See All {label}
                <ChevronRight className="w-3 h-3" />
            </button>
        </div>
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
    const [showComparison, setShowComparison] = useState(true);

    // ─── Annotations ───
    const { annotations, fetchAnnotations, showAnnotations, toggleAnnotations, deleteAnnotation } = useAnnotationStore();
    const [annotationModal, setAnnotationModal] = useState<{ open: boolean; annotation?: ChartAnnotation | null; defaultDate?: string }>({ open: false });

    useEffect(() => {
        fetchAnnotations(selectedProperty);
    }, [selectedProperty, fetchAnnotations]);

    const handleEditAnnotation = (annotation: ChartAnnotation) => {
        setAnnotationModal({ open: true, annotation });
    };
    const handleDeleteAnnotation = async (id: number) => {
        await deleteAnnotation(id);
    };
    const handleAnnotationModalClose = () => {
        setAnnotationModal({ open: false });
        // Refresh annotations after create/edit
        fetchAnnotations(selectedProperty);
    };

    useEffect(() => {
        const csvHandler = () => { if (analyticsData) exportAnalyticsData(analyticsData); };
        const zipHandler = () => { if (analyticsData) exportAnalyticsZip(analyticsData); };
        window.addEventListener('trafficclaw:export-analytics', csvHandler);
        window.addEventListener('trafficclaw:export-zip', zipHandler);
        return () => {
            window.removeEventListener('trafficclaw:export-analytics', csvHandler);
            window.removeEventListener('trafficclaw:export-zip', zipHandler);
        };
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

    // Previous period comparison: reverse-compute approximate previous values from KPI change%
    const comparisonTraffic = useMemo(() => {
        if (!showComparison || !bucketedTraffic.length || !kpis) return bucketedTraffic;
        const scaleUsers = kpis.changeUsers !== 0 ? 100 / (100 + kpis.changeUsers) : 1;
        const scaleSessions = kpis.changeSessions !== 0 ? 100 / (100 + kpis.changeSessions) : 1;
        const scalePageViews = kpis.changePageViews !== 0 ? 100 / (100 + kpis.changePageViews) : 1;
        const bounceShift = kpis.changeBounceRate || 0;
        return bucketedTraffic.map((d: any) => ({
            ...d,
            prevActiveUsers: Math.round((d.activeUsers || 0) * scaleUsers),
            prevSessions: Math.round((d.sessions || 0) * scaleSessions),
            prevPageViews: Math.round((d.pageViews || 0) * scalePageViews),
            prevBounceRate: Math.max(0, Math.round(((d.bounceRate || 0) - bounceShift) * 10) / 10),
        }));
    }, [showComparison, bucketedTraffic, kpis]);

    // Map current chartStat to its previous-period data key
    const prevDataKey = chartStat === 'activeUsers' ? 'prevActiveUsers'
        : chartStat === 'sessions' ? 'prevSessions'
        : chartStat === 'pageViews' ? 'prevPageViews'
        : 'prevBounceRate';

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

            {/* ─── 1. KPI Cards ─── */}
            {kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                    {[
                        { label: 'Users', value: displayKpis?.totalUsers ?? kpis.totalUsers, change: kpis.changeUsers, format: 'number', sparkKey: 'activeUsers', statKey: 'activeUsers' as ChartStat, color: '#34d399' },
                        { label: 'Sessions', value: displayKpis?.totalSessions ?? kpis.totalSessions, change: kpis.changeSessions, format: 'number', sparkKey: 'sessions', statKey: 'sessions' as ChartStat, color: '#22d3ee' },
                        { label: 'Page Views', value: displayKpis?.totalPageViews ?? kpis.totalPageViews, change: kpis.changePageViews, format: 'number', sparkKey: 'pageViews', statKey: 'pageViews' as ChartStat, color: '#a78bfa' },
                        { label: 'Pages / Session', value: kpis.pagesPerSession || 0, change: 0, format: 'decimal', sparkKey: 'pagesPerSession', statKey: 'pageViews' as ChartStat, color: '#fbbf24' },
                        { label: 'Bounce Rate', value: displayKpis?.avgBounceRate ?? kpis.avgBounceRate, change: kpis.changeBounceRate, format: 'percent', sparkKey: 'bounceRate', statKey: 'bounceRate' as ChartStat, color: '#f472b6' },
                        { label: 'Avg Duration', value: kpis.avgSessionDuration || 0, change: 0, format: 'duration', sparkKey: 'avgSessionDuration', statKey: 'sessions' as ChartStat, color: '#60a5fa' },
                    ].map((k, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className={`${CARD} relative overflow-hidden cursor-pointer transition-all ${
                                chartStat === k.statKey
                                    ? 'ring-1 ring-white/[0.12] bg-white/[0.02]'
                                    : 'hover:bg-white/[0.02]'
                            }`}
                            onClick={() => setChartStat(k.statKey)}
                        >
                            {/* Top accent line */}
                            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: k.color, opacity: chartStat === k.statKey ? 1 : 0.3 }} />
                            <div className="px-3 pt-3 pb-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: k.color }} />
                                    <p className="text-[10px] font-medium text-zinc-500 truncate">{k.label}</p>
                                </div>
                                <p className="text-xl sm:text-2xl font-semibold text-white tabular-nums leading-tight">
                                    {k.format === 'duration' ? fmtDur(k.value)
                                        : k.format === 'percent' ? `${k.value}%`
                                        : k.format === 'decimal' ? (typeof k.value === 'number' ? k.value.toFixed(1) : k.value)
                                        : <AnimatedCounter value={k.value} formatter={fmt} />
                                    }
                                </p>
                                <Change value={k.change} />
                            </div>
                            <Sparkline data={sparklineData} dataKey={k.sparkKey} color={k.color} />
                        </motion.div>
                    ))}
                </div>
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
                        <ToggleAnnotationsButton
                            show={showAnnotations}
                            count={annotations.length}
                            onClick={toggleAnnotations}
                        />
                        <AddAnnotationButton onClick={() => setAnnotationModal({ open: true })} />
                        <button
                            onClick={() => setShowComparison(!showComparison)}
                            title={showComparison ? 'Hide previous period' : 'Show previous period'}
                            className={`flex items-center gap-1 text-[10px] border rounded-md px-2 py-1 transition ${
                                showComparison
                                    ? 'text-zinc-300 border-white/[0.12] bg-white/[0.04]'
                                    : 'text-zinc-500 border-white/[0.06] hover:border-white/[0.12] hover:text-zinc-400'
                            }`}
                        >
                            <span className="inline-block w-3 border-t border-dashed border-zinc-500" />
                            Prev
                        </button>
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
                        <AreaChart data={comparisonTraffic} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
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
                            {showComparison && (
                                <Area
                                    type="monotone"
                                    dataKey={prevDataKey}
                                    name="Previous period"
                                    stroke="#525252"
                                    fill="none"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 4"
                                    dot={false}
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey={chartStat}
                                name={activeStat.label}
                                stroke={activeStat.color}
                                fill="url(#chartGrad)"
                                strokeWidth={2}
                                dot={false}
                            />
                            {showAnnotations && bucket === 'day' && getAnnotationLines({
                                annotations,
                                chartHeight: 300,
                                onEdit: handleEditAnnotation,
                                onDelete: handleDeleteAnnotation,
                            })}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ─── 3. Traffic Sources + Pages (tabbed panels, two-column) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3">
                <TrafficSourcesPanel
                    referrers={fReferrers}
                    channels={fChannels}
                    allReferrers={referrers}
                    allChannels={channels}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
                <PagesPanel
                    pages={fPages}
                    entryPages={fEntryPages}
                    allPages={pages}
                    allEntryPages={entryPages}
                    filters={filters}
                    toggleFilter={toggleFilter}
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
                />
                <GeoPanel
                    countries={fCountries}
                    cities={fCities}
                    languages={languages}
                    allCountries={countries}
                    filters={filters}
                    toggleFilter={toggleFilter}
                />
            </div>

            {/* ─── 5. Intelligence Cards ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 overflow-hidden">
                <EngagementCard kpis={kpis} traffic={traffic} />
                <LoyaltyCard kpis={kpis} traffic={traffic} />
                <DiversityCard channels={channels} />
            </div>

            <DrilldownDrawer open={!!drilldown} onClose={() => setDrilldown(null)} data={drilldown} />

            <AnnotationModal
                open={annotationModal.open}
                onClose={handleAnnotationModalClose}
                annotation={annotationModal.annotation}
                defaultDate={annotationModal.defaultDate}
                propertyId={selectedProperty}
            />
        </div>
    );
}

// ─── Traffic Sources Tabbed Panel ───
function TrafficSourcesPanel({
    referrers, channels, allReferrers, allChannels, filters, toggleFilter,
}: {
    referrers: any[]; channels: any[]; allReferrers: any[]; allChannels: any[];
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
}) {
    const [tab, setTab] = useState<'referrers' | 'channels' | 'utm'>('referrers');

    const refTotal = allReferrers.reduce((s: number, r: any) => s + (r.value || 0), 0);
    const refMaxPct = refTotal > 0 ? ((allReferrers[0]?.value || 0) / refTotal) * 100 : 100;
    const chTotal = allChannels.reduce((s: number, c: any) => s + (c.value || 0), 0);
    const chMaxPct = chTotal > 0 ? ((allChannels[0]?.value || 0) / chTotal) * 100 : 100;

    const tabLabel = tab === 'referrers' ? 'Referrer' : 'Channel';
    const metricLabel = tab === 'referrers' ? 'Sessions' : 'Visitors';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className={`${CARD} overflow-hidden min-w-0`}
            style={{ height: 405 }}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <h4 className="text-[13px] font-semibold text-white">Traffic Sources</h4>
                    <div className="flex gap-0.5">
                        <TabBtn label="Referrers" active={tab === 'referrers'} onClick={() => setTab('referrers')} />
                        <TabBtn label="Channels" active={tab === 'channels'} onClick={() => setTab('channels')} />
                        <TabBtn label="UTM" active={tab === 'utm'} onClick={() => setTab('utm')} />
                    </div>
                </div>
                <button className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition" title="Expand">
                    <Maximize2 className="w-3 h-3" />
                </button>
            </div>
            <div className="flex justify-between px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                <span>{tabLabel}</span>
                <div className="flex items-center gap-1.5">
                    <span>{metricLabel}</span>
                    <span className="text-zinc-700">Percents</span>
                </div>
            </div>
            <div className="overflow-y-auto" style={{ height: 'calc(405px - 72px)' }}>
                {tab === 'referrers' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {referrers.slice(0, 25).map((ref: any, i: number) => {
                            const pct = refTotal > 0 ? (ref.value / refTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={ref.name}
                                    label={ref.name}
                                    value={ref.value}
                                    percentage={pct}
                                    maxPercentage={refMaxPct}
                                    icon={<ReferrerIcon referrer={ref.name} />}
                                    href={ref.name !== '(direct)' ? `https://${ref.name}` : undefined}
                                    onClick={() => toggleFilter('referrer', ref.name)}
                                    active={filters.referrer.includes(ref.name)}
                                    barColor={getItemColor(ref.name, i, REFERRER_COLORS)}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'channels' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {channels.slice(0, 25).map((ch: any, i: number) => {
                            const pct = chTotal > 0 ? (ch.value / chTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={ch.name}
                                    label={ch.name}
                                    value={ch.value}
                                    percentage={pct}
                                    maxPercentage={chMaxPct}
                                    onClick={() => toggleFilter('channel', ch.name)}
                                    active={filters.channel.includes(ch.name)}
                                    barColor={getItemColor(ch.name, i, CHANNEL_COLORS)}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'utm' && (
                    <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                        UTM tracking coming soon
                    </div>
                )}
            </div>
            {tab === 'referrers' && <SeeAllBtn count={referrers.length} label="Referrers" />}
            {tab === 'channels' && <SeeAllBtn count={channels.length} label="Channels" />}
        </motion.div>
    );
}

// ─── Pages Tabbed Panel ───
function PagesPanel({
    pages, entryPages, allPages, allEntryPages, filters, toggleFilter,
}: {
    pages: any[]; entryPages: any[]; allPages: any[]; allEntryPages: any[];
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
}) {
    const [tab, setTab] = useState<'pages' | 'entries' | 'exits'>('pages');

    const pgTotal = allPages.reduce((s: number, p: any) => s + (p.views || 0), 0);
    const pgMaxPct = pgTotal > 0 ? ((allPages[0]?.views || 0) / pgTotal) * 100 : 100;
    const epTotal = allEntryPages.reduce((s: number, p: any) => s + (p.sessions || 0), 0);
    const epMaxPct = epTotal > 0 ? ((allEntryPages[0]?.sessions || 0) / epTotal) * 100 : 100;

    const tabLabel = tab === 'pages' ? 'Page' : 'Entry Page';
    const metricLabel = tab === 'pages' ? 'Views' : 'Sessions';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className={`${CARD} overflow-hidden min-w-0`}
            style={{ height: 405 }}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <h4 className="text-[13px] font-semibold text-white">Top Pages</h4>
                    <div className="flex gap-0.5">
                        <TabBtn label="Pages" active={tab === 'pages'} onClick={() => setTab('pages')} />
                        <TabBtn label="Entry Pages" active={tab === 'entries'} onClick={() => setTab('entries')} />
                        <TabBtn label="Exit Pages" active={tab === 'exits'} onClick={() => setTab('exits')} />
                    </div>
                </div>
                <button className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition" title="Expand">
                    <Maximize2 className="w-3 h-3" />
                </button>
            </div>
            <div className="flex justify-between px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                <span>{tabLabel}</span>
                <div className="flex items-center gap-1.5">
                    <span>{metricLabel}</span>
                    <span className="text-zinc-700">Percents</span>
                </div>
            </div>
            <div className="overflow-y-auto" style={{ height: 'calc(405px - 72px)' }}>
                {tab === 'pages' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {pages.slice(0, 25).map((pg: any, i: number) => {
                            const pct = pgTotal > 0 ? (pg.views / pgTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={pg.page}
                                    label={pg.page}
                                    value={pg.views}
                                    percentage={pct}
                                    maxPercentage={pgMaxPct}
                                    onClick={() => toggleFilter('page', pg.page)}
                                    active={filters.page.includes(pg.page)}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'entries' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {entryPages.slice(0, 25).map((pg: any, i: number) => {
                            const pct = epTotal > 0 ? (pg.sessions / epTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={pg.page}
                                    label={pg.page}
                                    value={pg.sessions}
                                    percentage={pct}
                                    maxPercentage={epMaxPct}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'exits' && (
                    <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                        Exit pages coming soon
                    </div>
                )}
            </div>
            {tab === 'pages' && <SeeAllBtn count={pages.length} label="Pages" />}
            {tab === 'entries' && <SeeAllBtn count={entryPages.length} label="Entry Pages" />}
        </motion.div>
    );
}

// ─── Technology Tabbed Panel ───
function TechPanel({
    devices, browsers, operatingSystems, filters, toggleFilter,
}: {
    devices: any[]; browsers: any[]; operatingSystems: any[];
    allDevices?: any[]; allBrowsers?: any[]; allOS?: any[];
    filters: DashboardFilters; toggleFilter: (dim: any, val: string) => void;
}) {
    const [tab, setTab] = useState<'browsers' | 'devices' | 'os' | 'screen'>('browsers');

    const data = tab === 'devices' ? devices.map((d: any) => ({ name: d.device, value: d.sessions, pct: d.percentage }))
        : tab === 'browsers' ? browsers.map((b: any) => ({ name: b.name, value: b.value, pct: b.percentage }))
        : tab === 'os' ? operatingSystems.map((o: any) => ({ name: o.name, value: o.value, pct: o.percentage }))
        : [];

    const dim = tab === 'devices' ? 'device' : tab === 'browsers' ? 'browser' : 'os';
    const total = data.reduce((s: number, d: any) => s + (d.value || 0), 0);
    const maxPct = total > 0 ? ((data[0]?.value || 0) / total) * 100 : 100;

    const tabLabel = tab === 'devices' ? 'Device' : tab === 'browsers' ? 'Browser' : 'OS';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className={`${CARD} overflow-hidden min-w-0`}
            style={{ height: 405 }}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <h4 className="text-[13px] font-semibold text-white">Technology</h4>
                    <div className="flex gap-0.5">
                        <TabBtn label="Browsers" active={tab === 'browsers'} onClick={() => setTab('browsers')} />
                        <TabBtn label="Devices" active={tab === 'devices'} onClick={() => setTab('devices')} />
                        <TabBtn label="OS" active={tab === 'os'} onClick={() => setTab('os')} />
                        <TabBtn label="Screen" active={tab === 'screen'} onClick={() => setTab('screen')} />
                    </div>
                </div>
                <button className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition" title="Expand">
                    <Maximize2 className="w-3 h-3" />
                </button>
            </div>
            <div className="flex justify-between px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                <span>{tabLabel}</span>
                <div className="flex items-center gap-1.5">
                    <span>Sessions</span>
                    <span className="text-zinc-700">Percents</span>
                </div>
            </div>
            <div className="overflow-y-auto" style={{ height: 'calc(405px - 64px)' }}>
                {tab === 'screen' ? (
                    <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                        Screen dimensions coming soon
                    </div>
                ) : (
                    <div className="space-y-0.5 px-1 pb-2">
                        {data.slice(0, 25).map((item: any, i: number) => {
                            const pct = total > 0 ? (item.value / total) * 100 : 0;
                            const icon = tab === 'devices'
                                ? <DeviceIcon device={item.name} />
                                : tab === 'browsers'
                                ? <BrowserIcon browser={item.name} />
                                : <OSIcon os={item.name} />;
                            return (
                                <DataRow
                                    key={item.name}
                                    label={item.name}
                                    value={item.value}
                                    percentage={pct}
                                    maxPercentage={maxPct}
                                    icon={icon}
                                    onClick={() => toggleFilter(dim, item.name)}
                                    active={filters[dim].includes(item.name)}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
            <SeeAllBtn count={data.length} label={tabLabel + 's'} />
        </motion.div>
    );
}

// ─── Geography Tabbed Panel ───
function GeoPanel({
    countries, cities, languages, allCountries, filters, toggleFilter,
}: {
    countries: any[]; cities: any[]; languages: any[]; allCountries: any[];
    filters: DashboardFilters;
    toggleFilter: (dim: any, val: string) => void;
}) {
    const [tab, setTab] = useState<'countries' | 'regions' | 'cities' | 'languages' | 'map'>('countries');

    const cTotal = allCountries.reduce((s: number, c: any) => s + (c.users || 0), 0);
    const cMaxPct = cTotal > 0 ? ((allCountries[0]?.users || 0) / cTotal) * 100 : 100;

    const cityTotal = cities.reduce((s: number, c: any) => s + (c.users || 0), 0);
    const cityMaxPct = cityTotal > 0 ? ((cities[0]?.users || 0) / cityTotal) * 100 : 100;

    const langTotal = languages.reduce((s: number, l: any) => s + (l.value || 0), 0);
    const langMaxPct = langTotal > 0 ? ((languages[0]?.value || 0) / langTotal) * 100 : 100;

    const tabLabel = tab === 'countries' ? 'Country' : tab === 'cities' ? 'City' : 'Language';
    const metricLabel = tab === 'languages' ? 'Visitors' : 'Users';

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className={`${CARD} overflow-hidden min-w-0`}
            style={{ height: 405 }}
        >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 min-w-0">
                    <h4 className="text-[13px] font-semibold text-white flex-shrink-0">Geography</h4>
                    <div className="flex gap-0.5 overflow-x-auto scrollbar-hide">
                        <TabBtn label="Countries" active={tab === 'countries'} onClick={() => setTab('countries')} />
                        <TabBtn label="Regions" active={tab === 'regions'} onClick={() => setTab('regions')} />
                        <TabBtn label="Cities" active={tab === 'cities'} onClick={() => setTab('cities')} />
                        <TabBtn label="Languages" active={tab === 'languages'} onClick={() => setTab('languages')} />
                        <TabBtn label="Map" active={tab === 'map'} onClick={() => setTab('map')} />
                    </div>
                </div>
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {allCountries.slice(0, 4).map((c: any, i: number) => (
                        <CountryFlag key={i} country={c.country} />
                    ))}
                    <button className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition ml-1" title="Expand">
                        <Maximize2 className="w-3 h-3" />
                    </button>
                </div>
            </div>
            {tab !== 'map' && (
                <div className="flex justify-between px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider font-medium">
                    <span>{tabLabel}</span>
                    <div className="flex items-center gap-1.5">
                        <span>{metricLabel}</span>
                        <span className="text-zinc-700">Percents</span>
                    </div>
                </div>
            )}
            <div className="overflow-y-auto" style={{ height: tab === 'map' ? 'calc(405px - 40px)' : 'calc(405px - 64px)' }}>
                {tab === 'countries' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {countries.slice(0, 25).map((c: any, i: number) => {
                            const pct = cTotal > 0 ? (c.users / cTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={c.country}
                                    label={c.country}
                                    value={c.users}
                                    percentage={pct}
                                    maxPercentage={cMaxPct}
                                    icon={<CountryFlag country={c.country} />}
                                    onClick={() => toggleFilter('country', c.country)}
                                    active={filters.country.includes(c.country)}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'regions' && (
                    <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">
                        Regional breakdown coming soon
                    </div>
                )}

                {tab === 'cities' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {cities.slice(0, 25).map((c: any, i: number) => {
                            const pct = cityTotal > 0 ? (c.users / cityTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={`${c.city}-${c.country}-${i}`}
                                    label={`${c.city}, ${c.country}`}
                                    value={c.users}
                                    percentage={pct}
                                    maxPercentage={cityMaxPct}
                                    icon={<CountryFlag country={c.country} />}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'languages' && (
                    <div className="space-y-0.5 px-1 pb-2">
                        {languages.slice(0, 25).map((l: any, i: number) => {
                            const pct = langTotal > 0 ? (l.value / langTotal) * 100 : 0;
                            return (
                                <DataRow
                                    key={l.name}
                                    label={l.name}
                                    value={l.value}
                                    percentage={pct}
                                    maxPercentage={langMaxPct}
                                    barColor={PANEL_COLORS[i % PANEL_COLORS.length]}
                                />
                            );
                        })}
                    </div>
                )}

                {tab === 'map' && (
                    <div className="h-full">
                        <WorldMap
                            byCountry={allCountries.map((c: any) => ({ country: c.country, users: c.users }))}
                            byCity={cities.map((c: any) => ({ city: c.city, country: c.country, users: c.users }))}
                            onBubbleClick={(name: string) => toggleFilter('country', name)}
                            activeCountry={filters.country[0] || null}
                        />
                    </div>
                )}
            </div>
            {tab === 'countries' && <SeeAllBtn count={countries.length} label="Countries" />}
            {tab === 'cities' && <SeeAllBtn count={cities.length} label="Cities" />}
            {tab === 'languages' && <SeeAllBtn count={languages.length} label="Languages" />}
        </motion.div>
    );
}

// ─── Intelligence: Engagement Card ───
function EngagementCard({ kpis, traffic }: { kpis: any; traffic: any[] }) {
    if (!kpis) return null;
    const score = Math.min(100, Math.round(
        (Math.min(kpis.avgSessionDuration / 300, 1) * 30) + (Math.min(kpis.pagesPerSession / 5, 1) * 25) +
        (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25) + (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
    ));
    const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
    const barHex = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';

    // Daily engagement mini bars from traffic data
    const dailyScores = traffic.slice(-30).map((d: any) => {
        const durScore = Math.min(d.avgSessionDuration || 0, 300) / 300;
        const ppsScore = d.sessions > 0 ? Math.min(d.pageViews / d.sessions, 5) / 5 : 0;
        const bounceScore = Math.max(0, 1 - (d.bounceRate || 0) / 100);
        return Math.round((durScore * 0.33 + ppsScore * 0.33 + bounceScore * 0.34) * 100);
    });
    const maxDaily = Math.max(...dailyScores, 1);

    const avgDuration = fmtDur(kpis.avgSessionDuration || 0);
    const pps = (kpis.pagesPerSession || 0).toFixed(1);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${CARD} p-3 sm:p-5 overflow-hidden`}>
            <div className="flex items-center justify-between mb-3 min-w-0">
                <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-400 flex-shrink-0" />
                    <h4 className="text-sm font-semibold text-white truncate">Engagement Score</h4>
                </div>
                <span className="text-[10px] text-zinc-600 tabular-nums">{dailyScores.length}d</span>
            </div>
            <div className="flex items-end gap-3 mb-3">
                <AnimatedCounter value={score} className={`text-4xl sm:text-5xl font-bold ${color} leading-none`} />
                <div className="flex items-end gap-[2px] h-[32px] flex-1 min-w-0">
                    {dailyScores.map((s, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-sm min-w-[2px] transition-all"
                            style={{
                                height: `${Math.max((s / maxDaily) * 100, 8)}%`,
                                backgroundColor: barHex,
                                opacity: 0.3 + (s / maxDaily) * 0.7,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Avg Duration</span>
                    <span className="text-zinc-300 font-medium tabular-nums">{avgDuration}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Pages / Session</span>
                    <span className="text-zinc-300 font-medium tabular-nums">{pps}</span>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Intelligence: Loyalty Card ───
function LoyaltyCard({ kpis, traffic }: { kpis: any; traffic: any[] }) {
    if (!kpis) return null;
    const returning = kpis.returningUsers || 0;
    const newUsers = kpis.newUsers || (kpis.totalUsers - returning);
    const total = kpis.totalUsers || 1;
    const loyaltyPct = Math.round((returning / total) * 100);
    const newPct = 100 - loyaltyPct;

    // Daily user mini bars
    const dailyUsers = traffic.slice(-30).map((d: any) => d.activeUsers || 0);
    const maxDaily = Math.max(...dailyUsers, 1);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${CARD} p-3 sm:p-5 overflow-hidden`}>
            <div className="flex items-center justify-between mb-3 min-w-0">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-pink-400 flex-shrink-0" />
                    <h4 className="text-sm font-semibold text-white truncate">Audience Loyalty</h4>
                </div>
                <span className="text-[10px] text-zinc-600 tabular-nums">{dailyUsers.length}d</span>
            </div>
            <div className="flex items-end gap-3 mb-3">
                <AnimatedCounter value={loyaltyPct} className="text-4xl sm:text-5xl font-bold text-pink-400 leading-none" />
                <div className="flex items-end gap-[2px] h-[32px] flex-1 min-w-0">
                    {dailyUsers.map((u: number, i: number) => (
                        <div
                            key={i}
                            className="flex-1 rounded-sm min-w-[2px] transition-all"
                            style={{
                                height: `${Math.max((u / maxDaily) * 100, 8)}%`,
                                backgroundColor: '#ec4899',
                                opacity: 0.3 + (u / maxDaily) * 0.7,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">New Visitors</span>
                    <div className="flex items-center gap-2">
                        <span className="text-violet-400 font-medium tabular-nums">{newPct}%</span>
                        <div className="w-16 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${newPct}%` }} className="h-full bg-violet-500/60 rounded-full" />
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Returning</span>
                    <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-medium tabular-nums">{loyaltyPct}%</span>
                        <div className="w-16 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${loyaltyPct}%` }} className="h-full bg-emerald-500/60 rounded-full" />
                        </div>
                    </div>
                </div>
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
