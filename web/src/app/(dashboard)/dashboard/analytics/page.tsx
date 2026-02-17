'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Loader2, Download, RefreshCw, Target, Globe,
    Filter as FilterIcon, MapPin
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

    return (
        <div className="space-y-5">
            {/* ─── KPI Strip ─── */}
            {kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                        { label: 'Visitors', raw: kpis.totalUsers, change: kpis.changeUsers, color: 'text-blue-400', border: 'border-blue-500/15', bg: 'bg-blue-500' },
                        { label: 'Sessions', raw: kpis.totalSessions, change: kpis.changeSessions, color: 'text-cyan-400', border: 'border-cyan-500/15', bg: 'bg-cyan-500' },
                        { label: 'Page Views', raw: kpis.totalPageViews, change: kpis.changePageViews, color: 'text-indigo-400', border: 'border-indigo-500/15', bg: 'bg-indigo-500' },
                        { label: 'Bounce Rate', formatted: `${kpis.avgBounceRate}%`, change: kpis.changeBounceRate, suffix: '%', color: 'text-amber-400', border: 'border-amber-500/15', bg: 'bg-amber-500' },
                        { label: 'Avg. Duration', formatted: fmtDur(kpis.avgSessionDuration), change: 0, color: 'text-purple-400', border: 'border-purple-500/15', bg: 'bg-purple-500' },
                        { label: 'New Users', raw: kpis.newUsers, change: 0, color: 'text-pink-400', border: 'border-pink-500/15', bg: 'bg-pink-500' },
                        { label: 'Pages/Session', formatted: String(kpis.pagesPerSession), change: 0, color: 'text-orange-400', border: 'border-orange-500/15', bg: 'bg-orange-500' },
                    ].map((k: any, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            className={`bg-[rgba(255,255,255,0.02)] border ${k.border} rounded-2xl p-3.5 hover:bg-white/[0.03] transition-all duration-200 group`}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className={`w-1 h-1 rounded-full ${k.bg}`} />
                                <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-widest">{k.label}</span>
                            </div>
                            <div className={`text-xl font-bold tabular-nums mt-1 ${k.color} group-hover:text-white transition-colors`}>
                                {k.raw != null ? <AnimatedCounter value={k.raw} formatter={fmt} /> : k.formatted}
                            </div>
                            <div className="mt-1"><Change value={k.change} suffix={k.suffix} /></div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* ─── Traffic Trend ─── */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className={`${CARD} p-5`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-white">Unique Visitors</h3>
                        {anyFilterActive && (
                            <span className="text-[9px] text-zinc-600 bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-0.5">
                                Chart shows unfiltered trend
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => refresh()} className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-white/[0.04] transition"><RefreshCw className="w-3.5 h-3.5" /></button>
                        <button onClick={() => analyticsData && exportAnalyticsData(analyticsData)} className="p-1.5 rounded-lg text-zinc-600 hover:text-white hover:bg-white/[0.04] transition"><Download className="w-3.5 h-3.5" /></button>
                    </div>
                </div>
                <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={traffic} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.12} />
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
                            { key: 'value', label: 'Visitors', align: 'right' as const, sortable: true, getValue: (item: any) => item.value, render: (item: any) => {
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
                            }},
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
