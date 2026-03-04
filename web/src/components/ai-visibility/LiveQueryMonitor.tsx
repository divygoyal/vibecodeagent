'use client';

import { MessageSquare, Search, Sparkles, ExternalLink } from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';

const PLATFORM_ICONS: Record<string, { icon: typeof MessageSquare; name: string; color: string; bg: string }> = {
    chatgpt: { icon: MessageSquare, name: 'ChatGPT', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    perplexity: { icon: Search, name: 'Perplexity', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    googleAIO: { icon: Sparkles, name: 'Google AI', color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

interface QueryItem {
    query: string;
    platform: string;
    status: 'cited' | 'missed';
    reason?: string;
    timeAgo: string;
}

interface QueryMonitorData {
    citationsThisWeek: number;
    missedOpportunities: number;
    citationRate: number;
    queries: QueryItem[];
}

export default function LiveQueryMonitor({ monitor }: { monitor: QueryMonitorData | null }) {
    if (!monitor) return null;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-bold text-white">Live Query Monitor</h2>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Real-time AI query tracking</p>
                </div>
                <button className="text-[10px] text-cyan-400 hover:text-cyan-300 transition">
                    See all queries <span className="ml-0.5">&rarr;</span>
                </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
                <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10 p-3 text-center">
                    <div className="text-xl font-bold text-emerald-400">
                        <AnimatedCounter value={monitor.citationsThisWeek} />
                    </div>
                    <span className="text-[9px] text-emerald-400/60">Citations this week</span>
                </div>
                <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/10 p-3 text-center">
                    <div className="text-xl font-bold text-amber-400">
                        <AnimatedCounter value={monitor.missedOpportunities} />
                    </div>
                    <span className="text-[9px] text-amber-400/60">Missed opportunities</span>
                </div>
                <div className="rounded-xl bg-cyan-500/[0.06] border border-cyan-500/10 p-3 text-center">
                    <div className="text-xl font-bold text-cyan-400">
                        <AnimatedCounter value={monitor.citationRate} />%
                    </div>
                    <span className="text-[9px] text-cyan-400/60">Citation rate</span>
                </div>
            </div>

            {/* Query Feed */}
            <div className="flex-1 space-y-1 overflow-y-auto max-h-[220px] pr-1">
                {monitor.queries.map((q, i) => {
                    const platform = PLATFORM_ICONS[q.platform] || PLATFORM_ICONS.chatgpt;
                    const PIcon = platform.icon;

                    return (
                        <div key={i} className="py-2 px-2 rounded-lg hover:bg-white/[0.02] transition border-b border-white/[0.04] last:border-0 group">
                            <div className="flex items-center gap-2.5">
                                <span className="text-[11px] text-zinc-300 flex-1 min-w-0 truncate">
                                    &ldquo;{q.query}&rdquo;
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${platform.bg}`}>
                                        <PIcon className={`w-2.5 h-2.5 ${platform.color}`} />
                                        <span className={`text-[8px] font-medium ${platform.color}`}>{platform.name}</span>
                                    </div>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        q.status === 'cited'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}>
                                        {q.status === 'cited' ? 'CITED' : 'MISSED'}
                                    </span>
                                    <span className="text-[9px] text-zinc-600 w-12 text-right">{q.timeAgo}</span>
                                </div>
                            </div>
                            {q.reason && (
                                <p className="text-[9px] text-zinc-600 mt-1 hidden group-hover:block">{q.reason}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
