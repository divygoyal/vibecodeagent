'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Plus, Star, AlertTriangle } from 'lucide-react';
import { useWinnersLosersData } from '@/lib/useDashboardData';
import FixWithBotButton from '@/components/FixWithBotButton';

interface WinnersLosersWidgetProps {
    siteUrl: string;
}

type Tab = 'winners' | 'losers' | 'new' | 'lost';

const tabConfig: Record<Tab, { label: string; icon: typeof TrendingUp; color: string }> = {
    winners: { label: 'Winners', icon: TrendingUp, color: 'emerald' },
    losers: { label: 'Losers', icon: TrendingDown, color: 'red' },
    new: { label: 'New', icon: Plus, color: 'blue' },
    lost: { label: 'Lost', icon: Star, color: 'purple' },
};

export default function WinnersLosersWidget({ siteUrl }: WinnersLosersWidgetProps) {
    const [tab, setTab] = useState<Tab>('winners');
    const { data, isLoading, error } = useWinnersLosersData(siteUrl || null);

    const rows = (data && data[tab]) ? data[tab] : [];
    const counts = data ? {
        winners: data.winners.length,
        losers: data.losers.length,
        new: data.new.length,
        lost: data.lost.length,
    } : { winners: 0, losers: 0, new: 0, lost: 0 };

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white">Winners &amp; Losers</h4>
                    <p className="text-[11px] text-zinc-500">Period-over-period query movement (28d vs prior 28d)</p>
                </div>
            </div>

            <div className="flex bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06] mb-3 w-full sm:w-fit">
                {(Object.keys(tabConfig) as Tab[]).map(k => {
                    const cfg = tabConfig[k];
                    const Icon = cfg.icon;
                    const colorClass = `text-${cfg.color}-400`;
                    return (
                        <button
                            key={k}
                            onClick={() => setTab(k)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition flex-1 sm:flex-initial justify-center ${
                                tab === k ? `bg-white/[0.08] ${colorClass}` : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                            {counts[k] > 0 && <span className="text-[10px] opacity-70">{counts[k]}</span>}
                        </button>
                    );
                })}
            </div>

            {isLoading && !data ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-9 bg-white/[0.03] animate-pulse rounded-lg" />
                    ))}
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    Couldn&apos;t load movement data.
                </div>
            ) : rows.length === 0 ? (
                <div className="text-xs text-zinc-500 py-3 text-center">
                    No queries qualify for the {tabConfig[tab].label.toLowerCase()} list yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-zinc-500 border-b border-white/[0.06]">
                                <th className="text-left pb-2 font-medium">Query</th>
                                <th className="text-right pb-2 font-medium">Clicks</th>
                                <th className="text-right pb-2 font-medium hidden sm:table-cell">Δ Clicks</th>
                                <th className="text-right pb-2 font-medium hidden md:table-cell">Position</th>
                                <th className="text-right pb-2 font-medium hidden md:table-cell">Δ Pos</th>
                                <th className="text-right pb-2 font-medium w-20">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => {
                                const clicksColor = r.clicksDelta > 0 ? 'text-emerald-400' : r.clicksDelta < 0 ? 'text-red-400' : 'text-zinc-400';
                                const posDelta = r.positionDelta;
                                const posColor = posDelta < 0 ? 'text-emerald-400' : posDelta > 0 ? 'text-red-400' : 'text-zinc-400';
                                return (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                        <td className="py-2 text-zinc-300 font-medium truncate max-w-[200px]">{r.query}</td>
                                        <td className="text-right py-2 text-zinc-300">{r.clicksCurrent.toLocaleString()}</td>
                                        <td className={`text-right py-2 font-medium hidden sm:table-cell ${clicksColor}`}>
                                            {r.clicksDelta > 0 ? '+' : ''}{r.clicksDelta} {r.clicksDeltaPct !== 0 && <span className="text-[10px] opacity-70">({r.clicksDeltaPct > 0 ? '+' : ''}{r.clicksDeltaPct}%)</span>}
                                        </td>
                                        <td className="text-right py-2 text-zinc-400 hidden md:table-cell">{r.positionCurrent || '—'}</td>
                                        <td className={`text-right py-2 font-medium hidden md:table-cell ${posColor}`}>
                                            {posDelta !== 0 ? `${posDelta > 0 ? '+' : ''}${posDelta}` : '—'}
                                        </td>
                                        <td className="text-right py-2">
                                            <FixWithBotButton
                                                label="Why?"
                                                size="sm"
                                                variant="ghost"
                                                context={`Query "${r.query}" — ${tab === 'winners' ? 'gained' : tab === 'losers' ? 'lost' : tab === 'new' ? 'newly ranking' : 'dropped out'}: clicks ${r.clicksPrevious}→${r.clicksCurrent}, position ${r.positionPrevious || '—'}→${r.positionCurrent || '—'}. Diagnose the cause and suggest next steps.`}
                                                site={siteUrl}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
