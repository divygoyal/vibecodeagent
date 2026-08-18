'use client';

import { motion } from 'framer-motion';
import { Globe, Target, Users } from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';

const CARD = 'premium-card stat-card-hover';

type AnalyticsKpis = {
    avgSessionDuration: number;
    pagesPerSession: number;
    avgBounceRate: number;
    returningUsers?: number;
    totalUsers: number;
    newUsers?: number;
};

type AnalyticsTrafficPoint = {
    activeUsers?: number;
    sessions?: number;
    pageViews?: number;
    bounceRate?: number;
    avgSessionDuration?: number;
};

type AnalyticsChannel = {
    name: string;
    value?: number;
};

function fmtDur(seconds: number) {
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function EngagementCard({ kpis, traffic }: { kpis: AnalyticsKpis; traffic: AnalyticsTrafficPoint[] }) {
    if (!kpis) return null;
    const score = Math.min(100, Math.round(
        (Math.min(kpis.avgSessionDuration / 300, 1) * 30)
        + (Math.min(kpis.pagesPerSession / 5, 1) * 25)
        + (Math.max(0, 1 - kpis.avgBounceRate / 100) * 25)
        + (Math.min((kpis.returningUsers || 0) / Math.max(kpis.totalUsers, 1), 1) * 20)
    ));
    const color = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
    const barHex = score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#f87171';
    const dailyScores = traffic.slice(-30).map((day) => {
        const sessions = day.sessions || 0;
        const pageViews = day.pageViews || 0;
        const durationScore = Math.min(day.avgSessionDuration || 0, 300) / 300;
        const pagesPerSessionScore = sessions > 0 ? Math.min(pageViews / sessions, 5) / 5 : 0;
        const bounceScore = Math.max(0, 1 - (day.bounceRate || 0) / 100);
        return Math.round((durationScore * 0.33 + pagesPerSessionScore * 0.33 + bounceScore * 0.34) * 100);
    });
    const maxDaily = Math.max(...dailyScores, 1);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${CARD} overflow-hidden p-3 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 flex-shrink-0 text-violet-400" />
                    <h4 className="truncate text-sm font-semibold text-white">Engagement Score</h4>
                </div>
                <span className="tabular-nums text-[10px] text-zinc-600">{dailyScores.length}d</span>
            </div>
            <div className="mb-3 flex items-end gap-3">
                <AnimatedCounter value={score} className={`text-4xl font-bold leading-none sm:text-5xl ${color}`} />
                <div className="flex h-[32px] min-w-0 flex-1 items-end gap-[2px]">
                    {dailyScores.map((value, index) => (
                        <div
                            key={index}
                            className="min-w-[2px] flex-1 rounded-sm transition-all"
                            style={{
                                height: `${Math.max((value / maxDaily) * 100, 8)}%`,
                                backgroundColor: barHex,
                                opacity: 0.3 + (value / maxDaily) * 0.7,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Avg Duration</span>
                    <span className="font-medium tabular-nums text-zinc-300">{fmtDur(kpis.avgSessionDuration || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Pages / Session</span>
                    <span className="font-medium tabular-nums text-zinc-300">{(kpis.pagesPerSession || 0).toFixed(1)}</span>
                </div>
            </div>
        </motion.div>
    );
}

function LoyaltyCard({ kpis, traffic }: { kpis: AnalyticsKpis; traffic: AnalyticsTrafficPoint[] }) {
    if (!kpis) return null;
    const returning = kpis.returningUsers || 0;
    const totalUsers = kpis.totalUsers || 1;
    const loyaltyPct = Math.round((returning / totalUsers) * 100);
    const newPct = 100 - loyaltyPct;
    const dailyUsers = traffic.slice(-30).map((day) => day.activeUsers || 0);
    const maxDaily = Math.max(...dailyUsers, 1);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${CARD} overflow-hidden p-3 sm:p-5`}>
            <div className="mb-3 flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 flex-shrink-0 text-pink-400" />
                    <h4 className="truncate text-sm font-semibold text-white">Audience Loyalty</h4>
                </div>
                <span className="tabular-nums text-[10px] text-zinc-600">{dailyUsers.length}d</span>
            </div>
            <div className="mb-3 flex items-end gap-3">
                <AnimatedCounter value={loyaltyPct} className="text-4xl font-bold leading-none text-pink-400 sm:text-5xl" />
                <div className="flex h-[32px] min-w-0 flex-1 items-end gap-[2px]">
                    {dailyUsers.map((value, index) => (
                        <div
                            key={index}
                            className="min-w-[2px] flex-1 rounded-sm transition-all"
                            style={{
                                height: `${Math.max((value / maxDaily) * 100, 8)}%`,
                                backgroundColor: '#ec4899',
                                opacity: 0.3 + (value / maxDaily) * 0.7,
                            }}
                        />
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">New Visitors</span>
                    <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums text-violet-400">{newPct}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.04]">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${newPct}%` }} className="h-full rounded-full bg-violet-500/60" />
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Returning</span>
                    <div className="flex items-center gap-2">
                        <span className="font-medium tabular-nums text-emerald-400">{loyaltyPct}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.04]">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${loyaltyPct}%` }} className="h-full rounded-full bg-emerald-500/60" />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function DiversityCard({ channels }: { channels: AnalyticsChannel[] }) {
    if (!channels.length) return null;
    const total = channels.reduce((sum: number, channel) => sum + (channel.value || 0), 0);
    const shares = channels.map((channel) => (channel.value || 0) / Math.max(total, 1));
    const entropy = -shares.reduce((sum: number, share: number) => sum + (share > 0 ? share * Math.log2(share) : 0), 0);
    const maxEntropy = Math.log2(Math.max(channels.length, 1));
    const score = Math.round((entropy / Math.max(maxEntropy, 0.01)) * 100);
    const color = score >= 60 ? 'text-emerald-400' : score >= 35 ? 'text-amber-400' : 'text-red-400';

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${CARD} overflow-hidden p-3 sm:p-5`}>
            <div className="mb-2 flex items-center gap-2 min-w-0 sm:mb-3">
                <Globe className="h-4 w-4 flex-shrink-0 text-blue-400" />
                <h4 className="truncate text-sm font-semibold text-white sm:text-base">Source Diversity</h4>
            </div>
            <div className="mb-2 flex items-end gap-1 sm:mb-3">
                <AnimatedCounter value={score} className={`text-2xl font-bold sm:text-3xl ${color}`} />
                <span className="mb-0.5 text-[10px] text-zinc-600 sm:mb-1 sm:text-xs">/ 100</span>
            </div>
            <div className="space-y-1.5">
                {channels.slice(0, 4).map((channel, index: number) => {
                    const pct = Math.round(((channel.value || 0) / Math.max(total, 1)) * 100);
                    return (
                        <div key={index} className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-[80px] truncate text-zinc-400">{channel.name}</span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                                <div className="h-full rounded-full bg-blue-500/40" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="min-w-[28px] text-right tabular-nums text-zinc-600">{pct}%</span>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
}

export function AnalyticsIntelligenceCards({
    kpis,
    traffic,
    channels,
}: {
    kpis: AnalyticsKpis;
    traffic: AnalyticsTrafficPoint[];
    channels: AnalyticsChannel[];
}) {
    if (!kpis) return null;

    return (
        <div className="grid grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 md:grid-cols-3">
            <EngagementCard kpis={kpis} traffic={traffic} />
            <LoyaltyCard kpis={kpis} traffic={traffic} />
            <DiversityCard channels={channels} />
        </div>
    );
}
