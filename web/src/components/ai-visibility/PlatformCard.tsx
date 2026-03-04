'use client';

import { MessageSquare, Search, Sparkles } from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import MiniSparkline from './MiniSparkline';

const PLATFORM_CONFIG: Record<string, { name: string; icon: typeof MessageSquare; color: string; borderColor: string; sparkColor: string }> = {
    chatgpt: { name: 'ChatGPT', icon: MessageSquare, color: 'text-emerald-400', borderColor: 'border-t-emerald-500', sparkColor: '#34d399' },
    perplexity: { name: 'Perplexity', icon: Search, color: 'text-blue-400', borderColor: 'border-t-blue-500', sparkColor: '#60a5fa' },
    googleAIO: { name: 'Google AIO', icon: Sparkles, color: 'text-amber-400', borderColor: 'border-t-amber-500', sparkColor: '#fbbf24' },
};

const LIKELIHOOD_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    high: { label: 'High Likelihood', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    medium: { label: 'Medium Likelihood', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    low: { label: 'Low Likelihood', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

interface PlatformData {
    likelihood: string;
    citationsFound: number;
    topCitedQuery: string;
    sparkline: number[];
}

interface PlatformCardsProps {
    platforms: Record<string, PlatformData>;
}

export default function PlatformCards({ platforms }: PlatformCardsProps) {
    return (
        <div className="grid grid-cols-3 gap-3 h-full">
            {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                const data = platforms[key] || { likelihood: 'low', citationsFound: 0, topCitedQuery: '', sparkline: [0, 0, 0, 0] };
                const style = LIKELIHOOD_STYLES[data.likelihood] || LIKELIHOOD_STYLES.low;
                const Icon = config.icon;

                return (
                    <div
                        key={key}
                        className={`rounded-xl border border-white/[0.08] border-t-2 ${config.borderColor} bg-white/[0.02] p-4 flex flex-col hover:bg-white/[0.04] transition-all`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Icon className={`w-4 h-4 ${config.color}`} />
                                <span className="text-xs font-semibold text-white">{config.name}</span>
                            </div>
                            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.color}`}>
                                {style.label}
                            </span>
                        </div>

                        <div className="flex items-end justify-between flex-1">
                            <div>
                                <span className="text-[9px] text-zinc-500 block mb-1">Citations Found</span>
                                <span className="text-2xl font-bold text-white">
                                    <AnimatedCounter value={data.citationsFound} />
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] text-zinc-500 block mb-1">Trend</span>
                                <MiniSparkline data={data.sparkline} color={config.sparkColor} width={64} height={28} />
                            </div>
                        </div>

                        {data.topCitedQuery && (
                            <div className="mt-3 pt-2 border-t border-white/[0.06]">
                                <span className="text-[9px] text-zinc-500">Top cited query: </span>
                                <span className="text-[10px] text-amber-400 font-medium">{data.topCitedQuery}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
