'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Eye, Bot, Sparkles, Loader2, RefreshCw, Target,
    ArrowUpRight, FileText, Link2, Hash, Shield,
    MessageSquare, Search, Zap, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { useContainerStatus, useSiteList, useAIVisibility } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import { ConnectGoogleState } from '@/components/EmptyState';

const PLATFORM_CONFIG: Record<string, { name: string; icon: typeof Bot; color: string; bgColor: string }> = {
    chatgpt: { name: 'ChatGPT', icon: MessageSquare, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
    perplexity: { name: 'Perplexity', icon: Search, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    googleAIO: { name: 'Google AIO', icon: Sparkles, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
};

const LIKELIHOOD_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: 'High', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    medium: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    low: { label: 'Low', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

function GeoScoreGauge({ score }: { score: number }) {
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference * 0.75; // 270 degrees
    const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';

    return (
        <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="0 0 200 200" className="w-full h-full -rotate-[135deg]">
                {/* Background arc */}
                <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" />
                {/* Progress arc */}
                <circle cx="100" cy="100" r={radius} fill="none" stroke={color} strokeWidth="12"
                    strokeDasharray={`${progress} ${circumference - progress}`} strokeLinecap="round"
                    className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{score}</span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">GEO Score</span>
            </div>
        </div>
    );
}

export default function AIVisibilityPage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites } = useSiteList(hasGoogleConnection);
    const { selectedSite, setSelectedSite } = useRegistration();

    useEffect(() => {
        if (sites.length > 0 && !selectedSite) setSelectedSite(sites[0].siteUrl);
    }, [sites, selectedSite, setSelectedSite]);

    const { data, geoScore, isLoading, refresh } = useAIVisibility(selectedSite, hasGoogleConnection && !!selectedSite);

    if (!containerLoading && !hasGoogleConnection) {
        return <div className="min-h-[60vh] flex items-center justify-center"><ConnectGoogleState feature="AI visibility analysis and GEO tracking" /></div>;
    }

    const dimensions = data?.dimensions || [];
    const platforms = data?.platforms || {};
    const recommendations = data?.recommendations || [];
    const keywordVisibility = data?.keywordVisibility || [];
    const pageSignals = data?.pageSignals || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/20 flex items-center justify-center">
                        <Eye className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-white">AI Visibility</h1>
                        <p className="text-[11px] text-zinc-500">How likely AI platforms are to cite your content</p>
                    </div>
                </div>
                <button onClick={() => refresh()} disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:bg-white/[0.06] transition disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-400 mb-3" />
                    <p className="text-sm text-zinc-500">Analyzing your content for AI visibility...</p>
                    <p className="text-[10px] text-zinc-600 mt-1">This may take up to 30 seconds</p>
                </div>
            ) : (
                <>
                    {/* GEO Score Hero + Platform Likelihood */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 flex flex-col items-center justify-center">
                            <GeoScoreGauge score={geoScore || 0} />
                            <p className="text-[11px] text-zinc-500 mt-3 text-center max-w-[200px]">
                                {(geoScore || 0) >= 70 ? 'Strong AI visibility. Keep optimizing.' :
                                 (geoScore || 0) >= 40 ? 'Moderate visibility. Room for improvement.' :
                                 'Low AI visibility. Action needed.'}
                            </p>
                            {data?.source && (
                                <span className="mt-2 text-[9px] text-zinc-600 uppercase tracking-wider">
                                    Powered by {data.source === 'gemini' ? 'Gemini AI' : 'Content Analysis'}
                                </span>
                            )}
                        </div>

                        {/* Platform Likelihood */}
                        <div className="lg:col-span-2 grid grid-cols-3 gap-3">
                            {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                                const likelihood = platforms[key] || 'low';
                                const style = LIKELIHOOD_STYLES[likelihood];
                                const Icon = config.icon;
                                return (
                                    <div key={key} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col items-center text-center">
                                        <div className={`w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center mb-3`}>
                                            <Icon className={`w-5 h-5 ${config.color}`} />
                                        </div>
                                        <span className="text-xs font-semibold text-white mb-1">{config.name}</span>
                                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${style.bg} ${style.color}`}>
                                            {style.label} Likelihood
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Dimension Breakdown */}
                    {dimensions.length > 0 && (
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <h2 className="text-sm font-bold text-white mb-4">Dimension Breakdown</h2>
                            <div className="space-y-4">
                                {dimensions.map((dim: any) => {
                                    const color = dim.score >= 70 ? 'bg-emerald-400' : dim.score >= 40 ? 'bg-amber-400' : 'bg-red-400';
                                    return (
                                        <div key={dim.name}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xs font-medium text-zinc-300">{dim.name}</span>
                                                <span className="text-xs font-bold text-white">{dim.score}/100</span>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                <div className={`h-full rounded-full ${color} transition-all duration-700`}
                                                    style={{ width: `${dim.score}%` }} />
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-1">{dim.rationale}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Keyword Visibility + Recommendations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Keyword Visibility Table */}
                        {keywordVisibility.length > 0 && (
                            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                                <h2 className="text-sm font-bold text-white mb-3">Keyword AI Visibility</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="border-b border-white/[0.06]">
                                                <th className="text-left py-2 text-zinc-500 font-medium">Query</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">Pos</th>
                                                <th className="text-right py-2 text-zinc-500 font-medium">AI Citation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {keywordVisibility.slice(0, 15).map((kw: any, i: number) => {
                                                const style = LIKELIHOOD_STYLES[kw.aiCitationLikelihood || 'low'];
                                                return (
                                                    <tr key={i} className="border-b border-white/[0.04] last:border-0">
                                                        <td className="py-2 text-zinc-300 max-w-[200px] truncate">{kw.query}</td>
                                                        <td className="py-2 text-right text-zinc-400">{kw.position}</td>
                                                        <td className="py-2 text-right">
                                                            <span className={`text-[10px] font-semibold ${style.color}`}>{style.label}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Recommendations */}
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <h2 className="text-sm font-bold text-white mb-3">Recommendations</h2>
                            {recommendations.length > 0 ? (
                                <div className="space-y-2.5">
                                    {recommendations.slice(0, 8).map((rec: any, i: number) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                            <Zap className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-zinc-300 leading-relaxed">{rec.action}</p>
                                                <div className="flex gap-2 mt-1.5">
                                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                        rec.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        rec.impact === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-500/10 text-zinc-400'
                                                    }`}>{rec.impact} impact</span>
                                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                        rec.effort === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        rec.effort === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                                                    }`}>{rec.effort} effort</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {[
                                        { action: 'Add FAQ schema markup to your most visited pages', impact: 'high', effort: 'low' },
                                        { action: 'Include author attribution and publish dates on all content', impact: 'medium', effort: 'low' },
                                        { action: 'Add structured data (HowTo, Article) to key pages', impact: 'high', effort: 'medium' },
                                        { action: 'Create direct-answer content for your top queries', impact: 'high', effort: 'medium' },
                                        { action: 'Add external citations and references to build authority', impact: 'medium', effort: 'low' },
                                    ].map((rec, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                            <Zap className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] text-zinc-300 leading-relaxed">{rec.action}</p>
                                                <div className="flex gap-2 mt-1.5">
                                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                        rec.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                                    }`}>{rec.impact} impact</span>
                                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                                        rec.effort === 'low' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                                    }`}>{rec.effort} effort</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Content Signals */}
                    {pageSignals.length > 0 && (
                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                            <h2 className="text-sm font-bold text-white mb-3">Content Signals</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-white/[0.06]">
                                            <th className="text-left py-2 text-zinc-500 font-medium">Page</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Words</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Schema</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">FAQ</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Author</th>
                                            <th className="text-center py-2 text-zinc-500 font-medium">Ext Links</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageSignals.map((ps: any, i: number) => (
                                            <tr key={i} className="border-b border-white/[0.04] last:border-0">
                                                <td className="py-2 text-zinc-300 max-w-[250px] truncate" title={ps.url}>
                                                    {new URL(ps.url).pathname || '/'}
                                                </td>
                                                <td className="py-2 text-center text-zinc-400">{ps.wordCount.toLocaleString()}</td>
                                                <td className="py-2 text-center">
                                                    {ps.hasSchema ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center">
                                                    {ps.hasFaq ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center">
                                                    {ps.hasAuthor ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" /> : <AlertTriangle className="w-3.5 h-3.5 text-zinc-600 mx-auto" />}
                                                </td>
                                                <td className="py-2 text-center text-zinc-400">{ps.externalLinks}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
