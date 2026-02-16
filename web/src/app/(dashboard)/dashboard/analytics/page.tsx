'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Users, Eye, Timer, MousePointer, Globe,
    ChevronDown, ChevronUp, Loader2, Download, CalendarDays,
    ArrowUpRight, RefreshCw, Target, Languages
} from 'lucide-react';
import { exportAnalyticsData } from '@/lib/exportUtils';
import { useAnalyticsData, usePropertyList, useContainerStatus, useRealtimeData } from '@/lib/useDashboardData';
import { signIn } from 'next-auth/react';

const InteractiveGlobe = dynamic(() => import('@/components/InteractiveGlobe'), { ssr: false });
const AIChatbot = dynamic(() => import('@/components/AIChatbot'), { ssr: false });

// ─── Types ───

interface KPIs {
    totalUsers: number; totalSessions: number; totalPageViews: number;
    avgBounceRate: number; avgSessionDuration: number; newUsers: number;
    returningUsers: number; pagesPerSession: number;
    changeUsers: number; changeSessions: number; changePageViews: number; changeBounceRate: number;
}

// ─── Constants ───

const RANGE_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: 'Last 7 days' },
    { value: '14d', label: 'Last 14 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '6m', label: 'Last 6 months' },
    { value: '12m', label: 'Last 12 months' },
];

const GRANULARITY_OPTIONS = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
];

const BAR_COLORS = ['#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#c4b5fd', '#ddd6fe', '#a78bfa', '#8b5cf6'];

// ─── Reusable Components ───

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
    const positive = value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? '+' : ''}{value}{suffix}
        </span>
    );
}

function KPICard({ icon: Icon, label, value, change, changeSuffix, color = 'text-zinc-400' }: {
    icon: any; label: string; value: string; change: number; changeSuffix?: string; color?: string;
}) {
    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.1] transition-colors group">
            <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${color}`}>{label}</span>
                <ChangeIndicator value={change} suffix={changeSuffix} />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
        </div>
    );
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
}

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900 border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl">
            <p className="text-xs text-zinc-400 mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
                    {entry.name}: {entry.value.toLocaleString()}
                </p>
            ))}
        </div>
    );
};

// ─── Tabbed Data Panel (like the screenshot) ───

function TabbedDataPanel({ title, tabs, data, renderRow, renderHeader, showDetailsButton = true }: {
    title?: string;
    tabs: { key: string; label: string }[];
    data: Record<string, any[]>;
    renderRow: (item: any, index: number, tabKey: string) => React.ReactNode;
    renderHeader?: (tabKey: string) => React.ReactNode;
    showDetailsButton?: boolean;
}) {
    const [activeTab, setActiveTab] = useState(tabs[0]?.key || '');
    const [showAll, setShowAll] = useState(false);
    const items = data[activeTab] || [];
    const displayItems = showAll ? items : items.slice(0, 10);

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Tab header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 pt-3">
                <div className="flex items-center gap-1 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => { setActiveTab(tab.key); setShowAll(false); }}
                            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition border-b-2 -mb-px ${
                                activeTab === tab.key
                                    ? 'text-white border-emerald-400'
                                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {renderHeader && <div className="text-xs text-zinc-500 flex-shrink-0 ml-2">{renderHeader(activeTab)}</div>}
            </div>

            {/* Content */}
            <div className="p-4 space-y-1.5">
                {displayItems.length === 0 && (
                    <div className="text-center py-6 text-xs text-zinc-600">No data available</div>
                )}
                {displayItems.map((item, i) => renderRow(item, i, activeTab))}
            </div>

            {/* Details button */}
            {showDetailsButton && items.length > 10 && (
                <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full py-2.5 border-t border-white/[0.06] text-xs text-zinc-500 hover:text-emerald-400 transition flex items-center justify-center gap-1"
                >
                    {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showAll ? 'Show less' : `DETAILS (${items.length} total)`}
                </button>
            )}
        </div>
    );
}

// ─── Horizontal Bar Row Component ───

function BarRow({ label, value, maxValue, color = '#a78bfa', suffix, icon }: {
    label: string; value: number; maxValue: number; color?: string; suffix?: string; icon?: React.ReactNode;
}) {
    const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
    return (
        <div className="flex items-center gap-3 group hover:bg-white/[0.02] rounded-lg px-2 py-1.5 -mx-2 transition">
            {icon && <span className="text-sm flex-shrink-0">{icon}</span>}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-300 truncate">{label}</span>
                    <span className="text-xs text-zinc-400 font-medium tabular-nums ml-2">{formatNumber(value)}{suffix}</span>
                </div>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
                </div>
            </div>
        </div>
    );
}

// ─── Traffic aggregation helper for granularity ───

function aggregateTraffic(traffic: any[], granularity: string): any[] {
    if (!traffic.length || granularity === 'daily') return traffic;
    const bucketSize = granularity === 'weekly' ? 7 : 30;
    const buckets: any[] = [];
    for (let i = 0; i < traffic.length; i += bucketSize) {
        const slice = traffic.slice(i, i + bucketSize);
        if (slice.length === 0) break;
        buckets.push({
            date: slice[0].date,
            activeUsers: Math.round(slice.reduce((s: number, d: any) => s + (d.activeUsers || 0), 0) / slice.length),
            sessions: Math.round(slice.reduce((s: number, d: any) => s + (d.sessions || 0), 0) / slice.length),
            pageViews: Math.round(slice.reduce((s: number, d: any) => s + (d.pageViews || 0), 0) / slice.length),
            bounceRate: +(slice.reduce((s: number, d: any) => s + (d.bounceRate || 0), 0) / slice.length).toFixed(1),
        });
    }
    return buckets;
}

// ─── Main Page ───

export default function AnalyticsPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { properties, isLoading: propsLoading } = usePropertyList(hasGoogleConnection);
    const [selectedProperty, setSelectedProperty] = useState('');
    const [range, setRange] = useState('30d');
    const [granularity, setGranularity] = useState('daily');
    const [showRangeDropdown, setShowRangeDropdown] = useState(false);

    useEffect(() => {
        if (properties.length > 0 && !selectedProperty) {
            setSelectedProperty(properties[0].property);
        }
    }, [properties, selectedProperty]);

    // Pass range to the hook so data refetches when range changes
    const { data: analyticsData, isLoading, isError, refresh } = useAnalyticsData('all', selectedProperty, hasGoogleConnection, range);
    // Real-time data for the globe (auto-refreshes every 15s)
    const { data: realtimeData } = useRealtimeData(selectedProperty, hasGoogleConnection);

    // Show connect prompt if Google not connected
    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <Globe className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Connect Google to view Analytics</h2>
                <p className="text-sm text-zinc-400 text-center max-w-md">Sign in with your Google account to access your Analytics data.</p>
                <button onClick={() => signIn('google')} className="px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm">
                    Connect Google
                </button>
            </div>
        );
    }

    if ((isLoading || containerLoading) && !analyticsData) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <span className="ml-3 text-zinc-400 text-sm">Loading Analytics...</span>
            </div>
        );
    }

    if (isError && !analyticsData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-red-400 text-sm">Failed to load analytics data</p>
            </div>
        );
    }

    // Extract all data
    const kpis: KPIs | null = analyticsData?.kpis || null;
    const traffic: any[] = Array.isArray(analyticsData?.traffic) ? analyticsData.traffic : [];
    const sources: any[] = Array.isArray(analyticsData?.sources) ? analyticsData.sources : [];
    const pages: any[] = Array.isArray(analyticsData?.pages) ? analyticsData.pages : [];
    const devices: any[] = Array.isArray(analyticsData?.devices) ? analyticsData.devices : [];
    const countries: any[] = Array.isArray(analyticsData?.countries) ? analyticsData.countries : [];
    const browsers: any[] = Array.isArray(analyticsData?.browsers) ? analyticsData.browsers : [];
    const operatingSystems: any[] = Array.isArray(analyticsData?.operatingSystems) ? analyticsData.operatingSystems : [];
    const channels: any[] = Array.isArray(analyticsData?.channels) ? analyticsData.channels : [];
    const referrers: any[] = Array.isArray(analyticsData?.referrers) ? analyticsData.referrers : [];
    const cities: any[] = Array.isArray(analyticsData?.cities) ? analyticsData.cities : [];
    const regions: any[] = Array.isArray(analyticsData?.regions) ? analyticsData.regions : [];
    const entryPages: any[] = Array.isArray(analyticsData?.entryPages) ? analyticsData.entryPages : [];
    const languages: any[] = Array.isArray(analyticsData?.languages) ? analyticsData.languages : [];

    // Compute max values for bar charts
    const maxChannel = channels.length > 0 ? channels[0].value : 1;
    const maxReferrer = referrers.length > 0 ? referrers[0].value : 1;
    const maxCountry = countries.length > 0 ? countries[0].users : 1;
    const maxBrowser = browsers.length > 0 ? browsers[0].value : 1;
    const maxPage = pages.length > 0 ? pages[0].views : 1;
    const maxEntryPage = entryPages.length > 0 ? entryPages[0].sessions : 1;

    return (
        <div className="space-y-6">
            {/* ─── Header ─── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analytics</h1>
                    <p className="text-sm text-zinc-500 mt-1">Google Analytics 4 &middot; {RANGE_OPTIONS.find(r => r.value === range)?.label}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Property Selector */}
                    <div className="relative">
                        <select
                            value={selectedProperty}
                            onChange={(e) => setSelectedProperty(e.target.value)}
                            disabled={propsLoading || properties.length === 0}
                            className="appearance-none bg-zinc-900 border border-white/[0.1] rounded-lg pl-3 pr-8 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition min-w-[160px]"
                        >
                            {propsLoading ? (
                                <option>Loading...</option>
                            ) : properties.length === 0 ? (
                                <option value="">No properties</option>
                            ) : (
                                properties.map((p: any) => (
                                    <option key={p.property} value={p.property}>{p.displayName}</option>
                                ))
                            )}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>

                    {/* Date Range Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowRangeDropdown(!showRangeDropdown)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-900 border border-white/[0.1] rounded-lg text-zinc-300 hover:border-emerald-500/30 transition"
                        >
                            <CalendarDays className="w-3.5 h-3.5 text-zinc-500" />
                            {RANGE_OPTIONS.find(r => r.value === range)?.label}
                            <ChevronDown className="w-3 h-3 text-zinc-500" />
                        </button>
                        {showRangeDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowRangeDropdown(false)} />
                                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-white/[0.1] rounded-xl shadow-2xl py-1 min-w-[180px]">
                                    {RANGE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { setRange(opt.value); setShowRangeDropdown(false); }}
                                            className={`w-full text-left px-4 py-2 text-sm transition ${
                                                range === opt.value ? 'text-emerald-400 bg-emerald-500/[0.05]' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Granularity Selector */}
                    <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                        {GRANULARITY_OPTIONS.map(g => (
                            <button
                                key={g.value}
                                onClick={() => setGranularity(g.value)}
                                className={`px-2.5 py-1.5 text-xs font-medium transition ${granularity === g.value ? 'bg-emerald-400/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>

                    {/* Refresh */}
                    <button onClick={() => refresh()} className="p-1.5 text-zinc-500 hover:text-emerald-400 transition" title="Refresh">
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    {/* Export */}
                    <button
                        onClick={() => exportAnalyticsData(analyticsData)}
                        disabled={!analyticsData}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export
                    </button>
                </div>
            </div>

            {/* ─── KPI Cards (7 metrics like the screenshot) ─── */}
            {kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <KPICard icon={Users} label="Visitors" value={formatNumber(kpis.totalUsers)} change={kpis.changeUsers} color="text-emerald-400" />
                    <KPICard icon={MousePointer} label="Sessions" value={formatNumber(kpis.totalSessions)} change={kpis.changeSessions} color="text-cyan-400" />
                    <KPICard icon={Eye} label="Page Views" value={formatNumber(kpis.totalPageViews)} change={kpis.changePageViews} color="text-blue-400" />
                    <KPICard icon={ArrowUpRight} label="Bounce Rate" value={`${kpis.avgBounceRate}%`} change={kpis.changeBounceRate} changeSuffix="%" color="text-amber-400" />
                    <KPICard icon={Timer} label="Session Time" value={formatDuration(kpis.avgSessionDuration)} change={0} color="text-purple-400" />
                    <KPICard icon={Users} label="New Users" value={formatNumber(kpis.newUsers)} change={0} color="text-pink-400" />
                    <KPICard icon={Eye} label="Pages/Session" value={String(kpis.pagesPerSession)} change={0} color="text-orange-400" />
                </div>
            )}

            {/* ─── Traffic Trend Chart ─── */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Traffic Trend</h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={aggregateTraffic(traffic, granularity)} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v: string) => v.slice(5)} />
                            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="activeUsers" name="Visitors" stroke="#34d399" fill="url(#gradUsers)" strokeWidth={2} />
                            <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#a78bfa" fill="url(#gradSessions)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ─── Sources & Geography (side by side tabbed panels) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Channel / Referrer / Campaign / Keyword */}
                <TabbedDataPanel
                    tabs={[
                        { key: 'channel', label: 'Channel' },
                        { key: 'referrer', label: 'Referrer' },
                        { key: 'source', label: 'Source' },
                        { key: 'language', label: 'Language' },
                    ]}
                    data={{
                        channel: channels,
                        referrer: referrers,
                        source: sources.map((s: any) => ({ name: s.source, value: s.sessions, users: s.users, percentage: s.percentage })),
                        language: languages,
                    }}
                    renderRow={(item, i, tabKey) => {
                        const max = tabKey === 'channel' ? maxChannel : tabKey === 'referrer' ? maxReferrer : (item.value || 1);
                        const topVal = tabKey === 'channel' ? maxChannel : tabKey === 'referrer' ? maxReferrer : (sources[0]?.sessions || languages[0]?.value || 1);
                        return (
                            <BarRow
                                key={i}
                                label={item.name || item.source || ''}
                                value={item.value || item.sessions || 0}
                                maxValue={topVal}
                                color={BAR_COLORS[i % BAR_COLORS.length]}
                            />
                        );
                    }}
                    renderHeader={(tabKey) => <span>Visitors %</span>}
                />

                {/* Right: Country / Region / City */}
                <TabbedDataPanel
                    tabs={[
                        { key: 'country', label: 'Country' },
                        { key: 'region', label: 'Region' },
                        { key: 'city', label: 'City' },
                    ]}
                    data={{
                        country: countries.map((c: any) => ({ name: c.country, value: c.users, percentage: c.percentage })),
                        region: regions.map((r: any) => ({ name: `${r.region}, ${r.country}`, value: r.users })),
                        city: cities.map((c: any) => ({ name: `${c.city}, ${c.country}`, value: c.users })),
                    }}
                    renderRow={(item, i) => (
                        <BarRow
                            key={i}
                            label={item.name}
                            value={item.value}
                            maxValue={maxCountry}
                            color={BAR_COLORS[i % BAR_COLORS.length]}
                        />
                    )}
                    renderHeader={() => <span>Visitors %</span>}
                />
            </div>

            {/* ─── Pages & Tech (side by side tabbed panels) ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pages / Entry Page */}
                <TabbedDataPanel
                    tabs={[
                        { key: 'page', label: 'Page' },
                        { key: 'entry', label: 'Entry page' },
                    ]}
                    data={{
                        page: pages.map((p: any) => ({ name: p.page, value: p.views, bounceRate: p.bounceRate, avgTime: p.avgTime })),
                        entry: entryPages.map((p: any) => ({ name: p.page, value: p.sessions, bounceRate: p.bounceRate })),
                    }}
                    renderRow={(item, i, tabKey) => (
                        <BarRow
                            key={i}
                            label={item.name}
                            value={item.value}
                            maxValue={tabKey === 'page' ? maxPage : maxEntryPage}
                            color={BAR_COLORS[i % BAR_COLORS.length]}
                        />
                    )}
                    renderHeader={() => <span>Visitors %</span>}
                />

                {/* Browser / OS / Device */}
                <TabbedDataPanel
                    tabs={[
                        { key: 'browser', label: 'Browser' },
                        { key: 'os', label: 'OS' },
                        { key: 'device', label: 'Device' },
                    ]}
                    data={{
                        browser: browsers,
                        os: operatingSystems,
                        device: devices.map((d: any) => ({ name: d.device, value: d.sessions, users: d.users, percentage: d.percentage })),
                    }}
                    renderRow={(item, i) => (
                        <BarRow
                            key={i}
                            label={item.name || item.device || ''}
                            value={item.value || item.sessions || 0}
                            maxValue={maxBrowser}
                            color={BAR_COLORS[i % BAR_COLORS.length]}
                        />
                    )}
                    renderHeader={() => <span>Visitors %</span>}
                />
            </div>

            {/* ─── Real-Time Visitors Globe ─── */}
            <InteractiveGlobe
                realtimeData={realtimeData}
                countries={countries}
                cities={cities}
                referrers={referrers}
                devices={devices}
            />

            {/* ─── Top Pages Table (detailed) ─── */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Top Pages (Detailed)</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                <th className="text-left pb-3 font-medium">Page</th>
                                <th className="text-right pb-3 font-medium">Views</th>
                                <th className="text-right pb-3 font-medium hidden sm:table-cell">Unique</th>
                                <th className="text-right pb-3 font-medium hidden md:table-cell">Avg. Time</th>
                                <th className="text-right pb-3 font-medium">Bounce</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pages.map((p: any, i: number) => (
                                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-300 font-medium truncate max-w-[250px]">{p.page}</span>
                                            <ArrowUpRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                                        </div>
                                        <span className="text-xs text-zinc-600">{p.title}</span>
                                    </td>
                                    <td className="text-right text-zinc-300 font-medium tabular-nums">{p.views?.toLocaleString()}</td>
                                    <td className="text-right text-zinc-400 hidden sm:table-cell tabular-nums">{p.uniqueViews?.toLocaleString()}</td>
                                    <td className="text-right text-zinc-400 hidden md:table-cell">{p.avgTime}</td>
                                    <td className="text-right">
                                        <span className={`${p.bounceRate > 40 ? 'text-amber-400' : 'text-emerald-400'} tabular-nums`}>
                                            {p.bounceRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Advanced Analytics Intelligence ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Engagement Score */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <Target className="w-4 h-4 text-violet-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Engagement Score</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Composite metric combining session duration, pages/session, scroll depth, and return visits into a single 0-100 score.</p>
                    {kpis ? (() => {
                        const score = Math.min(100, Math.round(
                            (Math.min(kpis.avgSessionDuration / 300, 1) * 30) +
                            (Math.min(kpis.pagesPerSession / 5, 1) * 25) +
                            (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25) +
                            (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
                        ));
                        const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
                        const bg = score >= 70 ? 'bg-emerald-400' : score >= 40 ? 'bg-amber-400' : 'bg-red-400';
                        return (
                            <div>
                                <div className="flex items-end gap-2 mb-2">
                                    <span className={`text-3xl font-bold ${color}`}>{score}</span>
                                    <span className="text-xs text-zinc-500 mb-1">/ 100</span>
                                </div>
                                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${bg} transition-all duration-700`} style={{ width: `${score}%` }} />
                                </div>
                            </div>
                        );
                    })() : <span className="text-[11px] text-zinc-600">Loading...</span>}
                </div>

                {/* Content Velocity Tracker */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Content Velocity</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Tracks which pages are gaining traffic fastest — identifies your viral and rising content before competitors notice.</p>
                    {pages.length > 0 ? (
                        <div className="space-y-1.5">
                            {pages.slice(0, 4).map((p: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400 truncate max-w-[55%]">{p.page}</span>
                                    <span className="text-cyan-400 font-medium tabular-nums">{p.views?.toLocaleString()} views</span>
                                </div>
                            ))}
                        </div>
                    ) : <span className="text-[11px] text-zinc-600">Connect to see velocity</span>}
                </div>

                {/* Bounce Rate Heatmap */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <ArrowUpRight className="w-4 h-4 text-amber-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Bounce Rate by Page</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Visual heatmap of bounce rates across your top pages — instantly spot which pages need UX improvements.</p>
                    {pages.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {pages.slice(0, 12).map((p: any, i: number) => {
                                const br = p.bounceRate || 0;
                                const bg = br > 60 ? 'bg-red-500/30' : br > 40 ? 'bg-amber-500/30' : 'bg-emerald-500/30';
                                return (
                                    <div key={i} className={`${bg} rounded px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono`} title={`${p.page}: ${br}%`}>
                                        {br}%
                                    </div>
                                );
                            })}
                        </div>
                    ) : <span className="text-[11px] text-zinc-600">No data</span>}
                </div>

                {/* Audience Loyalty Index */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                            <Users className="w-4 h-4 text-pink-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Audience Loyalty Index</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Measures how sticky your audience is — ratio of returning vs new users, session frequency, and multi-page engagement.</p>
                    {kpis ? (() => {
                        const returning = kpis.returningUsers || 0;
                        const total = kpis.totalUsers || 1;
                        const loyaltyPct = Math.round((returning / total) * 100);
                        return (
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-zinc-500">New</span>
                                        <span className="text-zinc-500">Returning</span>
                                    </div>
                                    <div className="h-3 bg-white/[0.04] rounded-full overflow-hidden flex">
                                        <div className="h-full bg-violet-500/50 transition-all" style={{ width: `${100 - loyaltyPct}%` }} />
                                        <div className="h-full bg-emerald-500/50 transition-all" style={{ width: `${loyaltyPct}%` }} />
                                    </div>
                                    <div className="flex justify-between text-[10px] mt-1">
                                        <span className="text-violet-400">{100 - loyaltyPct}%</span>
                                        <span className="text-emerald-400">{loyaltyPct}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })() : <span className="text-[11px] text-zinc-600">Loading...</span>}
                </div>

                {/* Traffic Source Diversity */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Source Diversity Score</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Measures how diversified your traffic sources are. Low diversity = risky dependency on a single channel.</p>
                    {channels.length > 0 ? (() => {
                        const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);
                        const shares = channels.map((c: any) => (c.value || 0) / Math.max(total, 1));
                        const entropy = -shares.reduce((s: number, p: number) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
                        const maxEntropy = Math.log2(Math.max(channels.length, 1));
                        const diversityScore = Math.round((entropy / Math.max(maxEntropy, 0.01)) * 100);
                        const color = diversityScore >= 60 ? 'text-emerald-400' : diversityScore >= 35 ? 'text-amber-400' : 'text-red-400';
                        return (
                            <div>
                                <span className={`text-2xl font-bold ${color}`}>{diversityScore}</span>
                                <span className="text-xs text-zinc-500 ml-1">/ 100</span>
                                <div className="mt-2 space-y-1">
                                    {channels.slice(0, 3).map((c: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between text-[11px]">
                                            <span className="text-zinc-400">{c.name}</span>
                                            <span className="text-zinc-500">{Math.round(((c.value || 0) / Math.max(total, 1)) * 100)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })() : <span className="text-[11px] text-zinc-600">No channel data</span>}
                </div>

                {/* Geographic Concentration */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Languages className="w-4 h-4 text-blue-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Geo Concentration Risk</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Warns when traffic is too concentrated in one region — suggests localization and international SEO opportunities.</p>
                    {countries.length > 0 ? (() => {
                        const total = countries.reduce((s: number, c: any) => s + (c.users || 0), 0);
                        const topPct = Math.round(((countries[0]?.users || 0) / Math.max(total, 1)) * 100);
                        const risk = topPct > 70 ? 'High' : topPct > 45 ? 'Medium' : 'Low';
                        const color = risk === 'High' ? 'text-red-400' : risk === 'Medium' ? 'text-amber-400' : 'text-emerald-400';
                        return (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-sm font-bold ${color}`}>{risk} Risk</span>
                                    <span className="text-xs text-zinc-500">— {topPct}% from {countries[0]?.country}</span>
                                </div>
                                {countries.slice(0, 4).map((c: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
                                        <span className="text-zinc-400">{c.country}</span>
                                        <span className="text-zinc-500 tabular-nums">{Math.round(((c.users || 0) / Math.max(total, 1)) * 100)}%</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })() : <span className="text-[11px] text-zinc-600">No geo data</span>}
                </div>
            </div>

            {/* ─── AI SEO Advisor Chatbot ─── */}
            <AIChatbot analyticsData={analyticsData} />
        </div>
    );
}
