'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Eye, Timer, MousePointer,
    Loader2, Download, RefreshCw, Target, Globe
} from 'lucide-react';
import { exportAnalyticsData } from '@/lib/exportUtils';
import { useAnalyticsData } from '@/lib/useDashboardData';
import { useAnalyticsContext } from './layout';
import { CountryFlag, BrowserIcon, OSIcon, DeviceIcon, ReferrerIcon } from '@/components/analytics/AnalyticsIcons';
import AnalyticsTable from '@/components/analytics/AnalyticsTable';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { SkeletonDashboard } from '@/components/analytics/SkeletonLoader';
import AIInsightEngine from '@/components/analytics/AIInsightEngine';
import DrilldownDrawer from '@/components/analytics/DrilldownDrawer';
import { useFilterStore, type DashboardFilters } from '@/stores/analyticsFilterStore';

// ─── Helpers ───

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
}

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
    if (value === 0) return <span className="text-[10px] text-zinc-600">—</span>;
    const positive = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? '+' : ''}{value}{suffix}
        </span>
    );
}

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#0a0a12] border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl min-w-[200px]">
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

const CARD = 'bg-[rgba(255,255,255,0.02)] backdrop-blur-sm border border-white/[0.06] rounded-2xl hover:border-white/[0.1] transition-all duration-200';

// ─── Main Overview Page ───

export default function AnalyticsPage() {
    const { selectedProperty, range, hasGoogleConnection } = useAnalyticsContext();
    const { data: analyticsData, isLoading, isError, refresh } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);
    const { filters, toggleFilter } = useFilterStore();
    const [drilldown, setDrilldown] = useState<any>(null);

    if (isLoading && !analyticsData) return <SkeletonDashboard />;

    if (isError && !analyticsData) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-red-400 text-sm">Failed to load analytics data</p>
                <button onClick={() => refresh()} className="text-xs text-blue-400 hover:underline">Retry</button>
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

    // Drilldown handler (right-click or double-click)
    const openDrilldown = (dimension: keyof DashboardFilters, value: string, metrics?: any[], breakdown?: any[], topPages?: any[]) => {
        setDrilldown({ title: value, dimension, value, metrics, breakdown, topPages });
    };

    return (
        <div className="space-y-5">
            {/* ─── KPI Strip with animated counters ─── */}
            {kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                        { label: 'Visitors', raw: kpis.totalUsers, change: kpis.changeUsers, glow: 'shadow-blue-500/[0.04]', border: 'border-blue-500/15' },
                        { label: 'Sessions', raw: kpis.totalSessions, change: kpis.changeSessions, glow: 'shadow-cyan-500/[0.04]', border: 'border-cyan-500/15' },
                        { label: 'Page Views', raw: kpis.totalPageViews, change: kpis.changePageViews, glow: 'shadow-indigo-500/[0.04]', border: 'border-indigo-500/15' },
                        { label: 'Bounce Rate', formatted: `${kpis.avgBounceRate}%`, change: kpis.changeBounceRate, suffix: '%', glow: 'shadow-amber-500/[0.04]', border: 'border-amber-500/15' },
                        { label: 'Session Time', formatted: formatDuration(kpis.avgSessionDuration), change: 0, glow: 'shadow-purple-500/[0.04]', border: 'border-purple-500/15' },
                        { label: 'New Users', raw: kpis.newUsers, change: 0, glow: 'shadow-pink-500/[0.04]', border: 'border-pink-500/15' },
                        { label: 'Pages/Session', formatted: String(kpis.pagesPerSession), change: 0, glow: 'shadow-orange-500/[0.04]', border: 'border-orange-500/15' },
                    ].map((kpi: any, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={`bg-[rgba(255,255,255,0.02)] border ${kpi.border} rounded-2xl p-3.5 hover:bg-white/[0.03] hover:${kpi.glow} hover:shadow-lg transition-all duration-200`}
                        >
                            <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-widest">{kpi.label}</span>
                            <div className="text-xl font-bold text-white tabular-nums mt-1">
                                {kpi.raw != null ? <AnimatedCounter value={kpi.raw} formatter={formatNumber} /> : kpi.formatted}
                            </div>
                            <div className="mt-1"><ChangeIndicator value={kpi.change} suffix={kpi.suffix} /></div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* ─── Traffic Trend ─── */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className={`${CARD} p-5`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Unique Visitors</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => refresh()} className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-white/[0.04] transition"><RefreshCw className="w-3.5 h-3.5" /></button>
                        <button onClick={() => analyticsData && exportAnalyticsData(analyticsData)} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition"><Download className="w-3.5 h-3.5" /></button>
                    </div>
                </div>
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={traffic} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#3f3f46' }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#3f3f46' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="activeUsers" name="Visitors" stroke="#3b82f6" fill="url(#gU)" strokeWidth={2} dot={false} />
                            <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#818cf8" fill="url(#gS)" strokeWidth={1.5} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* ─── AI Insights ─── */}
            <AIInsightEngine kpis={kpis} countries={countries} channels={channels} pages={pages} devices={devices} browsers={browsers} referrers={referrers} />

            {/* ─── Referrers & Pages ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <h3 className="text-sm font-semibold text-white mb-3">Referrers</h3>
                    <AnalyticsTable
                        data={referrers}
                        searchKey={(item: any) => item.name}
                        searchPlaceholder="Search referrers..."
                        maxRows={12}
                        onRowClick={(item: any) => toggleFilter('referrer', item.name)}
                        activeRow={(item: any) => filters.referrer.includes(item.name)}
                        columns={[
                            { key: 'referrer', label: 'Referrer', sortable: true, getValue: (item: any) => item.name, render: (item: any) => (<div className="flex items-center gap-2"><ReferrerIcon referrer={item.name} /><span className="text-zinc-300 text-xs truncate max-w-[180px]">{item.name}</span></div>) },
                            { key: 'events', label: 'Events', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span> },
                            { key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.users || 0, render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.users?.toLocaleString() || '—'}</span> },
                        ]}
                        defaultSort={{ key: 'events', dir: 'desc' }}
                    />
                </div>

                <div className={`${CARD} p-5`}>
                    <h3 className="text-sm font-semibold text-white mb-3">Top Pages</h3>
                    <AnalyticsTable
                        data={pages}
                        searchKey={(item: any) => item.page}
                        searchPlaceholder="Search pages..."
                        maxRows={12}
                        onRowClick={(item: any) => toggleFilter('page', item.page)}
                        activeRow={(item: any) => filters.page.includes(item.page)}
                        columns={[
                            { key: 'page', label: 'Path', sortable: true, getValue: (item: any) => item.page, render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[200px] block">{item.page}</span> },
                            { key: 'views', label: 'Views', align: 'right' as const, sortable: true, getValue: (item: any) => item.views, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.views?.toLocaleString()}</span> },
                            { key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true, getValue: (item: any) => item.bounceRate || 0, render: (item: any) => (<span className={`text-xs tabular-nums ${(item.bounceRate || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{item.bounceRate}%</span>) },
                        ]}
                        defaultSort={{ key: 'views', dir: 'desc' }}
                    />
                </div>
            </div>

            {/* ─── Geo & Tech ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <GeoPanel countries={countries} cities={cities} onDrilldown={openDrilldown} />
                </div>
                <div className={`${CARD} p-5`}>
                    <TechPanel devices={devices} browsers={browsers} operatingSystems={operatingSystems} />
                </div>
            </div>

            {/* ─── Channels & Languages ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className={`${CARD} p-5`}>
                    <h3 className="text-sm font-semibold text-white mb-3">Channels</h3>
                    <AnalyticsTable
                        data={channels} showSearch={false}
                        onRowClick={(item: any) => toggleFilter('channel', item.name)}
                        activeRow={(item: any) => filters.channel.includes(item.name)}
                        columns={[
                            { key: 'name', label: 'Channel', sortable: true, getValue: (item: any) => item.name, render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span> },
                            { key: 'value', label: 'Visitors', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span> },
                            { key: 'pct', label: '%', align: 'right' as const, render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.percentage}%</span> },
                        ]}
                        defaultSort={{ key: 'value', dir: 'desc' }}
                    />
                </div>

                <div className={`${CARD} p-5`}>
                    <h3 className="text-sm font-semibold text-white mb-3">Languages</h3>
                    <AnalyticsTable
                        data={languages} showSearch={false}
                        columns={[
                            { key: 'name', label: 'Language', sortable: true, getValue: (item: any) => item.name, render: (item: any) => <span className="text-zinc-300 text-xs">{item.name}</span> },
                            { key: 'value', label: 'Visitors', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span> },
                            { key: 'pct', label: '%', align: 'right' as const, render: (item: any) => <span className="text-zinc-500 text-xs tabular-nums">{item.percentage}%</span> },
                        ]}
                        defaultSort={{ key: 'value', dir: 'desc' }}
                    />
                </div>
            </div>

            {/* ─── Entry Pages ─── */}
            <div className={`${CARD} p-5`}>
                <h3 className="text-sm font-semibold text-white mb-3">Entry Pages</h3>
                <AnalyticsTable
                    data={entryPages}
                    searchKey={(item: any) => item.page}
                    searchPlaceholder="Search entry pages..."
                    maxRows={15}
                    columns={[
                        { key: 'page', label: 'Path', sortable: true, getValue: (item: any) => item.page, render: (item: any) => <span className="text-zinc-300 text-xs truncate max-w-[300px] block">{item.page}</span> },
                        { key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.sessions, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.sessions?.toLocaleString()}</span> },
                        { key: 'users', label: 'Users', align: 'right' as const, sortable: true, getValue: (item: any) => item.users || 0, render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.users?.toLocaleString() || '—'}</span> },
                        { key: 'bounce', label: 'Bounce', align: 'right' as const, sortable: true, getValue: (item: any) => item.bounceRate || 0, render: (item: any) => (<span className={`text-xs tabular-nums ${(item.bounceRate || 0) > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{item.bounceRate}%</span>) },
                    ]}
                    defaultSort={{ key: 'sessions', dir: 'desc' }}
                />
            </div>

            {/* ─── Intelligence Cards ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EngagementCard kpis={kpis} />
                <LoyaltyCard kpis={kpis} />
                <DiversityCard channels={channels} />
            </div>

            {/* ─── Drilldown Drawer ─── */}
            <DrilldownDrawer open={!!drilldown} onClose={() => setDrilldown(null)} data={drilldown} />
        </div>
    );
}

// ─── Sub-components ───

function GeoPanel({ countries, cities, onDrilldown }: { countries: any[]; cities: any[]; onDrilldown: Function }) {
    const [tab, setTab] = useState<'country' | 'city'>('country');
    const { filters, toggleFilter } = useFilterStore();
    return (
        <div>
            <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-white">Geo</h3>
                <div className="flex items-center">{countries.slice(0, 6).map((c: any, i: number) => <CountryFlag key={i} country={c.country} />)}</div>
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
                searchKey={(item: any) => item.name}
                searchPlaceholder="Search..."
                maxRows={15}
                onRowClick={(item: any) => {
                    if (tab === 'country') toggleFilter('country', item.name);
                }}
                activeRow={(item: any) => tab === 'country' && filters.country.includes(item.name)}
                columns={[
                    { key: 'name', label: tab === 'country' ? 'Country' : 'City', sortable: true, getValue: (item: any) => item.name, render: (item: any) => (<div className="flex items-center gap-2"><CountryFlag country={item.name.split(',')[0]} /><span className="text-zinc-300 text-xs truncate max-w-[160px]">{item.name}</span></div>) },
                    { key: 'events', label: 'Events', align: 'right' as const, sortable: true, getValue: (item: any) => item.events, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.events?.toLocaleString()}</span> },
                    { key: 'sessions', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.sessions, render: (item: any) => <span className="text-zinc-400 text-xs tabular-nums">{item.sessions ? item.sessions.toLocaleString() : '—'}</span> },
                ]}
                defaultSort={{ key: 'events', dir: 'desc' }}
            />
        </div>
    );
}

function TechPanel({ devices, browsers, operatingSystems }: { devices: any[]; browsers: any[]; operatingSystems: any[] }) {
    const [tab, setTab] = useState<'device' | 'browser' | 'os'>('device');
    const { filters, toggleFilter } = useFilterStore();
    const data = tab === 'device' ? devices.map((d: any) => ({ name: d.device, value: d.sessions, pct: d.percentage }))
        : tab === 'browser' ? browsers.map((b: any) => ({ name: b.name, value: b.value, pct: b.percentage }))
        : operatingSystems.map((o: any) => ({ name: o.name, value: o.value, pct: o.percentage }));
    const dim = tab === 'device' ? 'device' : tab === 'browser' ? 'browser' : 'os';

    return (
        <div>
            <h3 className="text-sm font-semibold text-white mb-3">Technology</h3>
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
                    { key: 'value', label: 'Sessions', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => <span className="text-zinc-300 text-xs tabular-nums">{item.value?.toLocaleString()}</span> },
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-[rgba(255,255,255,0.02)] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
            <div className="flex items-center gap-2 mb-3"><Globe className="w-4 h-4 text-blue-400" /><h4 className="text-sm font-semibold text-white">Source Diversity</h4></div>
            <div className="flex items-end gap-1 mb-3">
                <AnimatedCounter value={score} className={`text-3xl font-bold ${color}`} />
                <span className="text-xs text-zinc-600 mb-1">/ 100</span>
            </div>
            <div className="space-y-1">
                {channels.slice(0, 4).map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400">{c.name}</span>
                        <span className="text-zinc-600 tabular-nums">{Math.round(((c.value || 0) / Math.max(total, 1)) * 100)}%</span>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
