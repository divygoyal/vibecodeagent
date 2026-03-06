'use client';

import { useState, useMemo } from 'react';
import { signIn } from 'next-auth/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Eye, Timer, MousePointer, Layers,
    Download, RefreshCw, Target, Globe, Bot, Clock, Search,
    Filter as FilterIcon, MapPin, BarChart3, UserPlus
} from 'lucide-react';
import { exportAnalyticsData } from '@/lib/exportUtils';
import { useAnalyticsData, useSeoData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from './layout';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
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
    if (value === 0) return <span className="text-[10px] text-zinc-600">—</span>;
    const up = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {up ? '+' : ''}{value}{suffix}
        </span>
    );
}

// Progress bar for table cells
function Bar({ value, max, color = 'bg-blue-500/40' }: { value: number; max: number; color?: string }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <span className="text-zinc-300 text-xs tabular-nums font-medium min-w-[40px] text-right">{value?.toLocaleString()}</span>
            <div className="flex-1 h-[5px] bg-white/[0.04] rounded-full overflow-hidden min-w-[60px]">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

// Section header with filter indicator
function SectionHead({ title, filterDim, filterValues }: { title: string; filterDim?: string; filterValues?: string[] }) {
    const active = filterValues && filterValues.length > 0;
    return (
        <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {active && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[9px] text-blue-400 font-medium">
                    <FilterIcon className="w-2.5 h-2.5" /> Filtered
                </span>
            )}
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

const CARD = 'bg-[rgba(255,255,255,0.02)] backdrop-blur-sm border border-white/[0.04] rounded-2xl hover:border-white/[0.1] transition-all duration-200';

// ─── Main Overview Page ───
// Traffic Sources donut colors
const SOURCE_COLORS = ['#34d399', '#3b82f6', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c'];

export default function AnalyticsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data: analyticsData, isLoading, isError, refresh } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);
    const { data: seoData } = useSeoData('all', undefined, hasGoogleConnection);
    const { filters, toggleFilter } = useFilterStore();
    const [drilldown, setDrilldown] = useState<any>(null);

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

    // ─── ACTUAL CROSS-FILTERING: filter each dataset by its own dimension ───
    const fCountries = filters.country.length > 0
        ? countries.filter((c: any) => filters.country.includes(c.country))
        : countries;
    const fCities = filters.country.length > 0
        ? cities.filter((c: any) => filters.country.includes(c.country))
        : cities;
    const fReferrers = filters.referrer.length > 0
        ? referrers.filter((r: any) => filters.referrer.includes(r.name))
        : referrers;
    const fPages = filters.page.length > 0
        ? pages.filter((p: any) => filters.page.includes(p.page))
        : pages;
    const fDevices = filters.device.length > 0
        ? devices.filter((d: any) => filters.device.includes(d.device))
        : devices;
    const fBrowsers = filters.browser.length > 0
        ? browsers.filter((b: any) => filters.browser.includes(b.name))
        : browsers;
    const fOS = filters.os.length > 0
        ? operatingSystems.filter((o: any) => filters.os.includes(o.name))
        : operatingSystems;
    const fChannels = filters.channel.length > 0
        ? channels.filter((c: any) => filters.channel.includes(c.name))
        : channels;
    const fEntryPages = filters.page.length > 0
        ? entryPages.filter((p: any) => filters.page.includes(p.page))
        : entryPages;

    // Max values for progress bars
    const maxRef = Math.max(...referrers.map((r: any) => r.value || 0), 1);
    const maxPageViews = Math.max(...pages.map((p: any) => p.views || 0), 1);
    const maxCountryUsers = Math.max(...countries.map((c: any) => c.users || 0), 1);
    const maxEntryPageSessions = Math.max(...entryPages.map((p: any) => p.sessions || 0), 1);

    const openDrilldown = (dimension: keyof DashboardFilters, value: string) => {
        setDrilldown({ title: value, dimension, value });
    };

    const anyFilterActive = Object.values(filters).some(arr => arr.length > 0);

    // ─── Cross-filter: recalculate KPIs from whichever dimension is filtered ───
    const filteredKpis = useMemo(() => {
        if (!kpis || !anyFilterActive) return null;

        // Calculate the proportion of users captured by each active filter dimension
        // Use the smallest ratio (most restrictive filter) as our scaling factor
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
            _ratio: ratio, // keep for chart scaling
        };
    }, [kpis, anyFilterActive, filters, fCountries, fPages, fDevices, fBrowsers, fChannels, fReferrers, fOS, countries, pages, devices, browsers, channels, referrers, operatingSystems]);

    // ─── Filtered traffic for chart: scale proportionally using the filter ratio ───
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

    // Use filtered KPIs when filters active, otherwise original
    const displayKpis = filteredKpis || kpis;

    // Prepare traffic sources data for donut chart
    const sourceData = useMemo(() => {
        if (!channels.length) return [];
        const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
        return channels.slice(0, 6).map((c: any) => ({
            name: String(c.name || 'Other'),
            value: c.value || 0,
            pct: total > 0 ? Math.round(((c.value || 0) / total) * 100) : 0,
        }));
    }, [channels]);

    // GSC queries
    const seoQueries: any[] = seoData?.queries || [];

    return (
        <div className="space-y-5">
            {/* ─── KPI Cards (clean, matching reference) ─── */}
            {kpis && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Active Users', value: displayKpis?.totalUsers ?? kpis.totalUsers, change: kpis.changeUsers, formatted: false },
                        { label: 'Sessions', value: displayKpis?.totalSessions ?? kpis.totalSessions, change: kpis.changeSessions, formatted: false },
                        { label: 'Bounce Rate', value: displayKpis?.avgBounceRate ?? kpis.avgBounceRate, change: kpis.changeBounceRate, formatted: true, suffix: '%' },
                        { label: 'Avg Duration', value: kpis.avgSessionDuration || 0, change: 0, formatted: true, isDuration: true },
                    ].map((k: any, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            className={`${CARD} p-5`}>
                            <p className="text-xs text-zinc-500 mb-3">{k.label}</p>
                            <div className="text-2xl sm:text-[32px] font-bold text-white tabular-nums leading-none mb-2">
                                {k.isDuration ? fmtDur(k.value) : k.formatted ? `${k.value}${k.suffix || ''}` : <AnimatedCounter value={k.value} formatter={fmt} />}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Change value={k.change} suffix="% vs last period" />
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* ─── Traffic Trend + Traffic Sources (side by side) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Traffic Trend chart — 3/5 width */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className={`${CARD} p-5 lg:col-span-3`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-semibold text-white">Traffic Trend</h3>
                            {anyFilterActive && (
                                <span className="flex items-center gap-1 text-[9px] text-blue-400 bg-blue-500/[0.08] border border-blue-500/20 rounded-md px-2 py-0.5">
                                    <FilterIcon className="w-2.5 h-2.5" /> Filtered
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Users</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400" /> Sessions</span>
                            <button onClick={() => refresh()} className="p-1 rounded text-zinc-600 hover:text-blue-400 transition ml-1"><RefreshCw className="w-3.5 h-3.5" /></button>
                            <button onClick={() => analyticsData && exportAnalyticsData(analyticsData)} className="p-1 rounded text-zinc-600 hover:text-white transition"><Download className="w-3.5 h-3.5" /></button>
                        </div>
                    </div>
                    <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartTraffic} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#3f3f46' }} tickFormatter={(v: string) => { const d = new Date(v); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#3f3f46' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Area type="monotone" dataKey="activeUsers" name="Users" stroke="#34d399" fill="url(#gU)" strokeWidth={2} dot={false} />
                                <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#22d3ee" fill="url(#gS)" strokeWidth={1.5} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Traffic Sources donut — 2/5 width */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className={`${CARD} p-5 lg:col-span-2`}>
                    <h3 className="text-sm font-semibold text-white mb-4">Traffic Sources</h3>
                    {sourceData.length > 0 ? (
                        <div className="flex flex-col items-center">
                            <div className="h-[180px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={sourceData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                                            {sourceData.map((_: any, idx: number) => (
                                                <Cell key={idx} fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v: any) => (v ?? 0).toLocaleString()} contentStyle={{ background: '#050508', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2 w-full max-w-[280px]">
                                {sourceData.map((s: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                                        <span className="text-[11px] text-zinc-400 truncate">{s.name}</span>
                                        <span className="text-[11px] text-white font-semibold ml-auto tabular-nums">{s.pct}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-[200px] text-zinc-600 text-sm">No source data</div>
                    )}
                </motion.div>
            </div>

            {/* ─── Top Search Queries from GSC ─── */}
            {seoQueries.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className={`${CARD} p-5`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-white">Top Search Queries</h3>
                        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                            <Search className="w-3 h-3" /> From Google Search Console
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.04]">
                                    <th className="text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 pr-4">Query</th>
                                    <th className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 px-4">Clicks</th>
                                    <th className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 px-4">Impressions</th>
                                    <th className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 px-4">CTR</th>
                                    <th className="text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider pb-3 pl-4">Position</th>
                                </tr>
                            </thead>
                            <tbody>
                                {seoQueries.slice(0, 10).map((q: any, i: number) => {
                                    const maxClicks = Math.max(...seoQueries.slice(0, 10).map((x: any) => x.clicks || 0), 1);
                                    const barW = Math.round(((q.clicks || 0) / maxClicks) * 100);
                                    return (
                                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                                            <td className="py-3 pr-4">
                                                <span className="text-xs text-zinc-300">{String(q.query || '')}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-[80px] h-[5px] bg-white/[0.04] rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full bg-emerald-500/50" style={{ width: `${barW}%` }} />
                                                    </div>
                                                    <span className="text-xs text-white font-semibold tabular-nums min-w-[40px] text-right">{(q.clicks || 0).toLocaleString()}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <span className="text-xs text-zinc-400 tabular-nums">{(q.impressions || 0).toLocaleString()}</span>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`text-xs font-medium tabular-nums ${(q.ctr || 0) >= 5 ? 'text-emerald-400' : 'text-zinc-400'}`}>{q.ctr || 0}%</span>
                                            </td>
                                            <td className="py-3 pl-4 text-right">
                                                <span className="text-xs text-zinc-400 tabular-nums">{q.position || 0}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}

            {/* ─── Referrers & Pages (with progress bars + filtering) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <SectionHead title="Referrers" filterDim="referrer" filterValues={filters.referrer} />
                    <AnalyticsTable
                        data={fReferrers} searchKey={(item: any) => item.name} searchPlaceholder="Search referrers..." maxRows={12}
                        onRowClick={(item: any) => toggleFilter('referrer', item.name)}
                        activeRow={(item: any) => filters.referrer.includes(item.name)}
                        columns={[
                            { key: 'referrer', label: 'Referrer', sortable: true, getValue: (item: any) => item.name, render: (item: any) => (<div className="flex items-center gap-2"><ReferrerIcon referrer={item.name} /><span className="text-zinc-300 text-xs truncate max-w-[140px]">{item.name}</span></div>) },
                            { key: 'events', label: 'Events', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <Bar value={item.value} max={maxRef} /> },
                        ]}
                        defaultSort={{ key: 'events', dir: 'desc' }}
                    />
                </div>

                <div className={`${CARD} p-5`}>
                    <SectionHead title="Top Pages" filterDim="page" filterValues={filters.page} />
                    <AnalyticsTable
                        data={fPages} searchKey={(item: any) => item.page} searchPlaceholder="Search pages..." maxRows={12}
                        onRowClick={(item: any) => toggleFilter('page', item.page)}
                        activeRow={(item: any) => filters.page.includes(item.page)}
                        columns={[
                            { key: 'page', label: 'Path', sortable: true, getValue: (item: any) => item.page, render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[180px] block">{item.page}</span> },
                            { key: 'views', label: 'Views', align: 'right' as const, sortable: true, getValue: (item: any) => item.views, render: (item: any) => <Bar value={item.views} max={maxPageViews} color="bg-indigo-500/40" /> },
                            { key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true, getValue: (item: any) => item.bounceRate || 0, render: (item: any) => (<span className={`text-xs tabular-nums ${(item.bounceRate || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{item.bounceRate}%</span>) },
                        ]}
                        defaultSort={{ key: 'views', dir: 'desc' }}
                    />
                </div>
            </div>

            {/* ─── Geo + Map & Tech ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <GeoPanel countries={fCountries} cities={fCities} allCountries={countries} maxUsers={maxCountryUsers} />
                </div>
                <div className={`${CARD} p-5`}>
                    <TechPanel devices={fDevices} browsers={fBrowsers} operatingSystems={fOS} allDevices={devices} allBrowsers={browsers} allOS={operatingSystems} />
                </div>
            </div>

            {/* ─── Channels & Mini Map ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <SectionHead title="Channels" filterDim="channel" filterValues={filters.channel} />
                    <AnalyticsTable
                        data={fChannels} showSearch={false}
                        onRowClick={(item: any) => toggleFilter('channel', item.name)}
                        activeRow={(item: any) => filters.channel.includes(item.name)}
                        columns={[
                            { key: 'name', label: 'Channel', sortable: true, getValue: (item: any) => item.name, render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span> },
                            {
                                key: 'value', label: 'Visitors', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => {
                                    const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
                                    const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                    return (
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-300 text-xs tabular-nums min-w-[40px] text-right">{item.value?.toLocaleString()}</span>
                                            <div className="flex-1 h-[5px] bg-white/[0.04] rounded-full overflow-hidden min-w-[50px]">
                                                <div className="h-full rounded-full bg-emerald-500/40" style={{ width: `${pct}%`, transition: 'width 0.4s' }} />
                                            </div>
                                            <span className="text-zinc-500 text-[10px] tabular-nums min-w-[28px] text-right">{pct}%</span>
                                        </div>
                                    );
                                }
                            },
                        ]}
                        defaultSort={{ key: 'value', dir: 'desc' }}
                    />
                </div>

                {/* Mini Map Widget */}
                <div className={`${CARD} overflow-hidden`}>
                    <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        <h3 className="text-sm font-semibold text-white">Map</h3>
                    </div>
                    <div className="h-[280px]">
                        <WorldMap
                            byCountry={countries.map((c: any) => ({ country: c.country, users: c.users }))}
                            byCity={cities.map((c: any) => ({ city: c.city, country: c.country, users: c.users }))}
                            onBubbleClick={(name: string) => toggleFilter('country', name)}
                            activeCountry={filters.country[0] || null}
                        />
                    </div>
                </div>
            </div>

            {/* ─── Entry Pages ─── */}
            <div className={`${CARD} p-5`}>
                <SectionHead title="Entry Pages" filterDim="page" filterValues={filters.page} />
                <AnalyticsTable
                    data={fEntryPages} searchKey={(item: any) => item.page} searchPlaceholder="Search entry pages..." maxRows={15}
                    columns={[
                        { key: 'page', label: 'Path', sortable: true, getValue: (item: any) => item.page, render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[280px] block">{item.page}</span> },
                        { key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.sessions, render: (item: any) => <Bar value={item.sessions} max={maxEntryPageSessions} color="bg-cyan-500/40" /> },
                        { key: 'users', label: 'Users', align: 'right' as const, sortable: true, getValue: (item: any) => item.users || 0, render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.users?.toLocaleString() || '—'}</span> },
                        { key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true, getValue: (item: any) => item.bounceRate || 0, render: (item: any) => (<span className={`text-xs tabular-nums ${(item.bounceRate || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{item.bounceRate}%</span>) },
                    ]}
                    defaultSort={{ key: 'sessions', dir: 'desc' }}
                />
            </div>

            {/* ─── Languages ─── */}
            <div className={`${CARD} p-5`}>
                <SectionHead title="Languages" />
                <AnalyticsTable
                    data={languages} showSearch={false} maxRows={10}
                    columns={[
                        { key: 'name', label: 'Language', sortable: true, getValue: (item: any) => item.name, render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span> },
                        { key: 'value', label: 'Visitors', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span> },
                        { key: 'pct', label: '%', align: 'right' as const, render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.percentage}%</span> },
                    ]}
                    defaultSort={{ key: 'value', dir: 'desc' }}
                />
            </div>

            {/* ─── Intelligence Cards ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EngagementCard kpis={kpis} />
                <LoyaltyCard kpis={kpis} />
                <DiversityCard channels={channels} />
            </div>

            <DrilldownDrawer open={!!drilldown} onClose={() => setDrilldown(null)} data={drilldown} />
        </div>
    );
}

// ─── Sub-components ───

function GeoPanel({ countries, cities, allCountries, maxUsers }: { countries: any[]; cities: any[]; allCountries: any[]; maxUsers: number }) {
    const [tab, setTab] = useState<'country' | 'city'>('country');
    const { filters, toggleFilter } = useFilterStore();
    return (
        <div>
            <div className="flex items-center gap-3 mb-3">
                <SectionHead title="Geo" filterDim="country" filterValues={filters.country} />
                <div className="flex items-center ml-auto">{allCountries.slice(0, 8).map((c: any, i: number) => <CountryFlag key={i} country={c.country} />)}</div>
            </div>
            <div className="flex gap-1 mb-3">
                {(['country', 'city'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${tab === t ? 'bg-white/[0.06] text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                        {t === 'country' ? 'Country' : 'City'}
                    </button>
                ))}
            </div>
            <AnalyticsTable
                data={tab === 'country'
                    ? countries.map((c: any) => ({ name: c.country, events: c.users, sessions: c.sessions || 0 }))
                    : cities.map((c: any) => ({ name: `${c.city}, ${c.country}`, events: c.users, sessions: 0 }))
                }
                searchKey={(item: any) => item.name} searchPlaceholder="Search..." maxRows={15}
                onRowClick={(item: any) => { if (tab === 'country') toggleFilter('country', item.name); }}
                activeRow={(item: any) => tab === 'country' && filters.country.includes(item.name)}
                columns={[
                    { key: 'name', label: tab === 'country' ? 'Country' : 'City', sortable: true, getValue: (item: any) => item.name, render: (item: any) => (<div className="flex items-center gap-2"><CountryFlag country={item.name.split(',')[0]} /><span className="text-zinc-300 text-xs truncate max-w-[130px]">{item.name}</span></div>) },
                    { key: 'events', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.events, render: (item: any) => <Bar value={item.events} max={maxUsers} color="bg-violet-500/40" /> },
                ]}
                defaultSort={{ key: 'events', dir: 'desc' }}
            />
        </div>
    );
}

function TechPanel({ devices, browsers, operatingSystems, allDevices, allBrowsers, allOS }: { devices: any[]; browsers: any[]; operatingSystems: any[]; allDevices: any[]; allBrowsers: any[]; allOS: any[] }) {
    const [tab, setTab] = useState<'device' | 'browser' | 'os'>('device');
    const { filters, toggleFilter } = useFilterStore();
    const data = tab === 'device' ? devices.map((d: any) => ({ name: d.device, value: d.sessions, pct: d.percentage }))
        : tab === 'browser' ? browsers.map((b: any) => ({ name: b.name, value: b.value, pct: b.percentage }))
            : operatingSystems.map((o: any) => ({ name: o.name, value: o.value, pct: o.percentage }));
    const dim = tab === 'device' ? 'device' : tab === 'browser' ? 'browser' : 'os';
    const maxVal = Math.max(...data.map((d: any) => d.value || 0), 1);

    return (
        <div>
            <SectionHead title="Technology" filterDim={dim} filterValues={filters[dim]} />
            <div className="flex gap-1 mb-3">
                {(['device', 'browser', 'os'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition ${tab === t ? 'bg-white/[0.06] text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                        {t === 'device' ? 'Device' : t === 'browser' ? 'Browser' : 'OS'}
                    </button>
                ))}
            </div>
            <AnalyticsTable
                data={data} showSearch={false}
                onRowClick={(item: any) => toggleFilter(dim, item.name)}
                activeRow={(item: any) => filters[dim].includes(item.name)}
                columns={[
                    { key: 'name', label: 'Name', sortable: true, getValue: (item: any) => item.name, render: (item: any) => (<div className="flex items-center gap-2">{tab === 'device' ? <DeviceIcon device={item.name} /> : tab === 'browser' ? <BrowserIcon browser={item.name} /> : <OSIcon os={item.name} />}<span className="text-zinc-300 text-xs">{item.name}</span></div>) },
                    { key: 'value', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <Bar value={item.value} max={maxVal} color="bg-cyan-500/40" /> },
                    { key: 'pct', label: '%', align: 'right' as const, render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.pct}%</span> },
                ]}
                defaultSort={{ key: 'value', dir: 'desc' }}
            />
        </div>
    );
}

function EngagementCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const score = Math.min(100, Math.round(
        (Math.min(kpis.avgSessionDuration / 300, 1) * 30) + (Math.min(kpis.pagesPerSession / 5, 1) * 25) +
        (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25) + (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
    ));
    const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
    const bg = score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${CARD} p-5`}>
            <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-violet-400" /><h4 className="text-sm font-semibold text-white">Engagement Score</h4></div>
            <div className="flex items-end gap-2 mb-2">
                <AnimatedCounter value={score} className={`text-3xl font-bold ${color}`} />
                <span className="text-xs text-zinc-600 mb-1">/ 100</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${bg}`} />
            </div>
        </motion.div>
    );
}

function LoyaltyCard({ kpis }: { kpis: any }) {
    if (!kpis) return null;
    const returning = kpis.returningUsers || 0;
    const total = kpis.totalUsers || 1;
    const loyaltyPct = Math.round((returning / total) * 100);
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${CARD} p-5`}>
            <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-pink-400" /><h4 className="text-sm font-semibold text-white">Audience Loyalty</h4></div>
            <div className="flex justify-between text-xs mb-1"><span className="text-zinc-600">New</span><span className="text-zinc-600">Returning</span></div>
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

function DiversityCard({ channels }: { channels: any[] }) {
    if (!channels.length) return null;
    const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
    const shares = channels.map((c: any) => (c.value || 0) / Math.max(total, 1));
    const entropy = -shares.reduce((s: number, p: number) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(Math.max(channels.length, 1));
    const score = Math.round((entropy / Math.max(maxEntropy, 0.01)) * 100);
    const color = score >= 60 ? 'text-emerald-400' : score >= 35 ? 'text-amber-400' : 'text-red-400';
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${CARD} p-5`}>
            <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-blue-400" /><h4 className="text-sm font-semibold text-white">Source Diversity</h4></div>
            <div className="flex items-end gap-1 mb-3">
                <AnimatedCounter value={score} className={`text-3xl font-bold ${color}`} />
                <span className="text-xs text-zinc-600 mb-1">/ 100</span>
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
