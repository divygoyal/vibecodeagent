'use client';

import { useState, useEffect } from 'react';
import { Cpu, Loader2, Smartphone, Monitor, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

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
    error?: string;
}

interface CoreWebVitalsLiveProps {
    siteUrl: string;
    suggestedPages?: string[];
}

const ratingColors: Record<string, { text: string; bg: string }> = {
    good: { text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    'needs-improvement': { text: 'text-amber-400', bg: 'bg-amber-500/10' },
    poor: { text: 'text-red-400', bg: 'bg-red-500/10' },
};

function scoreColor(score: number): string {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
}

export default function CoreWebVitalsLive({ siteUrl, suggestedPages = [] }: CoreWebVitalsLiveProps) {
    const [url, setUrl] = useState('');
    const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<PsiResponse | null>(null);

    useEffect(() => {
        if (!url && suggestedPages.length > 0) {
            setUrl(suggestedPages[0]);
        }
    }, [suggestedPages, url]);

    const run = async (target: string, str: 'mobile' | 'desktop') => {
        if (!target.trim()) return;
        setLoading(true);
        setData(null);
        try {
            const res = await fetch('/api/seo/psi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: target, strategy: str }),
            });
            const body = await res.json();
            if (!res.ok) {
                setData({ ...body, error: body.error });
            } else {
                setData(body);
            }
        } catch (err) {
            setData({
                url: target,
                strategy: str,
                performanceScore: 0,
                seoScore: 0,
                accessibilityScore: 0,
                bestPracticesScore: 0,
                metrics: { lcp: null, cls: null, inp: null, fcp: null, ttfb: null },
                fieldData: { hasFieldData: false },
                opportunities: [],
                fetchedAt: new Date().toISOString(),
                error: err instanceof Error ? err.message : 'Failed',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="premium-card p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/15 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.12)]">
                    <Cpu className="w-5 h-5 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Performance</div>
                    <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">Core Web Vitals · Live</h4>
                    <p className="text-[11px] text-zinc-500">Lab + field data via PageSpeed Insights</p>
                </div>
                <div className="flex bg-white/[0.04] rounded-lg p-0.5 border border-white/[0.06]">
                    <button
                        onClick={() => setStrategy('mobile')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition ${strategy === 'mobile' ? 'bg-white/[0.1] text-white' : 'text-zinc-500'}`}
                    >
                        <Smartphone className="w-3 h-3" /> Mobile
                    </button>
                    <button
                        onClick={() => setStrategy('desktop')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md transition ${strategy === 'desktop' ? 'bg-white/[0.1] text-white' : 'text-zinc-500'}`}
                    >
                        <Monitor className="w-3 h-3" /> Desktop
                    </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://example.com/page"
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30"
                />
                <button
                    onClick={() => run(url, strategy)}
                    disabled={loading || !url.trim()}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2 justify-center"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Run
                </button>
            </div>

            {data?.error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {data.error}
                </div>
            )}

            {data && !data.error && (
                <div className="space-y-3">
                    {/* Lighthouse scores */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Performance', score: data.performanceScore },
                            { label: 'SEO', score: data.seoScore },
                            { label: 'Accessibility', score: data.accessibilityScore },
                            { label: 'Best Practices', score: data.bestPracticesScore },
                        ].map(s => (
                            <div key={s.label} className="bg-black/20 border border-white/[0.06] rounded-lg p-2 text-center">
                                <div className={`text-2xl font-bold ${scoreColor(s.score)} tabular-nums`}>{s.score}</div>
                                <div className="text-[10px] text-zinc-500">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* CWV metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(['lcp', 'cls', 'inp', 'fcp', 'ttfb'] as const).map(key => {
                            const m = data.metrics[key];
                            if (!m) return null;
                            const c = ratingColors[m.rating] || ratingColors.poor;
                            return (
                                <div key={key} className={`border border-white/[0.06] rounded-lg p-2.5 ${c.bg}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{m.label}</span>
                                        <span className={`text-[9px] uppercase font-bold ${c.text}`}>{m.rating.replace('-', ' ')}</span>
                                    </div>
                                    <div className={`text-base font-bold ${c.text} tabular-nums`}>{m.displayValue}</div>
                                </div>
                            );
                        })}
                    </div>

                    {data.fieldData.hasFieldData && (
                        <div className="text-[10px] text-zinc-500 italic">
                            Field data from real users (Chrome UX Report) — LCP {data.fieldData.lcpRating || '—'} · CLS {data.fieldData.clsRating || '—'} · INP {data.fieldData.inpRating || '—'}
                        </div>
                    )}

                    {/* Opportunities */}
                    {data.opportunities.length > 0 && (
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                            <div className="text-[10px] font-semibold text-white uppercase tracking-wide mb-2">Top opportunities</div>
                            <ul className="space-y-1">
                                {data.opportunities.slice(0, 5).map((o, i) => (
                                    <li key={i} className="text-[11px] text-zinc-400 flex items-center gap-2">
                                        <span className="text-emerald-400 flex-shrink-0">→</span>
                                        <span className="flex-1 truncate">{o.title}</span>
                                        {o.savingsMs && <span className="text-amber-400 tabular-nums flex-shrink-0">~{Math.round(o.savingsMs)}ms</span>}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-2 flex items-center gap-2">
                                <FixWithBotButton
                                    label="Get fix plan"
                                    size="sm"
                                    variant="ghost"
                                    context={`My page ${data.url} (${data.strategy}) scored ${data.performanceScore} on Performance. Top issues: ${data.opportunities.slice(0, 5).map(o => o.title).join('; ')}. How do I fix these?`}
                                    site={siteUrl}
                                />
                                <a
                                    href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(data.url)}&form_factor=${data.strategy}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-zinc-500 hover:text-emerald-400 inline-flex items-center gap-1"
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
