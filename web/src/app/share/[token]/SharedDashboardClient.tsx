'use client';

import {
    AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts';

/* ─── Types ─── */
interface KPI {
    label: string;
    value: string;
    change: string;
    positive: boolean;
}

interface TrafficPoint {
    date: string;
    users: number;
    sessions: number;
    views: number;
}

interface SourceItem {
    source: string;
    sessions: number;
}

interface PageItem {
    page: string;
    views: number;
}

interface SharedDashboardClientProps {
    kpis: KPI[];
    trafficTrend: TrafficPoint[];
    sources: SourceItem[];
    topPages: PageItem[];
    showSources: boolean;
    showPages: boolean;
    showGeo: boolean;
}

/* ─── Chart tooltip ─── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-white/[0.1] bg-[#0a0a0f]/95 backdrop-blur px-3 py-2 shadow-xl">
            <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
            {payload.map((entry, i) => (
                <p key={i} className="text-xs font-mono" style={{ color: entry.color }}>
                    {entry.dataKey}: {entry.value.toLocaleString()}
                </p>
            ))}
        </div>
    );
}

/* ─── Format number for display ─── */
function fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/* ─── Main Client Component ─── */
export default function SharedDashboardClient({
    kpis,
    trafficTrend,
    sources,
    topPages,
    showSources,
    showPages,
}: SharedDashboardClientProps) {
    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpis.map((kpi) => (
                    <div
                        key={kpi.label}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                        <p className="text-xs text-zinc-500 mb-1">{kpi.label}</p>
                        <p className="text-2xl font-bold text-zinc-100 font-mono tracking-tight">
                            {kpi.value}
                        </p>
                        <p className={`text-xs mt-1 font-medium ${kpi.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {kpi.positive ? '\u2191' : '\u2193'} {kpi.change}
                        </p>
                    </div>
                ))}
            </div>

            {/* Traffic Trend Chart */}
            {trafficTrend.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                    <h3 className="text-sm font-semibold text-zinc-300 mb-4">Traffic Trend</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trafficTrend}>
                                <defs>
                                    <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: '#71717a' }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#71717a' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v) => fmtNum(v)}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="users"
                                    stroke="#34d399"
                                    strokeWidth={2}
                                    fill="url(#gradUsers)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="sessions"
                                    stroke="#22d3ee"
                                    strokeWidth={1.5}
                                    fill="url(#gradSessions)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Users
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Sessions
                        </span>
                    </div>
                </div>
            )}

            {/* Sources + Top Pages (side by side on large screens) */}
            {(showSources || showPages) && (
                <div className={`grid gap-4 ${showSources && showPages ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Traffic Sources */}
                    {showSources && sources.length > 0 && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Traffic Sources</h3>
                            <div className="space-y-2">
                                {sources.map((src, i) => {
                                    const maxSessions = Math.max(...sources.map((s) => s.sessions));
                                    const pct = maxSessions > 0 ? (src.sessions / maxSessions) * 100 : 0;
                                    return (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-zinc-300 truncate">{src.source}</span>
                                                <span className="text-xs text-zinc-500 font-mono">{fmtNum(src.sessions)}</span>
                                            </div>
                                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-emerald-400/40"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Top Pages */}
                    {showPages && topPages.length > 0 && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Top Pages</h3>
                            <div className="space-y-2">
                                {topPages.map((pg, i) => {
                                    const maxViews = Math.max(...topPages.map((p) => p.views));
                                    const pct = maxViews > 0 ? (pg.views / maxViews) * 100 : 0;
                                    return (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-zinc-300 truncate max-w-[70%]">{pg.page}</span>
                                                <span className="text-xs text-zinc-500 font-mono">{fmtNum(pg.views)}</span>
                                            </div>
                                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-cyan-400/40"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
