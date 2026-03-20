'use client';
import React, { useState, useCallback } from 'react';
import { Users, Globe, Zap, Shield, Clock, ArrowRight, Loader2, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';

// ─── Types ───

interface AuditSummary {
    critical: number;
    warning: number;
    info: number;
    passed: number;
    total: number;
}

interface DomainData {
    domain: string;
    url: string;
    audit: {
        score: number;
        summary: AuditSummary;
        issues: Array<{ title: string; description: string; severity: string }>;
        responseTime: number;
    } | null;
    pagespeed: {
        performance: number;
        lcp: { value: number; unit: string };
        fcp: { value: number; unit: string };
    } | null;
    keywords: Array<{
        keyword: string;
        volume: number;
        difficulty: string;
        intent: string;
        contentType: string;
        reason: string;
    }>;
    technologies: string[];
}

interface ComparisonRow {
    label: string;
    icon: React.ElementType;
    valueA: number;
    valueB: number;
    lowerIsBetter?: boolean;
    format?: (v: number) => string;
}

// ─── Helpers ───

function getWinnerClass(a: number, b: number, lowerIsBetter = false): { classA: string; classB: string; winner: 'a' | 'b' | 'tie' } {
    if (a === b) return { classA: 'text-[var(--text-muted)]', classB: 'text-[var(--text-muted)]', winner: 'tie' };
    const aWins = lowerIsBetter ? a < b : a > b;
    return {
        classA: aWins ? 'text-emerald-400 font-bold' : 'text-red-400',
        classB: aWins ? 'text-red-400' : 'text-emerald-400 font-bold',
        winner: aWins ? 'a' : 'b',
    };
}

function TrendIcon({ winner, side }: { winner: 'a' | 'b' | 'tie'; side: 'a' | 'b' }) {
    if (winner === 'tie') return <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
    if (winner === side) return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
}

// ─── Shimmer Loading ───

function ShimmerCard() {
    return (
        <div className="glass-card rounded-2xl p-4 sm:p-6 space-y-4 animate-pulse">
            <div className="h-5 w-40 rounded bg-white/[0.06]" />
            <div className="space-y-3">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-10 rounded-lg bg-white/[0.04]" />
                ))}
            </div>
            <div className="h-4 w-32 rounded bg-white/[0.06]" />
            <div className="flex gap-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-6 w-20 rounded-full bg-white/[0.04]" />
                ))}
            </div>
        </div>
    );
}

// ─── Main Component ───

export default function CompetitorSpy() {
    const [domainA, setDomainA] = useState('');
    const [domainB, setDomainB] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultA, setResultA] = useState<DomainData | null>(null);
    const [resultB, setResultB] = useState<DomainData | null>(null);

    const handleCompare = useCallback(async () => {
        const a = domainA.trim();
        const b = domainB.trim();
        if (!a || !b) return;

        setLoading(true);
        setError(null);
        setResultA(null);
        setResultB(null);

        try {
            const [resA, resB] = await Promise.all([
                fetch('/api/domain-overview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: a }),
                }),
                fetch('/api/domain-overview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain: b }),
                }),
            ]);

            if (!resA.ok && !resB.ok) {
                setError('Failed to analyze both domains. Please check the URLs and try again.');
                setLoading(false);
                return;
            }

            if (!resA.ok) {
                setError(`Failed to analyze ${a}. Please check the URL.`);
                setLoading(false);
                return;
            }

            if (!resB.ok) {
                setError(`Failed to analyze ${b}. Please check the URL.`);
                setLoading(false);
                return;
            }

            const dataA: DomainData = await resA.json();
            const dataB: DomainData = await resB.json();

            setResultA(dataA);
            setResultB(dataB);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Comparison failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [domainA, domainB]);

    // Build comparison rows
    const comparisonRows: ComparisonRow[] = resultA && resultB ? [
        {
            label: 'SEO Health',
            icon: Shield,
            valueA: resultA.audit?.score ?? 0,
            valueB: resultB.audit?.score ?? 0,
            format: (v) => `${v}/100`,
        },
        {
            label: 'Performance',
            icon: Zap,
            valueA: resultA.pagespeed?.performance ?? 0,
            valueB: resultB.pagespeed?.performance ?? 0,
            format: (v) => `${Math.round(v)}/100`,
        },
        {
            label: 'Issues',
            icon: AlertTriangle,
            valueA: resultA.audit?.summary?.total ?? 0,
            valueB: resultB.audit?.summary?.total ?? 0,
            lowerIsBetter: true,
            format: (v) => `${v}`,
        },
        {
            label: 'Load Time',
            icon: Clock,
            valueA: resultA.audit?.responseTime ?? 0,
            valueB: resultB.audit?.responseTime ?? 0,
            lowerIsBetter: true,
            format: (v) => `${(v / 1000).toFixed(2)}s`,
        },
    ] : [];

    // Technology overlap
    const techA = new Set(resultA?.technologies ?? []);
    const techB = new Set(resultB?.technologies ?? []);
    const sharedTech = [...techA].filter(t => techB.has(t));
    const uniqueToA = [...techA].filter(t => !techB.has(t));
    const uniqueToB = [...techB].filter(t => !techA.has(t));

    // Keyword gap
    const keywordsA = new Set((resultA?.keywords ?? []).map(k => k.keyword.toLowerCase()));
    const keywordsB = new Set((resultB?.keywords ?? []).map(k => k.keyword.toLowerCase()));
    const allKeywords = [...new Set([...keywordsA, ...keywordsB])];
    const contentGap = allKeywords.filter(k => keywordsB.has(k) && !keywordsA.has(k));

    // Overall verdict
    let winsA = 0;
    let winsB = 0;
    for (const row of comparisonRows) {
        const { winner } = getWinnerClass(row.valueA, row.valueB, row.lowerIsBetter);
        if (winner === 'a') winsA++;
        else if (winner === 'b') winsB++;
    }
    const overallWinner = winsA > winsB ? 'a' : winsB > winsA ? 'b' : 'tie';

    return (
        <div className="premium-card rounded-2xl p-4 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/10">
                    <Users className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">Competitor Spy</h3>
                    <p className="text-xs text-[var(--text-muted)]">Side-by-side domain comparison</p>
                </div>
            </div>

            {/* Domain Inputs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 mb-4 sm:mb-6">
                <div className="flex-1">
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Your Domain</label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={domainA}
                            onChange={(e) => setDomainA(e.target.value)}
                            placeholder="yoursite.com"
                            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && handleCompare()}
                        />
                    </div>
                </div>

                <div className="flex items-center justify-center sm:pb-1">
                    <span className="text-xs font-bold text-[var(--text-muted)] tracking-widest">VS</span>
                </div>

                <div className="flex-1">
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">Competitor</label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={domainB}
                            onChange={(e) => setDomainB(e.target.value)}
                            placeholder="competitor.com"
                            className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/40 transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && handleCompare()}
                        />
                    </div>
                </div>

                <button
                    onClick={handleCompare}
                    disabled={loading || !domainA.trim() || !domainB.trim()}
                    className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/10"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Compare
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ShimmerCard />
                    <ShimmerCard />
                </div>
            )}

            {/* Empty State */}
            {!loading && !resultA && !resultB && !error && (
                <div className="text-center py-12">
                    <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-[var(--text-muted)]">Enter two domains to compare their SEO performance</p>
                </div>
            )}

            {/* Results */}
            {resultA && resultB && (
                <div className="space-y-6">
                    {/* Score Comparison */}
                    <div className="glass-card rounded-2xl p-4 sm:p-5">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Score Comparison</h4>

                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-3 px-2">
                            <p className="text-xs font-medium text-[var(--text-secondary)] truncate">{resultA.domain}</p>
                            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider w-24 text-center">Metric</span>
                            <p className="text-xs font-medium text-[var(--text-secondary)] truncate text-right">{resultB.domain}</p>
                        </div>

                        <div className="space-y-2">
                            {comparisonRows.map((row) => {
                                const { classA, classB, winner } = getWinnerClass(row.valueA, row.valueB, row.lowerIsBetter);
                                const fmt = row.format || ((v: number) => String(v));
                                const Icon = row.icon;
                                const userLoses = winner === 'b';

                                return (
                                    <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 table-row-premium rounded-xl px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <TrendIcon winner={winner} side="a" />
                                            <span className={`text-sm tabular-nums ${classA}`}>{fmt(row.valueA)}</span>
                                            {userLoses && (
                                                <FixWithBotButton
                                                    label="Improve"
                                                    size="sm"
                                                    variant="ghost"
                                                    context={`My domain ${resultA.domain} has a ${row.label} score of ${fmt(row.valueA)} while competitor ${resultB.domain} scores ${fmt(row.valueB)}. How can I improve my ${row.label.toLowerCase()}?`}
                                                />
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5 w-24 justify-center">
                                            <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                            <span className="text-[11px] text-[var(--text-muted)] font-medium">{row.label}</span>
                                        </div>

                                        <div className="flex items-center gap-2 justify-end">
                                            <span className={`text-sm tabular-nums ${classB}`}>{fmt(row.valueB)}</span>
                                            <TrendIcon winner={winner} side="b" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Technology Overlap */}
                    {(sharedTech.length > 0 || uniqueToA.length > 0 || uniqueToB.length > 0) && (
                        <div className="premium-card rounded-2xl p-4 sm:p-5">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Technology Stack</h4>

                            {sharedTech.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Shared Technologies</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {sharedTech.map(t => (
                                            <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {uniqueToA.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Unique to {resultA.domain}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {uniqueToA.map(t => (
                                                <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {uniqueToB.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">Unique to {resultB.domain}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {uniqueToB.map(t => (
                                                <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Keyword Gap */}
                    {allKeywords.length > 0 && (
                        <div className="premium-card rounded-2xl p-4 sm:p-5">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Keyword Gap Analysis</h4>

                            <div className="space-y-1.5 mb-4">
                                {allKeywords.map(keyword => {
                                    const hasA = keywordsA.has(keyword);
                                    const hasB = keywordsB.has(keyword);
                                    return (
                                        <div key={keyword} className="flex items-center justify-between table-row-premium rounded-lg px-3 py-2">
                                            <span className="text-sm text-[var(--text-primary)] truncate flex-1">{keyword}</span>
                                            <div className="flex items-center gap-3 shrink-0 ml-4">
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${hasA ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {resultA.domain.split('.')[0]}
                                                </span>
                                                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${hasB ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {resultB.domain.split('.')[0]}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {contentGap.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-medium text-amber-400 uppercase tracking-wider mb-2">Content Gap — Keywords you are missing</p>
                                    <div className="space-y-1.5">
                                        {contentGap.map(keyword => (
                                            <div key={keyword} className="flex items-center justify-between table-row-premium rounded-lg px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                    <span className="text-sm text-[var(--text-primary)]">{keyword}</span>
                                                </div>
                                                <FixWithBotButton
                                                    label={`Generate Content for '${keyword}'`}
                                                    size="sm"
                                                    variant="ghost"
                                                    context={`Generate an SEO-optimized content strategy and blog post outline targeting the keyword "${keyword}". My competitor ${resultB.domain} ranks for this keyword but my site ${resultA.domain} does not.`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Overall Verdict */}
                    <div className="premium-card rounded-2xl p-5">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Overall Verdict</h4>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${
                                overallWinner === 'a'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : overallWinner === 'b'
                                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
                            }`}>
                                {overallWinner === 'tie' ? (
                                    <>
                                        <Minus className="w-4 h-4" />
                                        It&apos;s a Tie
                                    </>
                                ) : (
                                    <>
                                        <TrendingUp className="w-4 h-4" />
                                        Winner: {overallWinner === 'a' ? resultA.domain : resultB.domain}
                                    </>
                                )}
                            </div>

                            <p className="text-sm text-[var(--text-secondary)]">
                                {overallWinner === 'tie'
                                    ? 'Both domains perform equally across all categories.'
                                    : `${overallWinner === 'a' ? resultA.domain : resultB.domain} leads in ${Math.max(winsA, winsB)} out of 4 categories.`
                                }
                            </p>
                        </div>

                        {overallWinner === 'b' && (
                            <div className="mt-4 pt-4 border-t border-[var(--border-primary)]">
                                <FixWithBotButton
                                    label="Get AI Recommendations"
                                    size="md"
                                    variant="solid"
                                    context={`Compare my domain ${resultA.domain} against competitor ${resultB.domain}. My scores: SEO Health ${resultA.audit?.score ?? 'N/A'}, Performance ${resultA.pagespeed?.performance ?? 'N/A'}, Issues ${resultA.audit?.summary?.total ?? 'N/A'}, Load Time ${resultA.audit?.responseTime ?? 'N/A'}ms. Competitor scores: SEO Health ${resultB.audit?.score ?? 'N/A'}, Performance ${resultB.pagespeed?.performance ?? 'N/A'}, Issues ${resultB.audit?.summary?.total ?? 'N/A'}, Load Time ${resultB.audit?.responseTime ?? 'N/A'}ms. My competitor leads in ${winsB} out of 4 categories. Provide a comprehensive action plan to beat them.`}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
