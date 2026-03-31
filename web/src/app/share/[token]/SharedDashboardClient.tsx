'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts';

/* ─── Types ─── */
interface ShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    seo: boolean;
}

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

interface CountryItem {
    country: string;
    users: number;
}

interface SeoKpis {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
}

interface SeoQuery {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface SeoData {
    kpis: SeoKpis;
    queries: SeoQuery[];
}

// Raw shape returned by the /api/share/[token]/data endpoint
interface RawApiResponse {
    kpis?: {
        totalUsers: number;
        totalSessions: number;
        totalPageViews: number;
        avgBounceRate: number;
        changeUsers: number;
        changeSessions: number;
        changePageViews: number;
        changeBounceRate: number;
    };
    traffic?: Array<{
        date: string;
        activeUsers: number;
        sessions: number;
        pageViews: number;
        bounceRate: number;
    }>;
    sources?: Array<{ source: string; sessions: number; users: number; percentage: number }>;
    pages?: Array<{ page: string; title: string; views: number; uniqueViews: number; avgTime: number; bounceRate: number }>;
    countries?: Array<{ country: string; users: number; sessions: number }>;
    seo?: SeoData | null;
    seoError?: string;
}

interface TransformedData {
    kpis: KPI[];
    trafficTrend: TrafficPoint[];
    sources: SourceItem[];
    topPages: PageItem[];
    countries: CountryItem[];
    seo: SeoData | null;
    seoError: string | null;
}

interface SharedDashboardClientProps {
    token: string;
    config: ShareConfig;
    siteUrl?: string;
    views?: number;
}

/* ─── Format helpers ─── */
function fmtNumber(n: number): string {
    return n.toLocaleString('en-US');
}

function fmtCompact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function fmtPct(n: number): string {
    return `${Math.abs(n).toFixed(1)}%`;
}

/* ─── Range options ─── */
const RANGE_OPTIONS = [
    { value: '7d', label: '7 days' },
    { value: '14d', label: '14 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
] as const;

/* ─── Transform raw API response ─── */
function transformData(raw: RawApiResponse): TransformedData {
    const kpis: KPI[] = raw.kpis
        ? [
              {
                  label: 'Users',
                  value: fmtNumber(raw.kpis.totalUsers),
                  change: fmtPct(raw.kpis.changeUsers),
                  positive: raw.kpis.changeUsers >= 0,
              },
              {
                  label: 'Sessions',
                  value: fmtNumber(raw.kpis.totalSessions),
                  change: fmtPct(raw.kpis.changeSessions),
                  positive: raw.kpis.changeSessions >= 0,
              },
              {
                  label: 'Page Views',
                  value: fmtNumber(raw.kpis.totalPageViews),
                  change: fmtPct(raw.kpis.changePageViews),
                  positive: raw.kpis.changePageViews >= 0,
              },
              {
                  label: 'Bounce Rate',
                  value: `${raw.kpis.avgBounceRate}%`,
                  change: fmtPct(raw.kpis.changeBounceRate),
                  positive: raw.kpis.changeBounceRate <= 0,
              },
          ]
        : [];

    const trafficTrend: TrafficPoint[] = (raw.traffic || []).map((t) => ({
        date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: t.activeUsers,
        sessions: t.sessions,
        views: t.pageViews,
    }));

    const sources: SourceItem[] = (raw.sources || []).slice(0, 10).map((s) => ({
        source: s.source,
        sessions: s.sessions,
    }));

    const topPages: PageItem[] = (raw.pages || []).slice(0, 10).map((p) => ({
        page: p.page,
        views: p.views,
    }));

    const countries: CountryItem[] = (raw.countries || []).slice(0, 10).map((c) => ({
        country: c.country,
        users: c.users,
    }));

    return {
        kpis,
        trafficTrend,
        sources,
        topPages,
        countries,
        seo: raw.seo || null,
        seoError: raw.seoError || null,
    };
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

/* ─── Main Client Component ─── */
export default function SharedDashboardClient({
    token,
    config,
}: SharedDashboardClientProps) {
    const [range, setRange] = useState('30d');
    const [data, setData] = useState<TransformedData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = useCallback(() => {
        setLoading(true);
        setError(false);
        fetch(`/api/share/${token}/data?range=${range}`)
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((d: RawApiResponse) => {
                setData(transformData(d));
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [token, range]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            {/* Date Range Picker */}
            <div className="flex items-center gap-1.5">
                {RANGE_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => setRange(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            range === opt.value
                                ? 'bg-white/[0.12] text-white'
                                : 'bg-white/[0.04] text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-300'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-400 rounded-full animate-spin" />
                        <p className="text-xs text-zinc-500">Loading analytics data...</p>
                    </div>
                </div>
            )}

            {/* Error State */}
            {!loading && error && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                        <div>
                            <p className="text-sm font-medium text-amber-300">Analytics data is temporarily unavailable</p>
                            <p className="text-xs text-zinc-500 mt-1">
                                The dashboard owner&apos;s analytics connection may need to be refreshed. Please try again later.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Dashboard Data */}
            {!loading && !error && data && (
                <>
                    {/* KPI Cards */}
                    {config.traffic && data.kpis.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {data.kpis.map((kpi) => (
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
                    )}

                    {/* Traffic Trend Chart */}
                    {config.traffic && data.trafficTrend.length > 0 && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-4">Traffic Trend</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.trafficTrend}>
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
                                            tickFormatter={(v) => fmtCompact(v)}
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
                    {(config.sources || config.pages) && (
                        <div className={`grid gap-4 ${config.sources && config.pages ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                            {/* Traffic Sources */}
                            {config.sources && data.sources.length > 0 && (
                                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                                    <h3 className="text-sm font-semibold text-zinc-300 mb-3">Traffic Sources</h3>
                                    <div className="space-y-2">
                                        {data.sources.map((src, i) => {
                                            const maxSessions = Math.max(...data.sources.map((s) => s.sessions));
                                            const pct = maxSessions > 0 ? (src.sessions / maxSessions) * 100 : 0;
                                            return (
                                                <div key={i} className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-zinc-300 truncate">{src.source}</span>
                                                        <span className="text-xs text-zinc-500 font-mono">{fmtCompact(src.sessions)}</span>
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
                            {config.pages && data.topPages.length > 0 && (
                                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                                    <h3 className="text-sm font-semibold text-zinc-300 mb-3">Top Pages</h3>
                                    <div className="space-y-2">
                                        {data.topPages.map((pg, i) => {
                                            const maxViews = Math.max(...data.topPages.map((p) => p.views));
                                            const pct = maxViews > 0 ? (pg.views / maxViews) * 100 : 0;
                                            return (
                                                <div key={i} className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-zinc-300 truncate max-w-[70%]">{pg.page}</span>
                                                        <span className="text-xs text-zinc-500 font-mono">{fmtCompact(pg.views)}</span>
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

                    {/* Countries / Geo */}
                    {config.geo && data.countries.length > 0 && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Top Countries</h3>
                            <div className="space-y-2">
                                {data.countries.map((c, i) => {
                                    const maxUsers = Math.max(...data.countries.map((x) => x.users));
                                    const pct = maxUsers > 0 ? (c.users / maxUsers) * 100 : 0;
                                    return (
                                        <div key={i} className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-zinc-300 truncate">{c.country}</span>
                                                <span className="text-xs text-zinc-500 font-mono">{fmtCompact(c.users)} users</span>
                                            </div>
                                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-violet-400/40"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* SEO Performance Section */}
                    {config.seo && data.seo && data.seo.kpis && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-3">SEO Performance</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    {
                                        label: 'Total Clicks',
                                        value: fmtNumber(data.seo.kpis.totalClicks),
                                        change: `${data.seo.kpis.changeClicks >= 0 ? '+' : ''}${data.seo.kpis.changeClicks}%`,
                                        positive: data.seo.kpis.changeClicks >= 0,
                                    },
                                    {
                                        label: 'Impressions',
                                        value: fmtNumber(data.seo.kpis.totalImpressions),
                                        change: `${data.seo.kpis.changeImpressions >= 0 ? '+' : ''}${data.seo.kpis.changeImpressions}%`,
                                        positive: data.seo.kpis.changeImpressions >= 0,
                                    },
                                    {
                                        label: 'Avg. CTR',
                                        value: `${data.seo.kpis.avgCTR}%`,
                                        change: `${data.seo.kpis.changeCTR >= 0 ? '+' : ''}${data.seo.kpis.changeCTR}%`,
                                        positive: data.seo.kpis.changeCTR >= 0,
                                    },
                                    {
                                        label: 'Avg. Position',
                                        value: `${data.seo.kpis.avgPosition}`,
                                        change: `${data.seo.kpis.changePosition >= 0 ? '+' : ''}${data.seo.kpis.changePosition}`,
                                        positive: data.seo.kpis.changePosition <= 0,
                                    },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                                        <p className="text-[10px] text-zinc-500">{item.label}</p>
                                        <p className="text-lg font-bold text-zinc-100 font-mono">{item.value}</p>
                                        <p className={`text-[10px] ${item.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {item.change}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Top Queries */}
                            {data.seo.queries && data.seo.queries.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="text-xs font-medium text-zinc-400 mb-2">Top Queries</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-white/[0.06]">
                                                    <th className="text-left py-2 text-zinc-500 font-medium">Query</th>
                                                    <th className="text-right py-2 text-zinc-500 font-medium">Clicks</th>
                                                    <th className="text-right py-2 text-zinc-500 font-medium">Impressions</th>
                                                    <th className="text-right py-2 text-zinc-500 font-medium">CTR</th>
                                                    <th className="text-right py-2 text-zinc-500 font-medium">Position</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.seo.queries.slice(0, 10).map((q, i) => (
                                                    <tr key={i} className="border-b border-white/[0.04]">
                                                        <td className="py-2 text-zinc-300 truncate max-w-[200px]">{q.query}</td>
                                                        <td className="py-2 text-right text-zinc-400 font-mono">{fmtNumber(q.clicks)}</td>
                                                        <td className="py-2 text-right text-zinc-400 font-mono">{fmtNumber(q.impressions)}</td>
                                                        <td className="py-2 text-right text-zinc-400 font-mono">{q.ctr}%</td>
                                                        <td className="py-2 text-right text-zinc-400 font-mono">{q.position}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SEO error / unavailable state */}
                    {config.seo && !data.seo && data.seoError && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                            <h3 className="text-sm font-semibold text-zinc-300 mb-2">SEO Performance</h3>
                            <p className="text-xs text-zinc-500">{data.seoError}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
