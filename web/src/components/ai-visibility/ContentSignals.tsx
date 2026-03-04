'use client';

import { CheckCircle2, X, Lightbulb } from 'lucide-react';

interface PageSignal {
    url: string;
    wordCount: number;
    geoScore: number;
    hasSchema: boolean;
    hasFaq: boolean;
    hasAuthor: boolean;
    externalLinks: number;
    quickWin: string | null;
}

function SignalTag({ label, active }: { label: string; active: boolean }) {
    return (
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
            active
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-zinc-500/10 text-zinc-600 border border-zinc-500/10'
        }`}>
            {active ? <span className="mr-0.5">&#10003;</span> : <span className="mr-0.5">&#10005;</span>}
            {label}
        </span>
    );
}

function GeoScoreBadge({ score }: { score: number }) {
    const color = score >= 70 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : score >= 40 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
        : 'text-red-400 bg-red-500/10 border-red-500/20';

    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${color}`}>
            GEO {score}
        </span>
    );
}

export default function ContentSignals({ pages }: { pages: PageSignal[] }) {
    if (!pages.length) return null;

    // Find the best quick win
    const quickWinPage = pages.find(p => p.quickWin);

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full flex flex-col">
            <div className="mb-4">
                <h2 className="text-sm font-bold text-white">Content Signals</h2>
                <p className="text-[10px] text-zinc-500 mt-0.5">Page-level optimization status</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1">
                {pages.map((ps, i) => {
                    let pathname: string;
                    try { pathname = new URL(ps.url).pathname || '/'; } catch { pathname = ps.url; }

                    return (
                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[200px]" title={ps.url}>
                                    {pathname}
                                </span>
                                <GeoScoreBadge score={ps.geoScore} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-[9px] text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                    {ps.wordCount.toLocaleString()} words
                                </span>
                                <SignalTag label="Schema" active={ps.hasSchema} />
                                <SignalTag label="FAQ" active={ps.hasFaq} />
                                <SignalTag label="Author" active={ps.hasAuthor} />
                                <span className="text-[9px] text-zinc-400 bg-white/[0.04] px-1.5 py-0.5 rounded">
                                    &#10003; {ps.externalLinks} ext links
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {quickWinPage?.quickWin && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-500/[0.06] border border-violet-500/10">
                        <Lightbulb className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-violet-300/80 leading-relaxed">
                            <span className="font-semibold text-violet-300">Quick win:</span> {quickWinPage.quickWin}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
