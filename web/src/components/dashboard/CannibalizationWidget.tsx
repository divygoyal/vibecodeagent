'use client';

import { useState } from 'react';
import { Shuffle, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import FixWithBotButton from '@/components/FixWithBotButton';
import { useCannibalizationData } from '@/lib/useDashboardData';

interface CannibalizationWidgetProps {
    siteUrl: string;
}

const severityStyles: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
    medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    low: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
};

export default function CannibalizationWidget({ siteUrl }: CannibalizationWidgetProps) {
    const { data, isLoading, error } = useCannibalizationData(siteUrl || null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const cannibalized = data?.cannibalized || [];
    const highCount = cannibalized.filter(c => c.severity === 'high').length;
    const totalImpressionsAtRisk = cannibalized.reduce((s, c) => s + c.totalImpressions, 0);

    return (
        <div className="premium-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-500/5 border border-amber-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.1)]">
                        <Shuffle className="w-5 h-5 text-amber-300" />
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Quality</div>
                        <h4 className="text-sm sm:text-base font-semibold tracking-tight text-white">Cannibalization Scanner</h4>
                        <p className="text-[11px] text-zinc-500">Multiple pages competing for the same query</p>
                    </div>
                </div>
                {cannibalized.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium text-[10px]">
                            {highCount} high severity
                        </span>
                        <span className="text-zinc-500">{totalImpressionsAtRisk.toLocaleString()} impressions split</span>
                    </div>
                )}
            </div>

            {isLoading && !data ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 bg-white/[0.03] animate-pulse rounded-lg" />
                    ))}
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Couldn&apos;t load cannibalization data.
                </div>
            ) : cannibalized.length === 0 ? (
                <div className="text-xs text-emerald-400 py-3">No cannibalization issues detected. Each query has a clear winner page.</div>
            ) : (
                <div className="space-y-2">
                    {cannibalized.slice(0, 10).map((c) => {
                        const style = severityStyles[c.severity] || severityStyles.low;
                        const isOpen = expanded === c.query;
                        return (
                            <div key={c.query} className={`border ${style.border} rounded-lg overflow-hidden`}>
                                <button
                                    onClick={() => setExpanded(isOpen ? null : c.query)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition text-left"
                                >
                                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />}
                                    <span className="flex-1 text-sm text-zinc-300 font-medium truncate">{c.query}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${style.bg} ${style.text}`}>
                                        {c.severity}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 hidden sm:inline">{c.pages.length} pages</span>
                                    <span className="text-xs text-zinc-400 hidden md:inline">{c.totalImpressions.toLocaleString()} imp</span>
                                </button>
                                {isOpen && (
                                    <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-1.5 bg-black/20">
                                        {c.pages.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <span className="text-zinc-400 font-medium truncate flex-1">{p.page}</span>
                                                <span className="text-zinc-500">pos <span className="text-zinc-300 font-medium">{p.position.toFixed(1)}</span></span>
                                                <span className="text-zinc-500 hidden sm:inline">{p.clicks} clicks</span>
                                                <span className="text-zinc-500 hidden md:inline">{p.impressions.toLocaleString()} imp</span>
                                                <a href={p.page} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400">
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        ))}
                                        <div className="pt-2">
                                            <FixWithBotButton
                                                label="Get Fix Plan"
                                                size="sm"
                                                variant="ghost"
                                                context={`Resolve cannibalization on query "${c.query}". ${c.pages.length} pages compete: ${c.pages.map(p => `${p.page} (pos ${p.position.toFixed(1)}, ${p.clicks} clicks)`).join('; ')}. Recommend: consolidate, canonical, or differentiate intent.`}
                                                site={siteUrl}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
