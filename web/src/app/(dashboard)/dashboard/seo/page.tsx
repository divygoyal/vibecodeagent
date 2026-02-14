'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Search, MousePointer, Eye, Hash,
    AlertTriangle, CheckCircle2, Lightbulb, FileWarning, Shuffle,
    ArrowUpRight, RefreshCcw, Loader2, Zap, Target, BookOpen, ChevronDown
} from 'lucide-react';

interface SEOKPIs {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    indexedPages: number;
    crawlErrors: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
}

interface Query {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface SEOPage {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    status: string;
}

interface Recommendation {
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    action: string;
    impact: string;
    page: string | null;
}

interface TrendPoint {
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface Site {
    siteUrl: string;
    permissionLevel: string;
}

function ChangeIndicator({ value, suffix = '%', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
    const positive = invert ? value <= 0 : value >= 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {value >= 0 ? '+' : ''}{value}{suffix}
        </span>
    );
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-zinc-900 border border-white/[0.1] rounded-lg px-3 py-2 shadow-xl">
            <p className="text-xs text-zinc-400 mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} className="text-sm font-medium" style={{ color: entry.color }}>
                    {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                </p>
            ))}
        </div>
    );
};

const severityConfig: Record<string, { bg: string; border: string; icon: any; badge: string }> = {
    high: { bg: 'bg-red-500/5', border: 'border-red-500/20', icon: AlertTriangle, badge: 'bg-red-500/10 text-red-400' },
    medium: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', icon: FileWarning, badge: 'bg-amber-500/10 text-amber-400' },
    low: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', icon: Lightbulb, badge: 'bg-blue-500/10 text-blue-400' },
};

const typeIcons: Record<string, any> = {
    content_decay: BookOpen,
    keyword_gap: Target,
    technical: Zap,
    cannibalization: Shuffle,
    opportunity: CheckCircle2,
};

export default function SEOPage() {
    const [kpis, setKpis] = useState<SEOKPIs | null>(null);
    const [queries, setQueries] = useState<Query[]>([]);
    const [pages, setPages] = useState<SEOPage[]>([]);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'queries' | 'pages'>('queries');

    // Site selector state
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState('');
    const [sitesLoading, setSitesLoading] = useState(true);

    // Initial load: Fetch Sites
    useEffect(() => {
        async function loadSites() {
            setSitesLoading(true);
            try {
                const res = await fetch('/api/seo/sites');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setSites(data);
                        if (data.length > 0) {
                            setSelectedSite(data[0].siteUrl);
                        }
                    } else {
                        console.error("Sites API returned non-array:", data);
                        setSites([]);
                    }
                } else {
                    console.warn("Failed to load sites list");
                }
            } catch (e) {
                console.error("Error loading sites:", e);
            } finally {
                setSitesLoading(false);
            }
        }
        loadSites();
    }, []);

    const fetchData = async () => {
        if (sitesLoading) return;

        setLoading(true);
        setError('');
        try {
            let url = `/api/seo?section=all`;
            if (selectedSite) {
                url += `&siteUrl=${encodeURIComponent(selectedSite)}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch SEO data');
            const data = await res.json();

            setKpis(data.kpis || null);
            setQueries(Array.isArray(data.queries) ? data.queries : []);
            setPages(Array.isArray(data.pages) ? data.pages : []);
            setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
            setTrend(Array.isArray(data.trend) ? data.trend : []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Trigger fetch on site selection change
    useEffect(() => {
        if (!sitesLoading) {
            fetchData();
        }
    }, [selectedSite, sitesLoading]);

    if (loading && !kpis) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <span className="ml-3 text-zinc-400 text-sm">Loading SEO Data...</span>
            </div>
        );
    }

    if (error && !kpis) {
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">SEO Intelligence</h1>
                    <p className="text-sm text-zinc-500 mt-1">Search Console data with AI-powered insights</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Site Selector */}
                    <div className="relative">
                        <select
                            value={selectedSite}
                            onChange={(e) => setSelectedSite(e.target.value)}
                            disabled={sitesLoading || sites.length === 0}
                            className="appearance-none bg-zinc-900 border border-white/[0.1] rounded-lg pl-3 pr-8 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition min-w-[200px]"
                        >
                            {sitesLoading ? (
                                <option>Loading sites...</option>
                            ) : sites.length === 0 ? (
                                <option value="">No sites found</option>
                            ) : (
                                sites.map(s => (
                                    <option key={s.siteUrl} value={s.siteUrl}>
                                        {s.siteUrl}
                                    </option>
                                ))
                            )}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>

                    <button onClick={fetchData} className="p-2 bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition" title="Refresh Data">
                        <RefreshCcw className={`w-4 h-4 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            {kpis && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                                <MousePointer className="w-4 h-4 text-emerald-400" />
                            </div>
                            <ChangeIndicator value={kpis.changeClicks} />
                        </div>
                        <div className="text-2xl font-bold text-white">{kpis.totalClicks.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500 mt-1">Total Clicks</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-cyan-400/10 flex items-center justify-center">
                                <Eye className="w-4 h-4 text-cyan-400" />
                            </div>
                            <ChangeIndicator value={kpis.changeImpressions} />
                        </div>
                        <div className="text-2xl font-bold text-white">{kpis.totalImpressions.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500 mt-1">Impressions</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-400/10 flex items-center justify-center">
                                <Hash className="w-4 h-4 text-violet-400" />
                            </div>
                            <ChangeIndicator value={kpis.changeCTR} />
                        </div>
                        <div className="text-2xl font-bold text-white">{kpis.avgCTR}%</div>
                        <div className="text-xs text-zinc-500 mt-1">Avg. CTR</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center">
                                <Search className="w-4 h-4 text-amber-400" />
                            </div>
                            <ChangeIndicator value={kpis.changePosition} invert />
                        </div>
                        <div className="text-2xl font-bold text-white">{kpis.avgPosition}</div>
                        <div className="text-xs text-zinc-500 mt-1">Avg. Position</div>
                    </div>
                </div>
            )}

            {/* AI Recommendations */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-black" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">AI Recommendations</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-medium">
                        {recommendations.length} items
                    </span>
                </div>
                <div className="space-y-3">
                    {recommendations.map(rec => {
                        const config = severityConfig[rec.severity] || severityConfig.low;
                        const TypeIcon = typeIcons[rec.type] || Lightbulb;
                        return (
                            <div key={rec.id} className={`${config.bg} border ${config.border} rounded-xl p-4 hover:bg-opacity-10 transition`}>
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">
                                        <TypeIcon className="w-4 h-4 text-zinc-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <h4 className="text-sm font-semibold text-white">{rec.title}</h4>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.badge}`}>
                                                {rec.severity}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-zinc-400 font-medium">
                                                {rec.impact}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-400 mb-2">{rec.description}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-emerald-400 font-medium">→ {rec.action}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Search Trend Chart */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Search Performance Trend</h3>
                <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                            <defs>
                                <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradImp" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(v) => v.slice(5)} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#71717a' }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke="#34d399" fill="url(#gradClicks)" strokeWidth={2} />
                            <Area yAxisId="right" type="monotone" dataKey="impressions" name="Impressions" stroke="#a78bfa" fill="url(#gradImp)" strokeWidth={1.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Queries / Pages Tab */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center gap-1 mb-4 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5 w-fit">
                    <button
                        onClick={() => setActiveTab('queries')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${activeTab === 'queries' ? 'bg-emerald-400/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Top Queries
                    </button>
                    <button
                        onClick={() => setActiveTab('pages')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${activeTab === 'pages' ? 'bg-emerald-400/10 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Top Pages
                    </button>
                </div>

                <div className="overflow-x-auto">
                    {activeTab === 'queries' && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                    <th className="text-left pb-3 font-medium">Query</th>
                                    <th className="text-right pb-3 font-medium">Clicks</th>
                                    <th className="text-right pb-3 font-medium">Impressions</th>
                                    <th className="text-right pb-3 font-medium hidden sm:table-cell">CTR</th>
                                    <th className="text-right pb-3 font-medium hidden md:table-cell">Position</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queries.map((q, i) => (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                                        <td className="py-3">
                                            <span className="text-zinc-300 font-medium">{q.query}</span>
                                        </td>
                                        <td className="text-right text-emerald-400 font-semibold">{q.clicks.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400">{q.impressions.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400 hidden sm:table-cell">{q.ctr}%</td>
                                        <td className="text-right hidden md:table-cell">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${q.position <= 5 ? 'bg-emerald-400/10 text-emerald-400' : q.position <= 10 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                                {q.position.toFixed(1)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'pages' && (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                    <th className="text-left pb-3 font-medium">Page</th>
                                    <th className="text-right pb-3 font-medium">Clicks</th>
                                    <th className="text-right pb-3 font-medium hidden sm:table-cell">CTR</th>
                                    <th className="text-right pb-3 font-medium hidden md:table-cell">Position</th>
                                    <th className="text-right pb-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pages.map((p, i) => (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-zinc-300 font-medium truncate max-w-[240px]">{p.page}</span>
                                                <ArrowUpRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                                            </div>
                                        </td>
                                        <td className="text-right text-emerald-400 font-semibold">{p.clicks.toLocaleString()}</td>
                                        <td className="text-right text-zinc-400 hidden sm:table-cell">{p.ctr}%</td>
                                        <td className="text-right hidden md:table-cell">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.position <= 5 ? 'bg-emerald-400/10 text-emerald-400' : p.position <= 10 ? 'bg-amber-400/10 text-amber-400' : 'bg-red-400/10 text-red-400'}`}>
                                                {p.position.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.status === 'healthy' ? 'bg-emerald-400/10 text-emerald-400' :
                                                p.status === 'warning' ? 'bg-amber-400/10 text-amber-400' :
                                                    'bg-red-400/10 text-red-400'
                                                }`}>
                                                {p.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

