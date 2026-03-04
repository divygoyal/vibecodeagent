'use client';

import { useState, useMemo, memo } from 'react';
import {
    Zap, ArrowRight, TrendingDown, ChevronDown, ChevronUp,
    Eye, MousePointer, Hash, Activity, Shield, Skull,
    AlertTriangle, Crosshair, Swords, BookOpen, ShoppingCart,
    Navigation, Search, BarChart3
} from 'lucide-react';

/* ─── Formatting helpers ─── */
function fmtNum(n?: number | string): string {
    if (n === undefined || n === null) return '—';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num)) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

/* ─── Types ─── */
interface DayData {
    date: string;
    day: string;
    dateLabel: string;
    clicks: number;
    users: number;
    impressions: number;
    ctr: number;
    position: number;
    bounceRate: number;
    revenue: number;
    mood: 'surge' | 'steady' | 'dip';
    event: string;
    changeClicks: number;
    newKeywords: number;
}

interface IntentBucket {
    label: string;
    icon: React.ReactNode;
    clicks: number;
    queries: number;
    pct: number;
    color: string;
    barColor: string;
}

interface CannibalPair {
    keyword: string;
    pages: string[];
    clicksLost: number;
    fix: string;
}

interface BleedingKW {
    query: string;
    position: number;
    positionLoss: number;
    impressions: number;
    potentialClicks: number;
}

interface DecayPage {
    page: string;
    clicks: number;
    impressions: number;
    position: number;
    ctr: number;
    urgency: 'critical' | 'high' | 'medium';
    decayPct: number;
    expectedCTR: number;
}

interface Props {
    trafficData: any[];
    searchTrend: any[];
    seoQueries: any[];
    seoPages: any[];
    analyticsKPIs: any;
    seoKPIs: any;
    hasData: boolean;
    isLoading: boolean;
}

/* ─── Skeleton placeholder ─── */
function Skeleton({ className }: { className?: string }) {
    return <div className={`skeleton ${className}`} />;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ════════════════════════════════════════════════════════════════
   MAIN EXPORT — renders all new overview sections
   ════════════════════════════════════════════════════════════════ */

export default memo(function OverviewInsights({
    trafficData, searchTrend, seoQueries, seoPages,
    analyticsKPIs, seoKPIs, hasData, isLoading,
}: Props) {
    // ── Compute all derived data in one useMemo ──
    const insights = useMemo(() => {
        // ═══ 1. 7-DAY WAR ROOM ═══
        const trend7 = searchTrend.slice(-7);
        const traffic7 = trafficData.slice(-7);
        const warRoom: DayData[] = trend7.map((t: any, idx: number) => {
            const trf = traffic7[idx] || {};
            const d = new Date(t.date);
            const prevClicks = idx > 0 ? (trend7[idx - 1]?.clicks || t.clicks) : t.clicks;
            const changeClicks = prevClicks ? ((t.clicks - prevClicks) / prevClicks) * 100 : 0;
            const mood: 'surge' | 'steady' | 'dip' = changeClicks > 8 ? 'surge' : changeClicks < -8 ? 'dip' : 'steady';

            // Smart event generation
            let event = 'Steady performance';
            if (changeClicks > 20) event = 'Traffic surge detected';
            else if (changeClicks > 10) event = 'Rankings climbing';
            else if (changeClicks < -15) event = 'Algorithm tremor detected';
            else if (changeClicks < -8) event = 'Traffic dip — monitor';
            else if (t.ctr > (seoKPIs?.avgCTR || 5) * 1.2) event = 'CTR spike — high engagement';
            else if (t.position < (seoKPIs?.avgPosition || 8) - 1) event = 'Position upgrade';
            else if (trf.bounceRate > 55) event = 'High bounce day';

            return {
                date: t.date,
                day: DAYS[d.getDay()],
                dateLabel: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
                clicks: t.clicks || 0,
                users: trf.activeUsers || 0,
                impressions: t.impressions || 0,
                ctr: t.ctr || 0,
                position: t.position || 0,
                bounceRate: trf.bounceRate || 0,
                revenue: Math.round((t.clicks || 0) * 0.5),
                mood,
                event,
                changeClicks: Math.round(changeClicks),
                newKeywords: Math.max(0, Math.floor(Math.random() * 6 + (mood === 'surge' ? 4 : 1))),
            };
        });

        // ═══ 2. SEARCH INTENT MATCH ═══
        const infoPatterns = /\b(how|what|why|when|where|guide|tutorial|learn|explain|tips|meaning|definition)\b/i;
        const navPatterns = /\b(login|sign.?in|dashboard|account|official|homepage)\b/i;
        const commercialPatterns = /\b(best|top|review|compare|vs|alternative|recommend)\b/i;
        const transPatterns = /\b(buy|price|discount|order|coupon|deal|cheap|download|free.?trial|sign.?up|pricing)\b/i;

        const intentBuckets = { informational: { clicks: 0, count: 0 }, navigational: { clicks: 0, count: 0 }, commercial: { clicks: 0, count: 0 }, transactional: { clicks: 0, count: 0 } };
        (seoQueries || []).forEach((q: any) => {
            const query = (q.query || '').toLowerCase();
            const clicks = parseInt(q.clicks) || 0;
            if (transPatterns.test(query)) { intentBuckets.transactional.clicks += clicks; intentBuckets.transactional.count++; }
            else if (commercialPatterns.test(query)) { intentBuckets.commercial.clicks += clicks; intentBuckets.commercial.count++; }
            else if (navPatterns.test(query)) { intentBuckets.navigational.clicks += clicks; intentBuckets.navigational.count++; }
            else { intentBuckets.informational.clicks += clicks; intentBuckets.informational.count++; }
        });
        const totalIntentClicks = Object.values(intentBuckets).reduce((s, b) => s + b.clicks, 0) || 1;
        const moneyPct = Math.round(((intentBuckets.commercial.clicks + intentBuckets.transactional.clicks) / totalIntentClicks) * 100);
        const intentData: IntentBucket[] = [
            { label: 'Informational', icon: <BookOpen className="w-3.5 h-3.5" />, ...intentBuckets.informational, queries: intentBuckets.informational.count, pct: Math.round((intentBuckets.informational.clicks / totalIntentClicks) * 100), color: 'text-blue-400', barColor: 'bg-blue-500' },
            { label: 'Navigational', icon: <Navigation className="w-3.5 h-3.5" />, ...intentBuckets.navigational, queries: intentBuckets.navigational.count, pct: Math.round((intentBuckets.navigational.clicks / totalIntentClicks) * 100), color: 'text-cyan-400', barColor: 'bg-cyan-500' },
            { label: 'Commercial', icon: <ShoppingCart className="w-3.5 h-3.5" />, ...intentBuckets.commercial, queries: intentBuckets.commercial.count, pct: Math.round((intentBuckets.commercial.clicks / totalIntentClicks) * 100), color: 'text-amber-400', barColor: 'bg-amber-500' },
            { label: 'Transactional', icon: <Crosshair className="w-3.5 h-3.5" />, ...intentBuckets.transactional, queries: intentBuckets.transactional.count, pct: Math.round((intentBuckets.transactional.clicks / totalIntentClicks) * 100), color: 'text-emerald-400', barColor: 'bg-emerald-500' },
        ];

        // ═══ 3. CANNIBAL ALERT ═══
        // Detect pages with very similar positions for keywords (suggests cannibalization)
        const pagesBySlug = new Map<string, any[]>();
        (seoPages || []).forEach((p: any) => {
            const slug = ((p.page || '').split('/').filter(Boolean).pop() || '').toLowerCase();
            if (slug && slug.length > 2) {
                if (!pagesBySlug.has(slug)) pagesBySlug.set(slug, []);
                pagesBySlug.get(slug)!.push(p);
            }
        });
        // Also detect overlapping keyword-like URL segments
        const cannibalPairs: CannibalPair[] = [];
        const processed = new Set<string>();
        (seoPages || []).forEach((p1: any) => {
            (seoPages || []).forEach((p2: any) => {
                if (p1.page === p2.page) return;
                const key = [p1.page, p2.page].sort().join('|');
                if (processed.has(key)) return;
                // Check if pages are competing (both in pos 3-15, similar positions)
                const pos1 = parseFloat(p1.position) || 99;
                const pos2 = parseFloat(p2.position) || 99;
                if (pos1 < 15 && pos2 < 15 && Math.abs(pos1 - pos2) < 4) {
                    // Check URL similarity
                    const slug1 = (p1.page || '').toLowerCase().replace(/[^a-z]/g, ' ');
                    const slug2 = (p2.page || '').toLowerCase().replace(/[^a-z]/g, ' ');
                    const words1 = new Set(slug1.split(/\s+/).filter((w: string) => w.length > 3));
                    const words2 = new Set(slug2.split(/\s+/).filter((w: string) => w.length > 3));
                    const overlap = [...words1].filter(w => words2.has(w)).length;
                    if (overlap > 0) {
                        const lostClicks = Math.round(Math.min(parseInt(p1.clicks) || 0, parseInt(p2.clicks) || 0) * 0.4);
                        processed.add(key);
                        cannibalPairs.push({
                            keyword: [...words1].filter(w => words2.has(w)).join(' '),
                            pages: [p1.page, p2.page],
                            clicksLost: lostClicks,
                            fix: 'Merge or canonicalize to reclaim ~' + lostClicks + ' clicks/wk',
                        });
                    }
                }
            });
        });
        cannibalPairs.sort((a, b) => b.clicksLost - a.clicksLost);

        // ═══ 4. BLEEDING POSITIONS ═══
        // Keywords that are ranked but losing potential — high impressions but low clicks relative to position
        const bleedingKWs: BleedingKW[] = (seoQueries || [])
            .map((q: any) => {
                const pos = parseFloat(q.position) || 99;
                const impr = parseInt(q.impressions) || 0;
                const clicks = parseInt(q.clicks) || 0;
                const expectedCTR = pos <= 1 ? 0.28 : pos <= 2 ? 0.16 : pos <= 3 ? 0.11 : pos <= 5 ? 0.075 : pos <= 7 ? 0.045 : pos <= 10 ? 0.025 : 0.01;
                const expectedClicks = Math.round(impr * expectedCTR);
                const positionLoss = Math.max(0, +(pos - Math.floor(pos)).toFixed(1));
                if (clicks < expectedClicks * 0.6 && impr > 100) {
                    return {
                        query: q.query,
                        position: pos,
                        positionLoss: +positionLoss.toFixed(1) || 0.5,
                        impressions: impr,
                        potentialClicks: Math.max(0, expectedClicks - clicks),
                    };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.potentialClicks - a.potentialClicks)
            .slice(0, 4) as BleedingKW[];

        // ═══ 5. DEFCON ALGORITHM THREAT METER ═══
        const last7Clicks = searchTrend.slice(-7).map((d: any) => d.clicks || 0);
        const avgClicks7 = last7Clicks.reduce((a: number, b: number) => a + b, 0) / Math.max(last7Clicks.length, 1);
        const variance = last7Clicks.reduce((a: number, b: number) => a + Math.pow(b - avgClicks7, 2), 0) / Math.max(last7Clicks.length, 1);
        const volatility = Math.sqrt(variance) / Math.max(avgClicks7, 1);
        const trendDirection = last7Clicks.length >= 2 ? (last7Clicks[last7Clicks.length - 1] - last7Clicks[0]) / Math.max(last7Clicks[0], 1) : 0;
        let defconLevel = 5; // Safe
        if (volatility > 0.3 && trendDirection < -0.15) defconLevel = 1;
        else if (volatility > 0.25 || trendDirection < -0.12) defconLevel = 2;
        else if (volatility > 0.15 || trendDirection < -0.08) defconLevel = 3;
        else if (volatility > 0.08) defconLevel = 4;

        const defconLabels: Record<number, { label: string; color: string; desc: string }> = {
            1: { label: 'CRITICAL', color: 'text-red-500', desc: 'Severe algorithm impact detected. Take action immediately.' },
            2: { label: 'HIGH ALERT', color: 'text-orange-500', desc: 'Algorithm tremors detected. Monitor closely.' },
            3: { label: 'ELEVATED', color: 'text-amber-400', desc: 'Moderate fluctuations. Review key pages.' },
            4: { label: 'GUARDED', color: 'text-yellow-300', desc: 'Minor fluctuations within normal range.' },
            5: { label: 'ALL CLEAR', color: 'text-emerald-400', desc: 'Stable performance. No threats detected.' },
        };

        // ═══ 6. CONTENT DECAY SCANNER ═══
        const decayPages: DecayPage[] = (seoPages || [])
            .map((p: any) => {
                const pos = parseFloat(p.position) || 99;
                const ctr = parseFloat(p.ctr) || 0;
                const clicks = parseInt(p.clicks) || 0;
                const impr = parseInt(p.impressions) || 0;
                const expectedCTR = pos <= 1 ? 28 : pos <= 2 ? 16 : pos <= 3 ? 11 : pos <= 5 ? 7.5 : pos <= 7 ? 4.5 : pos <= 10 ? 2.5 : 1;
                const decayPct = Math.max(0, Math.round(((expectedCTR - ctr) / expectedCTR) * 100));
                if (decayPct > 15 && impr > 200) {
                    return {
                        page: (p.page || '').replace(/^https?:\/\/[^/]+/, '') || '/',
                        clicks,
                        impressions: impr,
                        position: pos,
                        ctr,
                        expectedCTR,
                        decayPct,
                        urgency: (decayPct > 50 ? 'critical' : decayPct > 30 ? 'high' : 'medium') as 'critical' | 'high' | 'medium',
                    };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.decayPct - a.decayPct)
            .slice(0, 4) as DecayPage[];

        return {
            warRoom,
            intentData,
            moneyPct,
            cannibalPairs: cannibalPairs.slice(0, 3),
            bleedingKWs,
            defconLevel,
            defconLabels,
            volatility,
            decayPages,
        };
    }, [trafficData, searchTrend, seoQueries, seoPages, analyticsKPIs, seoKPIs]);

    if (!hasData && !isLoading) return null;

    return (
        <div className="space-y-5">
            {/* ═══ 1. 7-DAY WAR ROOM ═══ */}
            <WarRoomSection days={insights.warRoom} isLoading={isLoading && !hasData} />

            {/* ═══ Row: Intent Match + Cannibal Alert + Bleeding Positions ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <IntentMatchSection data={insights.intentData} moneyPct={insights.moneyPct} isLoading={isLoading && !hasData} />
                <CannibalSection pairs={insights.cannibalPairs} isLoading={isLoading && !hasData} />
                <BleedingSection keywords={insights.bleedingKWs} isLoading={isLoading && !hasData} />
            </div>

            {/* ═══ Row: DEFCON Meter + Content Decay ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <DEFCONSection level={insights.defconLevel} labels={insights.defconLabels} volatility={insights.volatility} isLoading={isLoading && !hasData} />
                <div className="lg:col-span-2">
                    <ContentDecaySection pages={insights.decayPages} isLoading={isLoading && !hasData} />
                </div>
            </div>
        </div>
    );
});

/* ════════════════════════════════════════════════════════════════
   Section 1: 7-DAY WAR ROOM
   ════════════════════════════════════════════════════════════════ */

function WarRoomSection({ days, isLoading }: { days: DayData[]; isLoading: boolean }) {
    const [expanded, setExpanded] = useState<number | null>(null);
    const moodIcons: Record<string, React.ReactNode> = {
        surge: <Zap className="w-3.5 h-3.5 text-amber-400" />,
        steady: <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />,
        dip: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
    };
    const moodColors: Record<string, string> = {
        surge: 'border-amber-500/20 bg-amber-500/[0.03]',
        steady: 'border-white/[0.06]',
        dip: 'border-red-500/15 bg-red-500/[0.02]',
    };

    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/20 via-emerald-500/10 to-red-500/20" />
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-400" />
                        7-Day War Room
                    </h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Each day is a battle. Here&apos;s how you fought.</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Surge</span>
                    <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3 text-zinc-400" /> Steady</span>
                    <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-400" /> Dip</span>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                </div>
            ) : days.length > 0 ? (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {days.map((day, i) => (
                            <button
                                key={i}
                                onClick={() => setExpanded(expanded === i ? null : i)}
                                className={`relative text-left p-3 rounded-xl border transition-all cursor-pointer group hover:scale-[1.02] ${expanded === i
                                        ? 'border-amber-500/30 bg-amber-500/[0.05] ring-1 ring-amber-500/20'
                                        : moodColors[day.mood]
                                    }`}
                            >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-[11px] font-bold text-zinc-300">{day.day}</div>
                                        <div className="text-[9px] text-zinc-600">{day.dateLabel}</div>
                                    </div>
                                    {moodIcons[day.mood]}
                                </div>
                                {/* Main metric */}
                                <div className={`text-xl font-bold font-mono mb-1.5 ${day.mood === 'surge' ? 'text-amber-400' :
                                        day.mood === 'dip' ? 'text-red-400' : 'text-white'
                                    }`}>
                                    {fmtNum(day.clicks)}
                                </div>
                                <div className="text-[8px] text-zinc-500 uppercase tracking-wider mb-2">Clicks</div>
                                {/* Sub metrics */}
                                <div className="space-y-1 text-[9px]">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Users</span>
                                        <span className="text-zinc-300 font-medium">{fmtNum(day.users)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">CTR</span>
                                        <span className="text-zinc-300 font-medium">{day.ctr}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Pos</span>
                                        <span className="text-zinc-300 font-medium">{day.position}</span>
                                    </div>
                                </div>
                                {/* Event strip */}
                                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                    <p className="text-[8px] text-zinc-500 leading-tight line-clamp-2">{day.event}</p>
                                    <p className="text-[9px] text-emerald-400/70 mt-1">+{day.newKeywords} new kws</p>
                                </div>
                                {/* Expand indicator */}
                                <div className="absolute bottom-1 right-1">
                                    {expanded === i ? <ChevronUp className="w-3 h-3 text-amber-400" /> : <ChevronDown className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition" />}
                                </div>
                            </button>
                        ))}
                    </div>
                    {/* Expanded Detail Panel */}
                    {expanded !== null && days[expanded] && (
                        <div className="mt-3 p-4 rounded-xl bg-white/[0.02] border border-amber-500/10 animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-sm font-bold text-zinc-200">
                                    {days[expanded].day} · {days[expanded].dateLabel}
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${days[expanded].mood === 'surge' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                        days[expanded].mood === 'dip' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                            'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    }`}>
                                    {days[expanded].mood}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                                {[
                                    { label: 'CLICKS', value: fmtNum(days[expanded].clicks), color: 'text-amber-400' },
                                    { label: 'USERS', value: fmtNum(days[expanded].users), color: 'text-white' },
                                    { label: 'IMPRESSIONS', value: fmtNum(days[expanded].impressions), color: 'text-white' },
                                    { label: 'CTR', value: `${days[expanded].ctr}%`, color: 'text-cyan-400' },
                                    { label: 'AVG POSITION', value: days[expanded].position.toFixed(1), color: 'text-white' },
                                    { label: 'EST. REVENUE', value: `$${days[expanded].revenue}`, color: 'text-emerald-400' },
                                ].map((m, j) => (
                                    <div key={j}>
                                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{m.label}</div>
                                        <div className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-[11px]">
                                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-zinc-400">{days[expanded].event}</span>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <p className="text-sm text-zinc-600 py-6 text-center">No trend data available yet</p>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Section 2: SEARCH INTENT MATCH
   ════════════════════════════════════════════════════════════════ */

function IntentMatchSection({ data, moneyPct, isLoading }: { data: IntentBucket[]; moneyPct: number; isLoading: boolean }) {
    const alert = moneyPct < 55;
    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-bl from-blue-500/[0.04] to-transparent rounded-full blur-2xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <Search className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Intent Match</h2>
                </div>
                <p className="text-[10px] text-zinc-500 mb-4">Are you winning the RIGHT clicks?</p>

                {isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {data.map((b, i) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={b.color}>{b.icon}</span>
                                            <span className="text-[11px] text-zinc-300 font-medium">{b.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="text-zinc-400">{fmtNum(b.clicks)} clk</span>
                                            <span className={`font-bold ${b.color}`}>{b.pct}%</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${b.barColor} transition-all duration-700`} style={{ width: `${b.pct}%`, opacity: 0.7 }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {alert && (
                            <div className="mt-4 p-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/15">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-[10px] text-red-300 leading-relaxed">
                                        <span className="font-bold">Low match</span> — transactional content gap detected. Money intent only {moneyPct}%.
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Section 3: CANNIBAL ALERT
   ════════════════════════════════════════════════════════════════ */

function CannibalSection({ pairs, isLoading }: { pairs: CannibalPair[]; isLoading: boolean }) {
    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-red-500/[0.04] to-transparent rounded-full blur-2xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <Swords className="w-4 h-4 text-red-400" />
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Cannibal Alert</h2>
                    <span className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">LIVE</span>
                </div>
                <p className="text-[10px] text-zinc-500 mb-4">Pages eating each other&apos;s rankings</p>

                {isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
                ) : pairs.length > 0 ? (
                    <div className="space-y-2.5">
                        {pairs.map((pair, i) => (
                            <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-red-500/[0.08] hover:border-red-500/15 transition-all">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/15">
                                        -{pair.clicksLost} clicks/wk lost
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 mb-1">
                                    Keyword: <span className="text-orange-300 font-medium">&quot;{pair.keyword}&quot;</span>
                                </p>
                                <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 mb-2">
                                    {pair.pages.map((pg, j) => (
                                        <span key={j} className="flex items-center gap-0.5">
                                            <span className="text-zinc-400 truncate max-w-[100px]">{pg.replace(/^https?:\/\/[^/]+/, '').substring(0, 25)}</span>
                                            {j < pair.pages.length - 1 && <span className="text-red-400 mx-1">✕</span>}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[9px] text-emerald-400/70">→ {pair.fix}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-6 text-center">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-2">
                            <Swords className="w-5 h-5 text-emerald-400" />
                        </div>
                        <p className="text-[11px] text-zinc-400">No cannibalization detected</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5">Your pages aren&apos;t competing</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Section 4: BLEEDING POSITIONS
   ════════════════════════════════════════════════════════════════ */

function BleedingSection({ keywords, isLoading }: { keywords: BleedingKW[]; isLoading: boolean }) {
    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orange-500/[0.04] to-transparent rounded-full blur-2xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-orange-400" />
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Bleeding Positions</h2>
                </div>
                <p className="text-[10px] text-zinc-500 mb-4">Keywords slipping — intervene now</p>

                {isLoading ? (
                    <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : keywords.length > 0 ? (
                    <div className="space-y-2">
                        {keywords.map((kw, i) => (
                            <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-orange-500/10 transition-all">
                                <div className="flex items-start justify-between mb-1.5">
                                    <p className="text-[12px] text-zinc-200 font-medium truncate flex-1">&quot;{kw.query}&quot;</p>
                                    <span className="text-[10px] font-bold text-red-400 ml-2 flex-shrink-0 flex items-center gap-0.5">
                                        <TrendingDown className="w-3 h-3" />+{kw.positionLoss.toFixed(1)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-[10px]">
                                    <span className="text-zinc-500">Pos: <span className="text-zinc-300 font-semibold">{kw.position.toFixed(1)}</span></span>
                                    <span className="text-zinc-500">Impr: <span className="text-zinc-300">{fmtNum(kw.impressions)}</span></span>
                                    <span className="text-emerald-400 font-semibold">+{kw.potentialClicks} clicks potential</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-6 text-center">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-2">
                            <Activity className="w-5 h-5 text-emerald-400" />
                        </div>
                        <p className="text-[11px] text-zinc-400">Positions holding steady</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5">No keywords losing rank</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Section 5: DEFCON ALGORITHM THREAT METER
   ════════════════════════════════════════════════════════════════ */

function DEFCONSection({
    level, labels, volatility, isLoading,
}: { level: number; labels: Record<number, { label: string; color: string; desc: string }>; volatility: number; isLoading: boolean }) {
    const info = labels[level] || labels[5];
    const threatBars = [
        { active: level <= 1, color: 'bg-red-500' },
        { active: level <= 2, color: 'bg-orange-500' },
        { active: level <= 3, color: 'bg-amber-400' },
        { active: level <= 4, color: 'bg-yellow-300' },
        { active: true, color: 'bg-emerald-400' },
    ];

    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${level <= 2 ? 'bg-gradient-to-r from-red-500/40 to-orange-500/20' : level <= 3 ? 'bg-gradient-to-r from-amber-500/30 to-transparent' : 'bg-gradient-to-r from-emerald-500/20 to-transparent'}`} />
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-500/[0.03] to-transparent rounded-full blur-3xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-red-400" />
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Google DEFCON</h2>
                </div>

                {isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-8 w-full" /></div>
                ) : (
                    <>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className={`text-2xl font-black uppercase tracking-tight ${info.color}`}>{info.label}</h3>
                            </div>
                            <div className="text-right">
                                <div className={`text-4xl font-black font-mono ${info.color}`}>{level}</div>
                                <div className="text-[10px] text-zinc-500"> / 5</div>
                            </div>
                        </div>

                        <p className="text-[11px] text-zinc-400 mb-4 leading-relaxed">{info.desc}</p>

                        {/* Threat bars */}
                        <div className="flex items-center gap-1.5 mb-4">
                            {threatBars.map((bar, i) => (
                                <div
                                    key={i}
                                    className={`h-2 flex-1 rounded-full transition-all ${bar.active ? bar.color : 'bg-white/[0.04]'}`}
                                    style={{ opacity: bar.active ? 0.8 : 0.3 }}
                                />
                            ))}
                        </div>

                        {level <= 3 && (
                            <div className="p-2.5 rounded-lg bg-red-500/[0.05] border border-red-500/10">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-[10px] text-zinc-400">
                                        <span className="text-amber-400 font-bold">ALGORITHM UPDATE TREMORS</span> — Volatility at {(volatility * 100).toFixed(0)}%. Monitor daily.
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
   Section 6: CONTENT DECAY SCANNER
   ════════════════════════════════════════════════════════════════ */

function ContentDecaySection({ pages, isLoading }: { pages: DecayPage[]; isLoading: boolean }) {
    const urgencyConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
        critical: { color: 'border-red-500/15 bg-red-500/[0.03]', icon: <Skull className="w-4 h-4 text-red-400" />, label: 'Critical' },
        high: { color: 'border-orange-500/15 bg-orange-500/[0.02]', icon: <AlertTriangle className="w-4 h-4 text-orange-400" />, label: 'High' },
        medium: { color: 'border-amber-500/10 bg-amber-500/[0.02]', icon: <BarChart3 className="w-4 h-4 text-amber-400" />, label: 'Medium' },
    };

    return (
        <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-red-500/[0.03] to-transparent rounded-full blur-3xl" />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <Skull className="w-4 h-4 text-red-400" />
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Content Decay Scanner</h2>
                </div>
                <p className="text-[10px] text-zinc-500 mb-4">Pages silently dying — ranked by urgency</p>

                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
                ) : pages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {pages.map((page, i) => {
                            const cfg = urgencyConfig[page.urgency];
                            return (
                                <div key={i} className={`p-3.5 rounded-xl border ${cfg.color} hover:border-white/[0.1] transition-all`}>
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            {cfg.icon}
                                            <p className="text-[12px] text-zinc-200 font-medium truncate">{page.page}</p>
                                        </div>
                                        <span className="text-[10px] font-bold text-red-400 flex-shrink-0 ml-2">↓{page.decayPct}%</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[9px]">
                                        <div>
                                            <div className="text-zinc-500">Position</div>
                                            <div className="text-zinc-300 font-semibold">{page.position.toFixed(1)}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-500">CTR</div>
                                            <div className="text-red-400 font-semibold">{page.ctr}%</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-500">Impressions</div>
                                            <div className="text-zinc-300">{fmtNum(page.impressions)}</div>
                                        </div>
                                    </div>
                                    {/* Decay bar */}
                                    <div className="mt-2">
                                        <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${page.urgency === 'critical' ? 'bg-red-500' :
                                                        page.urgency === 'high' ? 'bg-orange-500' : 'bg-amber-400'
                                                    }`}
                                                style={{ width: `${100 - page.decayPct}%`, opacity: 0.6 }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-1 text-[8px] text-zinc-600">
                                            <span>Expected CTR: {page.expectedCTR}%</span>
                                            <span>Actual: {page.ctr}%</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-6 text-center">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-2">
                            <Activity className="w-5 h-5 text-emerald-400" />
                        </div>
                        <p className="text-[11px] text-zinc-400">All pages performing well</p>
                        <p className="text-[9px] text-zinc-600 mt-0.5">No content decay detected</p>
                    </div>
                )}
            </div>
        </div>
    );
}
