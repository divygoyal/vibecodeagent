'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    TrendingUp, TrendingDown, Search, MousePointer, Eye, Hash,
    AlertTriangle, CheckCircle2, Lightbulb, FileWarning, Shuffle,
    ArrowUpRight, Zap, Target, BookOpen, ChevronDown, Loader2, Download,
    Bot, PenTool, Link2, Sparkles, Brain, Radar, BarChart3, Globe,
    FileText, Layers, Activity, Shield, Clock, Cpu
} from 'lucide-react';
import { exportSeoData } from '@/lib/exportUtils';
import { useSeoData, useSiteList, useContainerStatus } from '@/lib/useDashboardData';
import { signIn } from 'next-auth/react';

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

export default function SEOPage() {
    // 0. Check Google connection (SEO plugins run locally, no container needed)
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();

    // 1. Fetch Sites (only when Google connected)
    const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
    const [selectedSite, setSelectedSite] = useState('');
    const [activeTab, setActiveTab] = useState<'queries' | 'pages'>('queries');

    // SEO Tools state
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [toolLoading, setToolLoading] = useState(false);
    const [toolResult, setToolResult] = useState<any>(null);
    // Schema tool
    const [schemaUrl, setSchemaUrl] = useState('');
    const [schemaType, setSchemaType] = useState('Article');
    // Blog tool
    const [blogTopic, setBlogTopic] = useState('');
    const [blogKeywords, setBlogKeywords] = useState('');
    // Keyword tool
    const [kwSiteUrl, setKwSiteUrl] = useState('');
    // Linking tool uses existing pages data

    const runTool = async (tool: string, input: any) => {
        setToolLoading(true);
        setToolResult(null);
        try {
            const res = await fetch('/api/seo-tools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, input }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setToolResult(data);
        } catch (err: any) {
            setToolResult({ error: err.message });
        } finally {
            setToolLoading(false);
        }
    };

    // Auto-select first site
    useEffect(() => {
        if (sites.length > 0 && !selectedSite) {
            setSelectedSite(sites[0].siteUrl);
        }
    }, [sites, selectedSite]);

    // 2. Fetch SEO Data (only when Google connected)
    const { data: seoData, isLoading, isError } = useSeoData('all', selectedSite, hasGoogleConnection);

    // Show connect prompt if Google not connected
    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <Search className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Connect Google to view SEO data</h2>
                <p className="text-sm text-zinc-400 text-center max-w-md">Sign in with your Google account to access Search Console data.</p>
                <button onClick={() => signIn('google')} className="px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm">
                    Connect Google
                </button>
            </div>
        );
    }

    if ((isLoading || containerLoading) && !seoData) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <span className="ml-3 text-zinc-400 text-sm">Loading SEO Data...</span>
            </div>
        );
    }

    if (isError && !seoData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-red-400 text-sm">Failed to load SEO data</p>
            </div>
        );
    }

    // Extract Data
    const kpis: SEOKPIs | null = seoData?.kpis || null;
    const queries: Query[] = Array.isArray(seoData?.queries) ? seoData.queries : [];
    const pages: SEOPage[] = Array.isArray(seoData?.pages) ? seoData.pages : [];
    const recommendations: Recommendation[] = Array.isArray(seoData?.recommendations) ? seoData.recommendations : [];
    const trend: TrendPoint[] = Array.isArray(seoData?.trend) ? seoData.trend : [];

    // Alias for UI replacement
    const loading = isLoading;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">SEO Intelligence</h1>
                    <p className="text-sm text-zinc-500 mt-1">Search Console data with AI-powered insights</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Export Button */}
                    <button
                        onClick={() => exportSeoData(seoData)}
                        disabled={!seoData}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export
                    </button>

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
                                        {s.siteUrl.replace('sc-domain:', '')}
                                    </option>
                                ))
                            )}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
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

            {/* ─── SEO Robot / AI SEO Bot ─── */}
            <div className="bg-gradient-to-br from-violet-500/[0.04] to-emerald-500/[0.04] border border-violet-500/[0.12] rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">SEO Robot</h3>
                        <p className="text-[11px] text-zinc-500">AI-powered SEO automation engine</p>
                    </div>
                    <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 font-semibold border border-violet-500/20">BETA</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* AI Blog Generation */}
                    <button onClick={() => { setActiveTool(activeTool === 'blog' ? null : 'blog'); setToolResult(null); }} className={`bg-white/[0.03] border rounded-xl p-4 text-left transition-all group cursor-pointer ${activeTool === 'blog' ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-white/[0.06] hover:border-emerald-500/20'}`}>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3 group-hover:bg-emerald-500/20 transition">
                            <PenTool className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">AI Blog Writer</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">Generate SEO-optimized blog posts with headings, meta tags, internal links, and schema markup.</p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <Sparkles className="w-3 h-3" /> {activeTool === 'blog' ? 'Active' : 'Click to use'}
                        </div>
                    </button>

                    {/* Auto Keyword Research */}
                    <button onClick={() => { setActiveTool(activeTool === 'keywords' ? null : 'keywords'); setToolResult(null); }} className={`bg-white/[0.03] border rounded-xl p-4 text-left transition-all group cursor-pointer ${activeTool === 'keywords' ? 'border-amber-500/30 bg-amber-500/[0.05]' : 'border-white/[0.06] hover:border-amber-500/20'}`}>
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-3 group-hover:bg-amber-500/20 transition">
                            <Brain className="w-4 h-4 text-amber-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">Auto Keyword Research</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">AI finds untapped keyword opportunities by analyzing competitors, search trends, and content gaps.</p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                            <Sparkles className="w-3 h-3" /> {activeTool === 'keywords' ? 'Active' : 'Click to use'}
                        </div>
                    </button>

                    {/* AI Internal Linking */}
                    <button onClick={() => { setActiveTool(activeTool === 'linking' ? null : 'linking'); setToolResult(null); }} className={`bg-white/[0.03] border rounded-xl p-4 text-left transition-all group cursor-pointer ${activeTool === 'linking' ? 'border-cyan-500/30 bg-cyan-500/[0.05]' : 'border-white/[0.06] hover:border-cyan-500/20'}`}>
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-3 group-hover:bg-cyan-500/20 transition">
                            <Link2 className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">AI Smart Linking</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">Discover and suggest internal links between your pages to build topical authority.</p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-cyan-400 font-medium">
                            <Sparkles className="w-3 h-3" /> {activeTool === 'linking' ? 'Active' : 'Click to use'}
                        </div>
                    </button>

                    {/* Schema Markup Generator */}
                    <button onClick={() => { setActiveTool(activeTool === 'schema' ? null : 'schema'); setToolResult(null); }} className={`bg-white/[0.03] border rounded-xl p-4 text-left transition-all group cursor-pointer ${activeTool === 'schema' ? 'border-violet-500/30 bg-violet-500/[0.05]' : 'border-white/[0.06] hover:border-violet-500/20'}`}>
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mb-3 group-hover:bg-violet-500/20 transition">
                            <FileText className="w-4 h-4 text-violet-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white mb-1">Schema Generator</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">Auto-generate JSON-LD structured data for FAQ, Article, Product, HowTo pages.</p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-violet-400 font-medium">
                            <Sparkles className="w-3 h-3" /> {activeTool === 'schema' ? 'Active' : 'Click to use'}
                        </div>
                    </button>
                </div>

                {/* ─── Active Tool Panel ─── */}
                {activeTool && (
                    <div className="mt-4 bg-white/[0.02] border border-white/[0.08] rounded-xl p-5">
                        {/* Blog Writer Panel */}
                        {activeTool === 'blog' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><PenTool className="w-4 h-4 text-emerald-400" /> AI Blog Writer</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input value={blogTopic} onChange={e => setBlogTopic(e.target.value)} placeholder="Blog topic (e.g. How to improve Core Web Vitals)" className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30" />
                                    <input value={blogKeywords} onChange={e => setBlogKeywords(e.target.value)} placeholder="Target keywords (comma separated)" className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30" />
                                </div>
                                <button onClick={() => runTool('blog', { topic: blogTopic, keywords: blogKeywords })} disabled={toolLoading || !blogTopic.trim()} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Generate Blog Post
                                </button>
                                {toolResult?.content && (
                                    <div className="bg-black/30 border border-white/[0.06] rounded-lg p-4 max-h-[400px] overflow-y-auto">
                                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">{toolResult.content}</pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Keyword Research Panel */}
                        {activeTool === 'keywords' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Brain className="w-4 h-4 text-amber-400" /> Auto Keyword Research</h4>
                                <div className="flex gap-3">
                                    <input value={kwSiteUrl} onChange={e => setKwSiteUrl(e.target.value)} placeholder="Your site URL (e.g. example.com)" className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/30" />
                                    <button onClick={() => runTool('keywords', { siteUrl: kwSiteUrl || selectedSite, currentKeywords: queries.slice(0, 5).map((q: any) => q.query).join(', ') })} disabled={toolLoading} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                        {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Find Keywords
                                    </button>
                                </div>
                                {toolResult?.keywords?.length > 0 && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-zinc-500 border-b border-white/[0.06]">
                                                    <th className="text-left pb-2 font-medium">Keyword</th>
                                                    <th className="text-right pb-2 font-medium">Volume</th>
                                                    <th className="text-right pb-2 font-medium">Difficulty</th>
                                                    <th className="text-right pb-2 font-medium hidden sm:table-cell">Intent</th>
                                                    <th className="text-right pb-2 font-medium hidden md:table-cell">Content Type</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {toolResult.keywords.map((kw: any, i: number) => (
                                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                                        <td className="py-2 text-zinc-300 font-medium">{kw.keyword}</td>
                                                        <td className="py-2 text-right text-zinc-400">{kw.volume?.toLocaleString()}</td>
                                                        <td className="py-2 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${kw.difficulty === 'Low' ? 'bg-emerald-500/10 text-emerald-400' : kw.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>{kw.difficulty}</span></td>
                                                        <td className="py-2 text-right text-zinc-500 hidden sm:table-cell">{kw.intent}</td>
                                                        <td className="py-2 text-right text-zinc-500 hidden md:table-cell">{kw.contentType}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Smart Linking Panel */}
                        {activeTool === 'linking' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Link2 className="w-4 h-4 text-cyan-400" /> AI Smart Linking</h4>
                                <p className="text-xs text-zinc-500">Analyzes your {pages.length} pages and suggests internal linking opportunities.</p>
                                <button onClick={() => runTool('linking', { pages: pages.map((p: any) => ({ page: p.page, title: p.page })) })} disabled={toolLoading || pages.length === 0} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Analyze Links
                                </button>
                                {toolResult?.links?.length > 0 && (
                                    <div className="space-y-2">
                                        {toolResult.links.map((link: any, i: number) => (
                                            <div key={i} className="bg-black/20 border border-white/[0.04] rounded-lg p-3">
                                                <div className="flex items-center gap-2 text-xs mb-1">
                                                    <span className="text-zinc-400 truncate">{link.source}</span>
                                                    <ArrowUpRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                                                    <span className="text-cyan-400 truncate">{link.target}</span>
                                                </div>
                                                <div className="text-[11px] text-zinc-500">Anchor: <span className="text-emerald-400 font-medium">&quot;{link.anchor}&quot;</span></div>
                                                <div className="text-[10px] text-zinc-600 mt-1">{link.reason}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Schema Generator Panel */}
                        {activeTool === 'schema' && (
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-violet-400" /> Schema Markup Generator</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <input value={schemaUrl} onChange={e => setSchemaUrl(e.target.value)} placeholder="Page URL" className="sm:col-span-2 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/30" />
                                    <select value={schemaType} onChange={e => setSchemaType(e.target.value)} className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
                                        {['Article', 'FAQ', 'Product', 'HowTo', 'WebPage', 'Organization', 'LocalBusiness', 'BreadcrumbList'].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <button onClick={() => runTool('schema', { pageUrl: schemaUrl, pageType: schemaType })} disabled={toolLoading} className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-2">
                                    {toolLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Generate Schema
                                </button>
                                {toolResult?.schema && (
                                    <div className="relative">
                                        <button onClick={() => { navigator.clipboard.writeText(toolResult.schema); }} className="absolute top-2 right-2 px-2 py-1 text-[10px] bg-white/[0.06] hover:bg-white/[0.1] rounded text-zinc-400 transition">Copy</button>
                                        <pre className="bg-black/30 border border-white/[0.06] rounded-lg p-4 max-h-[300px] overflow-y-auto text-xs text-violet-300 font-mono whitespace-pre-wrap">{toolResult.schema}</pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error display */}
                        {toolResult?.error && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg mt-3">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-xs text-red-400">{toolResult.error}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Deep SEO Intelligence Features ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Content Decay Detector */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-red-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Content Decay Detector</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Monitors your top-performing pages and alerts when traffic declines so you can refresh content before rankings drop.</p>
                    {pages.length > 0 ? (
                        <div className="space-y-1.5">
                            {pages.filter((p: any) => p.status === 'decay' || p.position > 15).slice(0, 3).map((p, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400 truncate max-w-[60%]">{p.page}</span>
                                    <span className="text-red-400 font-medium">pos {p.position.toFixed(1)}</span>
                                </div>
                            ))}
                            {pages.filter((p: any) => p.status === 'decay' || p.position > 15).length === 0 && (
                                <span className="text-[11px] text-emerald-400">No decaying content detected</span>
                            )}
                        </div>
                    ) : (
                        <span className="text-[11px] text-zinc-600">Connect Google to detect decaying content</span>
                    )}
                </div>

                {/* Keyword Cannibalization */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <Shuffle className="w-4 h-4 text-amber-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Cannibalization Scanner</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Detects when multiple pages compete for the same keywords, splitting ranking power.</p>
                    {queries.length > 0 ? (
                        <div className="space-y-1.5">
                            {queries.filter((q: any) => q.position > 8 && q.impressions > 100).slice(0, 3).map((q: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400 truncate max-w-[60%]">{q.query}</span>
                                    <span className="text-amber-400 font-medium">pos {q.position}</span>
                                </div>
                            ))}
                            {queries.filter((q: any) => q.position > 8 && q.impressions > 100).length === 0 && (
                                <span className="text-[11px] text-emerald-400">No cannibalization issues found</span>
                            )}
                        </div>
                    ) : (
                        <span className="text-[11px] text-zinc-600">Analyzed from your Search Console data</span>
                    )}
                </div>

                {/* Competitor Gap Analysis */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                            <Radar className="w-4 h-4 text-cyan-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Competitor Gap Analysis</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Keywords your competitors rank for that you don&apos;t. Use the Keyword Research tool above to discover gaps.</p>
                    {queries.length > 0 ? (
                        <div className="text-xs text-zinc-400">
                            <span className="text-emerald-400 font-bold">{queries.length}</span> keywords tracked.
                            <span className="text-amber-400 font-bold ml-2">{queries.filter((q: any) => q.position > 10).length}</span> outside top 10.
                        </div>
                    ) : (
                        <span className="text-[11px] text-zinc-600">Connect Google to analyze gaps</span>
                    )}
                </div>

                {/* Core Web Vitals Monitor */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Cpu className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Core Web Vitals</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Use the Audit tool to check LCP, FID, CLS for any page. Navigate to Audit from the sidebar.</p>
                    <a href="/dashboard/audit" className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 hover:underline"><ArrowUpRight className="w-3 h-3" /> Open Audit Tool</a>
                </div>

                {/* Daily Rank Tracker */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-pink-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Rank Tracking</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Your keyword positions from Search Console data. Updated with each data refresh.</p>
                    {queries.length > 0 ? (
                        <div className="space-y-1.5">
                            {queries.slice(0, 3).map((q: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-400 truncate max-w-[55%]">{q.query}</span>
                                    <span className={`font-medium ${q.position <= 5 ? 'text-emerald-400' : q.position <= 10 ? 'text-amber-400' : 'text-red-400'}`}>#{q.position}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-[11px] text-zinc-600">Connect Google to track rankings</span>
                    )}
                </div>

                {/* Programmatic SEO */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <Layers className="w-4 h-4 text-violet-400" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">Programmatic SEO</h4>
                    </div>
                    <p className="text-xs text-zinc-500 mb-3">Use the Blog Writer + Keyword Research tools above to generate content at scale for long-tail keywords.</p>
                    <span className="text-[11px] text-violet-400 font-medium flex items-center gap-1"><Sparkles className="w-3 h-3" /> Use tools above</span>
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

