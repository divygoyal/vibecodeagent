'use client';

import { useState, useEffect } from 'react';
import { Cpu, Loader2, Smartphone, Monitor, AlertTriangle, ExternalLink, Sparkles, Globe, Gauge, Zap, RefreshCw } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';
import { safeJson } from '@/lib/safeJson';

interface PsiMetric {
    label: string;
    value: number;
    displayValue: string;
    score: number;
    rating: 'good' | 'needs-improvement' | 'poor';
}

interface PsiResponse {
    url: string;
    strategy: 'mobile' | 'desktop';
    performanceScore: number;
    seoScore: number;
    accessibilityScore: number;
    bestPracticesScore: number;
    metrics: {
        lcp: PsiMetric | null;
        cls: PsiMetric | null;
        inp: PsiMetric | null;
        fcp: PsiMetric | null;
        ttfb: PsiMetric | null;
    };
    fieldData: {
        hasFieldData: boolean;
        lcpRating?: string;
        clsRating?: string;
        inpRating?: string;
    };
    opportunities: Array<{ id: string; title: string; savingsMs?: number }>;
    fetchedAt: string;
}

interface CoreWebVitalsLiveProps {
    siteUrl: string;
    suggestedPages?: string[];
}

const ratingStyles: Record<string, { text: string; bg: string; border: string; glow: string }> = {
    good: { text: 'text-emerald-300', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/25', glow: 'shadow-[0_0_24px_rgba(52,211,153,0.12)]' },
    'needs-improvement': { text: 'text-amber-300', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/25', glow: 'shadow-[0_0_24px_rgba(251,191,36,0.12)]' },
    poor: { text: 'text-red-300', bg: 'bg-red-500/[0.08]', border: 'border-red-500/25', glow: 'shadow-[0_0_24px_rgba(248,113,113,0.12)]' },
};

function scoreColor(score: number): string {
    if (score >= 90) return 'text-emerald-300';
    if (score >= 50) return 'text-amber-300';
    return 'text-red-300';
}

function scoreRing(score: number): string {
    if (score >= 90) return 'ring-emerald-500/30 bg-emerald-500/[0.08]';
    if (score >= 50) return 'ring-amber-500/30 bg-amber-500/[0.08]';
    return 'ring-red-500/30 bg-red-500/[0.08]';
}

export default function CoreWebVitalsLive({ siteUrl, suggestedPages = [] }: CoreWebVitalsLiveProps) {
    const [url, setUrl] = useState('');
    const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<PsiResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!url && suggestedPages.length > 0) {
            setUrl(suggestedPages[0]);
        }
    }, [suggestedPages, url]);

    const run = async (target: string, str: 'mobile' | 'desktop') => {
        if (!target.trim()) return;
        setLoading(true);
        setData(null);
        setError(null);
        try {
            const res = await fetch('/api/seo/psi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: target, strategy: str }),
            });
            const result = await safeJson<PsiResponse>(res);
            if (result.ok) {
                setData(result.data);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error — please retry.');
        } finally {
            setLoading(false);
        }
    };

    const hasResult = !!data;
    const hasError = !!error;
    const isIdle = !loading && !hasResult && !hasError;

    return (
        <div className="premium-card p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.12)]">
                    <Cpu className="w-5 h-5 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Performance</div>
                    <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">Core Web Vitals · Live</h4>
                    <p className="text-[11px] text-zinc-500">Lab + field data via PageSpeed Insights · 25 000 free runs/day</p>
                </div>
                <div className="flex bg-[#0a0d12] rounded-xl p-1 border border-white/[0.08] gap-1">
                    {(['mobile', 'desktop'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStrategy(s)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                                strategy === s
                                    ? 'bg-emerald-500/[0.08] border-emerald-500/30 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.15)]'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                            }`}
                        >
                            {s === 'mobile' ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                            <span className="capitalize">{s}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Input + Run row */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="relative flex-1">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') run(url, strategy); }}
                        placeholder="https://example.com/page"
                        className="w-full bg-[#0a0d12] border border-white/[0.08] rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 hover:border-white/[0.16] focus:outline-none focus:border-emerald-500/40 focus:bg-emerald-500/[0.02] focus:shadow-[0_0_24px_rgba(52,211,153,0.08)] transition"
                    />
                </div>
                <button
                    onClick={() => run(url, strategy)}
                    disabled={loading || !url.trim()}
                    className="px-5 py-2.5 bg-gradient-to-br from-emerald-400 to-cyan-500 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-black text-xs font-bold rounded-xl transition-all flex items-center gap-2 justify-center shadow-[0_8px_28px_rgba(52,211,153,0.25)] disabled:shadow-none"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {loading ? 'Auditing…' : 'Run Audit'}
                </button>
            </div>

            {suggestedPages.length > 0 && isIdle && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className="text-[10px] text-zinc-500 mr-1 self-center">Top pages:</span>
                    {suggestedPages.slice(0, 4).map(p => (
                        <button
                            key={p}
                            onClick={() => { setUrl(p); run(p, strategy); }}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-300 hover:bg-emerald-500/[0.08] hover:border-emerald-500/25 hover:text-emerald-300 transition truncate max-w-[220px]"
                        >
                            {p.replace(/^https?:\/\//, '')}
                        </button>
                    ))}
                </div>
            )}

            {/* Error state */}
            {hasError && (
                <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-[linear-gradient(135deg,rgba(248,113,113,0.08),rgba(248,113,113,0.02))] p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-red-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300/80">Audit Failed</div>
                            <p className="text-sm text-zinc-200 mt-0.5">{error}</p>
                            <button
                                onClick={() => run(url, strategy)}
                                disabled={loading}
                                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 h-[88px] animate-pulse" />
                        ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 h-[68px] animate-pulse" />
                        ))}
                    </div>
                </div>
            )}

            {/* Idle preview state */}
            {isIdle && (
                <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#06090d] px-4 py-5 text-center">
                    <div className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/15 items-center justify-center mb-2">
                        <Gauge className="w-5 h-5 text-emerald-300/80" />
                    </div>
                    <div className="text-xs text-zinc-300 font-medium">Run your first audit</div>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-md mx-auto">
                        You&apos;ll see Lighthouse scores (Performance, SEO, Accessibility, Best Practices), Core Web Vitals (LCP, CLS, INP) plus real-user CrUX field data for the URL you enter.
                    </p>
                </div>
            )}

            {/* Result */}
            {hasResult && data && (
                <div className="space-y-3">
                    {/* Lighthouse scores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { label: 'Performance', score: data.performanceScore },
                            { label: 'SEO', score: data.seoScore },
                            { label: 'Accessibility', score: data.accessibilityScore },
                            { label: 'Best Practices', score: data.bestPracticesScore },
                        ].map(s => (
                            <div key={s.label} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#06090d] p-3 text-center">
                                <div className={`mx-auto mb-1.5 h-12 w-12 rounded-full ring-2 ${scoreRing(s.score)} flex items-center justify-center`}>
                                    <div className={`text-lg font-bold tabular-nums ${scoreColor(s.score)}`}>{s.score}</div>
                                </div>
                                <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* CWV metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(['lcp', 'cls', 'inp', 'fcp', 'ttfb'] as const).map(key => {
                            const m = data.metrics[key];
                            if (!m) return null;
                            const c = ratingStyles[m.rating] || ratingStyles.poor;
                            return (
                                <div key={key} className={`relative overflow-hidden rounded-xl border ${c.border} ${c.bg} ${c.glow} p-3`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{m.label}</span>
                                        <span className={`text-[9px] uppercase font-bold ${c.text} tracking-wider`}>{m.rating === 'needs-improvement' ? 'Improve' : m.rating}</span>
                                    </div>
                                    <div className={`text-lg font-bold ${c.text} tabular-nums`}>{m.displayValue}</div>
                                </div>
                            );
                        })}
                    </div>

                    {data.fieldData.hasFieldData && (
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
                            <Zap className="w-3 h-3 text-cyan-400" />
                            <span>
                                <span className="text-zinc-300 font-medium">Real-user data</span> from Chrome UX Report — LCP {data.fieldData.lcpRating || '—'} · CLS {data.fieldData.clsRating || '—'} · INP {data.fieldData.inpRating || '—'}
                            </span>
                        </div>
                    )}

                    {/* Opportunities */}
                    {data.opportunities.length > 0 && (
                        <div className="rounded-xl border border-white/[0.06] bg-[#06090d] p-4">
                            <div className="flex items-center gap-2 mb-2.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Top Opportunities</div>
                            </div>
                            <ul className="space-y-1.5">
                                {data.opportunities.slice(0, 5).map((o, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs">
                                        <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                        <span className="flex-1 text-zinc-300 truncate">{o.title}</span>
                                        {o.savingsMs && (
                                            <span className="text-[10px] tabular-nums text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 font-semibold flex-shrink-0">
                                                ~{Math.round(o.savingsMs)}ms
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                                <FixWithBotButton
                                    label="Get fix plan"
                                    size="sm"
                                    variant="solid"
                                    context={`My page ${data.url} (${data.strategy}) scored ${data.performanceScore} on Performance. Top issues: ${data.opportunities.slice(0, 5).map(o => o.title).join('; ')}. How do I fix these?`}
                                    site={siteUrl}
                                />
                                <a
                                    href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(data.url)}&form_factor=${data.strategy}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-zinc-500 hover:text-emerald-300 inline-flex items-center gap-1"
                                >
                                    Full PSI report <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
