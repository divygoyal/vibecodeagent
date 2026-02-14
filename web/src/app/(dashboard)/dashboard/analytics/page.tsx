'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Users, Eye, Timer, MousePointer, ArrowUpRight, Globe, Monitor, Smartphone, Tablet, RefreshCcw, Loader2 } from 'lucide-react';
import WorldMap from '@/components/WorldMap';

interface KPIs {
    totalUsers: number;
    totalSessions: number;
    totalPageViews: number;
    avgBounceRate: number;
    avgSessionDuration: number;
    newUsers: number;
    returningUsers: number;
    pagesPerSession: number;
    changeUsers: number;
    changeSessions: number;
    changePageViews: number;
    changeBounceRate: number;
}

interface TrafficPoint {
    date: string;
    activeUsers: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
}

interface Source {
    source: string;
    sessions: number;
    percentage: number;
}

interface TopPage {
    page: string;
    title: string;
    views: number;
    uniqueViews: number;
    avgTime: string;
    bounceRate: number;
}

interface DeviceData {
    device: string;
    sessions: number;
    percentage: number;
}

interface CountryData {
    country: string;
    users: number;
    percentage: number;
}

const PIE_COLORS = ['#34d399', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#60a5fa', '#94a3b8'];

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
    const positive = value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {positive ? '+' : ''}{value}{suffix}
        </span>
    );
}

function KPICard({ icon: Icon, label, value, change, changeSuffix }: {
    icon: any; label: string; value: string; change: number; changeSuffix?: string;
}) {
    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors">
            <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center">
                    <Icon className="w-4 h-4 text-zinc-400" />
                </div>
                <ChangeIndicator value={change} suffix={changeSuffix} />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-zinc-500 mt-1">{label}</div>
        </div>
    );
}

function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
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

export default function AnalyticsPage() {
    const [kpis, setKpis] = useState<KPIs | null>(null);
    const [traffic, setTraffic] = useState<TrafficPoint[]>([]);
    const [sources, setSources] = useState<Source[]>([]);
    const [pages, setPages] = useState<TopPage[]>([]);
    const [devices, setDevices] = useState<DeviceData[]>([]);
    const [countries, setCountries] = useState<CountryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [range, setRange] = useState('30d');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/analytics?range=${range}&section=all`);
            if (!res.ok) throw new Error('Failed to fetch analytics');
            const data = await res.json();
            setKpis(data.kpis);
            setTraffic(data.traffic || []);
            setSources(data.sources || []);
            setPages(data.pages || []);
            setDevices(data.devices || []);
            setCountries(data.countries || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [range]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={fetchData} className="px-4 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-zinc-300 hover:bg-white/[0.08] transition">
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analytics</h1>
                    <p className="text-sm text-zinc-500 mt-1">Google Analytics 4 data for your connected property</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
                        {['7d', '30d', '90d'].map(r => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-3 py-1.5 text-xs font-medium transition ${range === r ? 'bg-emerald-400/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <button onClick={fetchData} className="p-2 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition">
                        <RefreshCcw className="w-4 h-4 text-zinc-400" />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            {kpis && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard icon={Users} label="Total Users" value={kpis.totalUsers.toLocaleString()} change={kpis.changeUsers} />
                    <KPICard icon={MousePointer} label="Sessions" value={kpis.totalSessions.toLocaleString()} change={kpis.changeSessions} />
                    <KPICard icon={Eye} label="Page Views" value={kpis.totalPageViews.toLocaleString()} change={kpis.changePageViews} />
                    <KPICard icon={Timer} label="Avg. Session" value={formatDuration(kpis.avgSessionDuration)} change={kpis.changeBounceRate} changeSuffix="% bounce" />
                </div>
            )}

            {/* Traffic Trend + Sources */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Traffic Trend Chart */}
                <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Traffic Trend</h3>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={traffic} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => v.slice(5)} />
                                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="activeUsers" name="Users" stroke="#34d399" fill="url(#gradUsers)" strokeWidth={2} />
                                <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#22d3ee" fill="url(#gradSessions)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Traffic Sources */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Traffic Sources</h3>
                    <div className="h-[160px] mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={sources} dataKey="sessions" nameKey="source" cx="50%" cy="50%" innerRadius={40} outerRadius={65} strokeWidth={0}>
                                    {sources.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                        {sources.slice(0, 5).map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                                    <span className="text-zinc-400">{s.source}</span>
                                </div>
                                <span className="text-zinc-300 font-medium">{s.percentage}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Devices + Countries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Devices */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Devices</h3>
                    <div className="space-y-3">
                        {devices.map((d, i) => {
                            const icons = { Desktop: Monitor, Mobile: Smartphone, Tablet: Tablet };
                            const DevIcon = (icons as any)[d.device] || Monitor;
                            return (
                                <div key={i} className="flex items-center gap-3">
                                    <DevIcon className="w-4 h-4 text-zinc-500" />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-zinc-300">{d.device}</span>
                                            <span className="text-xs text-zinc-500">{d.sessions.toLocaleString()} ({d.percentage}%)</span>
                                        </div>
                                        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${d.percentage}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Countries */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Top Countries</h3>
                    <div className="space-y-2.5">
                        {countries.map((c, i) => (
                            <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Globe className="w-3.5 h-3.5 text-zinc-600" />
                                    <span className="text-sm text-zinc-300">{c.country}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-zinc-500">{c.users.toLocaleString()}</span>
                                    <div className="w-16 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-cyan-400/60" style={{ width: `${c.percentage}%` }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Interactive World Map */}
            <WorldMap />

            {/* Top Pages Table */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Top Pages</h3>
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
                            {pages.map((p, i) => (
                                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                                    <td className="py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-zinc-300 font-medium truncate max-w-[200px]">{p.page}</span>
                                            <ArrowUpRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                                        </div>
                                        <span className="text-xs text-zinc-600">{p.title}</span>
                                    </td>
                                    <td className="text-right text-zinc-300 font-medium">{p.views.toLocaleString()}</td>
                                    <td className="text-right text-zinc-400 hidden sm:table-cell">{p.uniqueViews.toLocaleString()}</td>
                                    <td className="text-right text-zinc-400 hidden md:table-cell">{p.avgTime}</td>
                                    <td className="text-right">
                                        <span className={`${p.bounceRate > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                            {p.bounceRate}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
