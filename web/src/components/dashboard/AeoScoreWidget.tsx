'use client';

import { useState } from 'react';
import { FileCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles, Globe, RefreshCw } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';
import { safeJson } from '@/lib/safeJson';

interface AeoBreakdown {
    label: string;
    points: number;
    max: number;
    pass: boolean;
    detail: string;
}

interface AeoScoreResult {
    url: string;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    breakdown: AeoBreakdown[];
    recommendations: string[];
    fetched: {
        statusCode: number;
        responseTime: number;
        wordCount: number;
        title: string;
    };
}

interface AeoScoreWidgetProps {
    siteUrl: string;
    suggestedPages?: string[];
}

const gradeColors: Record<string, { text: string; bg: string; ring: string }> = {
    A: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
    B: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20' },
    C: { text: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
    D: { text: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/20' },
    F: { text: 'text-red-400', bg: 'bg-red-500/10', ring: 'ring-red-500/20' },
};

export default function AeoScoreWidget({ siteUrl, suggestedPages = [] }: AeoScoreWidgetProps) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AeoScoreResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runScore = async (target: string) => {
        if (!target.trim()) return;
        setLoading(true);
        setResult(null);
        setError(null);
        try {
            const res = await fetch('/api/seo/aeo-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: target }),
            });
            const parsed = await safeJson<AeoScoreResult>(res);
            if (parsed.ok) {
                setResult(parsed.data);
            } else {
                setError(parsed.error);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error — please retry.');
        } finally {
            setLoading(false);
        }
    };

    const grade = result?.grade || 'F';
    const gc = gradeColors[grade] || gradeColors.F;
    const isIdle = !loading && !result && !error;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/[0.14] bg-[linear-gradient(135deg,rgba(52,211,153,0.06),rgba(34,211,238,0.04)_60%,transparent_95%)] p-5 sm:p-6">
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-emerald-500/[0.08] blur-3xl" />
            <div className="relative flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/15 border border-emerald-500/25 flex items-center justify-center shadow-[0_0_24px_rgba(52,211,153,0.18)]">
                    <FileCheck className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">AEO</div>
                    <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">AEO Score</h4>
                    <p className="text-[11px] text-zinc-500">How well your page is set up for AI Overviews</p>
                </div>
            </div>
            <div className="relative">

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="relative flex-1">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') runScore(url); }}
                        placeholder="https://example.com/page-to-score"
                        className="w-full bg-[#0a0d12] border border-white/[0.08] rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 hover:border-white/[0.16] focus:outline-none focus:border-emerald-500/40 focus:bg-emerald-500/[0.02] focus:shadow-[0_0_24px_rgba(52,211,153,0.08)] transition"
                    />
                </div>
                <button
                    onClick={() => runScore(url)}
                    disabled={loading || !url.trim()}
                    className="px-5 py-2.5 bg-gradient-to-br from-emerald-400 to-cyan-500 hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 text-black text-xs font-bold rounded-xl transition-all flex items-center gap-2 justify-center shadow-[0_8px_28px_rgba(52,211,153,0.25)] disabled:shadow-none"
                >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {loading ? 'Scoring…' : 'Score Page'}
                </button>
            </div>

            {suggestedPages.length > 0 && isIdle && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] text-zinc-500 mr-1 self-center">Top pages:</span>
                    {suggestedPages.slice(0, 4).map(p => (
                        <button
                            key={p}
                            onClick={() => { setUrl(p); runScore(p); }}
                            className="text-[10px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-zinc-300 hover:bg-emerald-500/[0.08] hover:border-emerald-500/25 hover:text-emerald-300 transition truncate max-w-[220px]"
                        >
                            {p.replace(/^https?:\/\//, '')}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <div className="relative overflow-hidden rounded-xl border border-red-500/20 bg-[linear-gradient(135deg,rgba(248,113,113,0.08),rgba(248,113,113,0.02))] p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-4 h-4 text-red-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300/80">Couldn&apos;t Score</div>
                            <p className="text-sm text-zinc-200 mt-0.5">{error}</p>
                            <button
                                onClick={() => runScore(url)}
                                disabled={loading}
                                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isIdle && (
                <div className="rounded-xl border border-dashed border-white/[0.08] bg-[#06090d] px-4 py-5 text-center">
                    <div className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/15 items-center justify-center mb-2">
                        <FileCheck className="w-5 h-5 text-emerald-300/80" />
                    </div>
                    <div className="text-xs text-zinc-300 font-medium">Score your page for AI Overviews</div>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-md mx-auto">
                        Get a 0–100 grade across 9 criteria — schema, lead-paragraph length, question-style H2s, freshness, E-E-A-T — plus actionable fixes.
                    </p>
                </div>
            )}

            {loading && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-14 w-14 rounded-xl bg-white/[0.04]" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-24 rounded bg-white/[0.04]" />
                            <div className="h-2 w-40 rounded bg-white/[0.03]" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="h-4 rounded bg-white/[0.03]" />
                        ))}
                    </div>
                </div>
            )}

            {result && (
                <div className="space-y-3 mt-3">
                    {/* Score badge */}
                    <div className="flex items-center gap-3 p-3 bg-black/20 border border-white/[0.06] rounded-xl">
                        <div className={`w-14 h-14 rounded-xl ring-2 ${gc.ring} ${gc.bg} flex items-center justify-center`}>
                            <span className={`text-2xl font-bold ${gc.text}`}>{grade}</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className={`text-2xl font-bold ${gc.text}`}>{result.score}</span>
                                <span className="text-xs text-zinc-500">/ 100</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">{result.fetched.title || 'Untitled page'}</div>
                            <div className="text-[10px] text-zinc-600">
                                {result.fetched.wordCount.toLocaleString()} words • {result.fetched.responseTime}ms
                            </div>
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-1.5">
                        {result.breakdown.map((b, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                {b.pass ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                ) : b.points > 0 ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                                )}
                                <span className="text-zinc-300 flex-1">{b.label}</span>
                                <span className="text-zinc-500 text-[10px] truncate max-w-[180px] hidden sm:inline">{b.detail}</span>
                                <span className={`font-medium tabular-nums ${b.pass ? 'text-emerald-400' : b.points > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                    {b.points}/{b.max}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Recommendations */}
                    {result.recommendations.length > 0 && (
                        <div className="bg-black/20 border border-white/[0.06] rounded-lg p-3">
                            <div className="text-[11px] font-semibold text-white mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-emerald-400" /> Recommendations
                            </div>
                            <ul className="space-y-1.5">
                                {result.recommendations.map((r, i) => (
                                    <li key={i} className="text-[11px] text-zinc-400 flex gap-1.5">
                                        <span className="text-emerald-400 flex-shrink-0">→</span>
                                        <span>{r}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-3">
                                <FixWithBotButton
                                    label="Fix with Bot"
                                    size="sm"
                                    variant="solid"
                                    context={`Improve AEO score for ${result.url} (current ${result.score}/100, grade ${result.grade}). Focus on: ${result.recommendations.slice(0, 3).join(' / ')}`}
                                    site={siteUrl}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            </div>
        </div>
    );
}
