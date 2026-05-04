'use client';

import { useState } from 'react';
import { FileCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

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
    error?: string;
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

    const runScore = async (target: string) => {
        if (!target.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch('/api/seo/aeo-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: target }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult({ ...data, error: data.error });
            } else {
                setResult(data);
            }
        } catch (err) {
            setResult({
                url: target,
                score: 0,
                grade: 'F',
                breakdown: [],
                recommendations: [],
                fetched: { statusCode: 0, responseTime: 0, wordCount: 0, title: '' },
                error: err instanceof Error ? err.message : 'Failed',
            });
        } finally {
            setLoading(false);
        }
    };

    const grade = result?.grade || 'F';
    const gc = gradeColors[grade] || gradeColors.F;

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
                <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://example.com/page-to-score"
                    className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/30"
                />
                <button
                    onClick={() => runScore(url)}
                    disabled={loading || !url.trim()}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition flex items-center gap-2 justify-center"
                >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Score Page
                </button>
            </div>

            {suggestedPages.length > 0 && !result && !loading && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-[10px] text-zinc-500 mr-1">Try:</span>
                    {suggestedPages.slice(0, 4).map(p => (
                        <button
                            key={p}
                            onClick={() => { setUrl(p); runScore(p); }}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white transition truncate max-w-[200px]"
                        >
                            {p.replace(/^https?:\/\//, '')}
                        </button>
                    ))}
                </div>
            )}

            {result?.error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.error}
                </div>
            )}

            {result && !result.error && (
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
