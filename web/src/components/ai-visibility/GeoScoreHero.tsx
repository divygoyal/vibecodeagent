'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, BarChart3, Users, Quote } from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import MiniSparkline from './MiniSparkline';

interface TrendData {
    change: number;
    direction: 'up' | 'down' | 'flat';
    sparkline: number[];
    industryAvg: number;
    topCompetitorScore: number;
    citationsPerWeek: number;
    citationsChange: number;
}

interface GeoScoreHeroProps {
    score: number;
    trend: TrendData | null;
}

function GeoScoreGauge({ score }: { score: number }) {
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference * 0.75;
    const color = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';

    return (
        <div className="relative w-40 h-40">
            <svg viewBox="0 0 180 180" className="w-full h-full -rotate-[135deg]">
                <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" />
                <motion.circle
                    cx="90" cy="90" r={radius} fill="none" stroke={color} strokeWidth="10"
                    strokeLinecap="round"
                    initial={{ strokeDasharray: `0 ${circumference}` }}
                    animate={{ strokeDasharray: `${progress} ${circumference - progress}` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-white">{score}</span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mt-0.5">GEO Score</span>
            </div>
        </div>
    );
}

export default function GeoScoreHero({ score, trend }: GeoScoreHeroProps) {
    const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;
    const trendColor = trend?.direction === 'up' ? 'text-emerald-400' : trend?.direction === 'down' ? 'text-red-400' : 'text-zinc-400';
    const trendBg = trend?.direction === 'up' ? 'bg-emerald-500/10' : trend?.direction === 'down' ? 'bg-red-500/10' : 'bg-zinc-500/10';

    const industryDelta = trend ? score - trend.industryAvg : 0;
    const competitorDelta = trend ? score - trend.topCompetitorScore : 0;

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 h-full flex flex-col">
            <div className="flex items-start justify-between mb-1">
                <div>
                    <h2 className="text-sm font-bold text-white">Generative Engine</h2>
                    <h2 className="text-sm font-bold text-white">Optimization</h2>
                </div>
                {trend && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${trendBg}`}>
                        <TrendIcon className={`w-3 h-3 ${trendColor}`} />
                        <span className={`text-[11px] font-bold ${trendColor}`}>+{trend.change}</span>
                        <span className="text-[10px] text-zinc-500">pts</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4 flex-1">
                <GeoScoreGauge score={score} />
                {trend && (
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-zinc-500">30 day trend</span>
                        <MiniSparkline data={trend.sparkline} color={score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171'} width={100} height={40} />
                    </div>
                )}
            </div>

            {trend && (
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Users className="w-3 h-3 text-zinc-500" />
                            <span className="text-[9px] text-zinc-500">Industry Avg</span>
                        </div>
                        <div className="text-xs font-bold text-white"><AnimatedCounter value={trend.industryAvg} /></div>
                        <span className={`text-[9px] font-semibold ${industryDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {industryDelta >= 0 ? '+' : ''}{industryDelta} ahead
                        </span>
                    </div>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                            <BarChart3 className="w-3 h-3 text-zinc-500" />
                            <span className="text-[9px] text-zinc-500">Top Competitor</span>
                        </div>
                        <div className="text-xs font-bold text-white"><AnimatedCounter value={trend.topCompetitorScore} /></div>
                        <span className={`text-[9px] font-semibold ${competitorDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {competitorDelta >= 0 ? '+' : ''}{competitorDelta} {competitorDelta >= 0 ? 'ahead' : 'behind'}
                        </span>
                    </div>
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Quote className="w-3 h-3 text-zinc-500" />
                            <span className="text-[9px] text-zinc-500">Citations/wk</span>
                        </div>
                        <div className="text-xs font-bold text-white"><AnimatedCounter value={trend.citationsPerWeek} /></div>
                        <span className="text-[9px] font-semibold text-emerald-400">
                            +{trend.citationsChange} vs last
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
