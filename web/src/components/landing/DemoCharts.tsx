'use client';

import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Search } from 'lucide-react';

const trafficData = [
    { date: 'Jan 1', users: 1240, sessions: 1890 },
    { date: 'Jan 8', users: 1580, sessions: 2340 },
    { date: 'Jan 15', users: 1390, sessions: 2100 },
    { date: 'Jan 22', users: 1820, sessions: 2780 },
    { date: 'Jan 29', users: 2100, sessions: 3200 },
    { date: 'Feb 5', users: 1950, sessions: 2950 },
    { date: 'Feb 12', users: 2340, sessions: 3580 },
    { date: 'Feb 19', users: 2680, sessions: 4100 },
    { date: 'Feb 26', users: 2450, sessions: 3800 },
    { date: 'Mar 5', users: 2890, sessions: 4420 },
    { date: 'Mar 12', users: 3150, sessions: 4810 },
    { date: 'Mar 19', users: 3420, sessions: 5200 },
];

const queryData = [
    { query: 'best crm software 2025', clicks: 892, impressions: 12400, ctr: 7.2, position: 3.2 },
    { query: 'saas analytics tool', clicks: 654, impressions: 8900, ctr: 7.3, position: 4.1 },
    { query: 'website performance monitor', clicks: 521, impressions: 15200, ctr: 3.4, position: 8.7 },
    { query: 'how to improve seo', clicks: 489, impressions: 22100, ctr: 2.2, position: 12.3 },
    { query: 'google analytics alternative', clicks: 445, impressions: 6700, ctr: 6.6, position: 5.4 },
];

const sourceData = [
    { name: 'Organic', value: 42, color: '#34d399' },
    { name: 'Direct', value: 28, color: '#22d3ee' },
    { name: 'Social', value: 18, color: '#a78bfa' },
    { name: 'Referral', value: 12, color: '#f472b6' },
];

function KPICard({ label, value, change, positive }: { label: string; value: string; change: string; positive: boolean }) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            <div className="text-xl font-bold text-white">{value}</div>
            <div className={`text-xs mt-1 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>{change}</div>
        </div>
    );
}

export default function DemoCharts() {
    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6">
                <KPICard label="Active Users" value="24,582" change="+22.4%" positive />
                <KPICard label="Search Clicks" value="8,965" change="+18.7%" positive />
                <KPICard label="Avg Position" value="7.1" change="-0.4%" positive />
                <KPICard label="AI Queries" value="1,247" change="+156%" positive />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 sm:px-6 pb-4 sm:pb-6">
                {/* Traffic chart - spans 2 cols */}
                <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-white">Traffic Trend</h3>
                        <div className="flex gap-3 text-xs">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                <span className="text-zinc-400">Users</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                                <span className="text-zinc-400">Sessions</span>
                            </span>
                        </div>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trafficData}>
                                <defs>
                                    <linearGradient id="gradientUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradientSessions" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.2} />
                                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                                <Tooltip
                                    contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '12px' }}
                                    labelStyle={{ color: '#a1a1aa' }}
                                />
                                <Area type="monotone" dataKey="sessions" stroke="#22d3ee" strokeWidth={2} fill="url(#gradientSessions)" />
                                <Area type="monotone" dataKey="users" stroke="#34d399" strokeWidth={2} fill="url(#gradientUsers)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Traffic sources */}
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5">
                    <h3 className="text-sm font-medium text-white mb-4">Traffic Sources</h3>
                    <div className="h-[140px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sourceData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={65}
                                    paddingAngle={3}
                                    dataKey="value"
                                    strokeWidth={0}
                                >
                                    {sourceData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        {sourceData.map((s) => (
                            <div key={s.name} className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                                <span className="text-zinc-400">{s.name}</span>
                                <span className="text-zinc-300 ml-auto">{s.value}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Top Queries table */}
            <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-white">Top Search Queries</h3>
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <Search className="w-3 h-3" /> From Google Search Console
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-zinc-500 uppercase tracking-wider">
                                    <th className="text-left pb-3 font-medium">Query</th>
                                    <th className="text-right pb-3 font-medium">Clicks</th>
                                    <th className="text-right pb-3 font-medium">Impressions</th>
                                    <th className="text-right pb-3 font-medium">CTR</th>
                                    <th className="text-right pb-3 font-medium">Position</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queryData.map((row, i) => (
                                    <tr key={i} className="border-t border-white/[0.04]">
                                        <td className="py-2.5 text-zinc-300">{row.query}</td>
                                        <td className="py-2.5 text-right text-emerald-400 font-medium">{row.clicks.toLocaleString()}</td>
                                        <td className="py-2.5 text-right text-zinc-400">{row.impressions.toLocaleString()}</td>
                                        <td className="py-2.5 text-right">
                                            <span className={row.ctr >= 5 ? 'text-emerald-400' : 'text-amber-400'}>{row.ctr}%</span>
                                        </td>
                                        <td className="py-2.5 text-right text-zinc-400">{row.position}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}
