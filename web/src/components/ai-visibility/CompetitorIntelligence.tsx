'use client';

import { TrendingUp, TrendingDown, Minus, ExternalLink, AlertTriangle } from 'lucide-react';
import MiniSparkline from './MiniSparkline';

interface Competitor {
    domain: string;
    isYou: boolean;
    geoScore: number;
    citationsPerWeek: number;
    trend: 'up' | 'down' | 'flat';
}

interface CompetitorIntelligenceProps {
    competitors: Competitor[];
    gapAlert: string;
}

export default function CompetitorIntelligence({ competitors, gapAlert }: CompetitorIntelligenceProps) {
    if (!competitors.length) return null;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-bold text-white">Competitor Intelligence</h2>
                    <p className="text-[10px] text-zinc-500 mt-0.5">AI citation share comparison</p>
                </div>
                <button className="text-[10px] text-cyan-400 hover:text-cyan-300 transition">
                    View all <span className="ml-0.5">&rarr;</span>
                </button>
            </div>

            <div className="space-y-1 flex-1">
                {competitors.map((comp, i) => {
                    const TrendIcon = comp.trend === 'up' ? TrendingUp : comp.trend === 'down' ? TrendingDown : Minus;
                    const trendColor = comp.trend === 'up' ? 'text-emerald-400' : comp.trend === 'down' ? 'text-red-400' : 'text-zinc-500';

                    return (
                        <div
                            key={i}
                            className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition ${
                                comp.isYou ? 'bg-emerald-500/[0.04] border-l-2 border-emerald-500/30' : 'hover:bg-white/[0.02]'
                            } ${i < competitors.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                        >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[11px] text-zinc-300 font-medium truncate max-w-[120px]">
                                    {comp.domain}
                                </span>
                                {comp.isYou && (
                                    <span className="text-[8px] text-zinc-500 bg-white/[0.06] px-1.5 py-0.5 rounded">(you)</span>
                                )}
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                                <span className="text-xs font-bold text-white w-8 text-right">{comp.geoScore}</span>
                                <span className="text-[10px] text-zinc-400 w-12 text-right">{comp.citationsPerWeek}/wk</span>
                                <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {gapAlert && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/10">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-amber-300/80 leading-relaxed">
                            <span className="font-semibold text-amber-300">Gap alert:</span> {gapAlert}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
