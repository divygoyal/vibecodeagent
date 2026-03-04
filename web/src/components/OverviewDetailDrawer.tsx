'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, TrendingUp, TrendingDown, Gauge, Rocket, Tag, Activity,
    Target, MousePointer, Eye, Hash, ArrowRight, Zap,
    BarChart3, Search, AlertTriangle, CheckCircle2, Lightbulb
} from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

/* ─── Types ─── */
export type DrawerType = 'score' | 'velocity' | 'brand' | 'keyword' | 'ctr' | 'page' | 'health' | 'kpi';

export interface DrawerContent {
    type: DrawerType;
    title: string;
    data: any;
}

interface Props {
    open: boolean;
    onClose: () => void;
    content: DrawerContent | null;
}

/* ─── Helpers ─── */
function fmtNum(n?: number | string): string {
    if (n === undefined || n === null) return '—';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num)) return '—';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
}

const CHART_COLORS = ['#34d399', '#22d3ee', '#a78bfa', '#fbbf24', '#f87171'];

/* ─── Score Breakdown ─── */
function ScoreDetail({ data }: { data: any }) {
    const breakdown = [
        { label: 'Traffic Trend', value: data.trafficScore ?? 0, max: 15, tip: 'User growth rate impact' },
        { label: 'CTR Health', value: data.ctrScore ?? 0, max: 10, tip: 'Click-through rate quality' },
        { label: 'Bounce Rate', value: -(data.bounceScore ?? 0), max: 15, tip: 'Bounce rate penalty', invert: true },
        { label: 'Position Quality', value: data.positionScore ?? 0, max: 10, tip: 'Average ranking position' },
        { label: 'Impression Growth', value: data.impressionScore ?? 0, max: 10, tip: 'Search impression trend' },
    ];

    const weakest = breakdown.reduce((w, b) => b.value < w.value ? b : w, breakdown[0]);

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Overall Score" value={data.score} suffix="/100" color={data.score >= 70 ? 'emerald' : data.score >= 40 ? 'amber' : 'red'} />
                <MetricCard label="Score Grade" value={data.score >= 80 ? 'Excellent' : data.score >= 60 ? 'Good' : data.score >= 40 ? 'Needs Work' : 'Critical'} color={data.score >= 70 ? 'emerald' : data.score >= 40 ? 'amber' : 'red'} />
            </div>

            <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Score Breakdown</h3>
                <div className="space-y-3">
                    {breakdown.map((b) => (
                        <div key={b.label}>
                            <div className="flex justify-between mb-1">
                                <span className="text-xs text-zinc-400">{b.label}</span>
                                <span className={`text-xs font-mono font-bold ${b.value >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {b.invert ? '' : (b.value > 0 ? '+' : '')}{b.value.toFixed(0)}
                                </span>
                            </div>
                            <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-700 ${b.value >= 0 ? 'bg-emerald-400/70' : 'bg-red-400/70'}`}
                                    style={{ width: `${Math.min(100, (Math.abs(b.value) / b.max) * 100)}%` }}
                                />
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-0.5">{b.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-amber-500/[0.06] border border-amber-500/15 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">Focus Area</span>
                </div>
                <p className="text-xs text-zinc-300">
                    Your weakest area is <strong className="text-white">{weakest.label}</strong>.
                    {weakest.label === 'Traffic Trend' && ' Focus on content creation and link building to drive more organic traffic.'}
                    {weakest.label === 'CTR Health' && ' Improve meta titles and descriptions to increase click-through rates.'}
                    {weakest.label === 'Bounce Rate' && ' Improve page load speed and content relevance to reduce bounce rates.'}
                    {weakest.label === 'Position Quality' && ' Target long-tail keywords and optimize existing content for better rankings.'}
                    {weakest.label === 'Impression Growth' && ' Create new content targeting high-volume keywords to increase impressions.'}
                </p>
            </div>
        </div>
    );
}

/* ─── Growth Velocity Detail ─── */
function VelocityDetail({ data }: { data: any }) {
    const chartData = (data.weekData || []).map((d: any, i: number) => ({
        name: d.label || `Day ${i + 1}`,
        current: d.current || 0,
        previous: d.previous || 0,
    }));

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Velocity" value={`${data.velocity > 0 ? '+' : ''}${data.velocity?.toFixed(1)}%`} color={data.velocity > 0 ? 'emerald' : 'red'} />
                <MetricCard label="This Week" value={fmtNum(data.recentClicks)} color="cyan" />
                <MetricCard label="Last Week" value={fmtNum(data.prevClicks)} color="zinc" />
            </div>

            {chartData.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">7-Day Comparison</h3>
                    <div className="h-48 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barGap={2}>
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={30} />
                                <Tooltip
                                    contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                                    labelStyle={{ color: '#a1a1aa' }}
                                />
                                <Bar dataKey="previous" fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} name="Last Week" />
                                <Bar dataKey="current" fill="#34d399" radius={[4, 4, 0, 0]} name="This Week" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                <p className="text-xs text-zinc-300">
                    {data.velocity > 10
                        ? 'Your traffic is accelerating strongly. Keep up the momentum with consistent content publishing.'
                        : data.velocity > 0
                            ? 'Positive growth trend. Consider doubling down on your top-performing content topics.'
                            : data.velocity > -5
                                ? 'Growth has plateaued. Try refreshing existing content and targeting new keyword clusters.'
                                : 'Traffic is decelerating. Review recent algorithm updates and check for technical issues.'}
                </p>
            </div>
        </div>
    );
}

/* ─── Brand Split Detail ─── */
function BrandDetail({ data }: { data: any }) {
    const pieData = [
        { name: 'Non-Branded', value: data.nonBranded || 0 },
        { name: 'Branded', value: data.branded || 0 },
    ];

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Non-Branded" value={`${data.nonBrandedPct}%`} subtitle={`${fmtNum(data.nonBranded)} clicks`} color="cyan" />
                <MetricCard label="Branded" value={`${data.brandedPct}%`} subtitle={`${fmtNum(data.branded)} clicks`} color="amber" />
            </div>

            <div className="h-48 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" strokeWidth={0}>
                            <Cell fill="#22d3ee" />
                            <Cell fill="#fbbf24" />
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {data.topBranded && data.topBranded.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Top Branded Keywords</h3>
                    <div className="space-y-1.5">
                        {data.topBranded.slice(0, 5).map((kw: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-white/[0.02] rounded-lg text-xs">
                                <span className="text-zinc-300 truncate max-w-[60%]">{kw.query}</span>
                                <span className="text-amber-400 font-mono">{fmtNum(kw.clicks)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={`rounded-xl p-4 ${data.brandedPct > 60
                ? 'bg-amber-500/[0.06] border border-amber-500/15'
                : 'bg-emerald-500/[0.06] border border-emerald-500/15'
                }`}>
                <div className="flex items-center gap-2 mb-1">
                    {data.brandedPct > 60
                        ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                        : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    <span className={`text-xs font-semibold ${data.brandedPct > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {data.brandedPct > 60 ? 'High Brand Reliance' : 'Healthy Mix'}
                    </span>
                </div>
                <p className="text-xs text-zinc-300">
                    {data.brandedPct > 60
                        ? 'Over 60% of your traffic comes from branded searches. Diversify by targeting informational and long-tail keywords.'
                        : 'Good balance between branded and organic traffic. Continue building topical authority.'}
                </p>
            </div>
        </div>
    );
}

/* ─── Keyword Detail ─── */
function KeywordDetail({ data }: { data: any }) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Position" value={data.position} color={parseFloat(data.position) <= 10 ? 'emerald' : 'amber'} />
                <MetricCard label="Impressions" value={fmtNum(data.impressions)} color="cyan" />
                <MetricCard label="Current Clicks" value={fmtNum(data.clicks)} color="violet" />
                <MetricCard label="Potential Extra" value={`+${fmtNum(data.potentialClicks)}`} color="emerald" />
            </div>

            {data.estimatedRevenue > 0 && (
                <div className="bg-emerald-500/[0.06] border border-emerald-500/15 rounded-xl p-4">
                    <p className="text-xs text-zinc-400 mb-1">Estimated Monthly Revenue Uplift</p>
                    <p className="text-2xl font-bold text-emerald-400 font-mono">${data.estimatedRevenue.toFixed(0)}</p>
                    <p className="text-[10px] text-zinc-500 mt-1">Based on $0.50/click conservative estimate</p>
                </div>
            )}

            <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Recommended Actions</h3>
                <div className="space-y-2">
                    <ActionItem text="Optimize on-page content for this keyword" />
                    <ActionItem text="Add internal links from high-authority pages" />
                    <ActionItem text="Create supporting content around related topics" />
                    {parseFloat(data.position) > 10 && <ActionItem text="Build quality backlinks to the ranking page" />}
                </div>
            </div>
        </div>
    );
}

/* ─── CTR Problem Detail ─── */
function CTRDetail({ data }: { data: any }) {
    const ctrBarData = [
        { name: 'Actual', value: parseFloat(data.actualCTR) },
        { name: 'Expected', value: parseFloat(data.expectedCTR) },
    ];

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Actual CTR" value={`${data.actualCTR}%`} color="red" />
                <MetricCard label="Expected CTR" value={`${data.expectedCTR}%`} color="emerald" />
                <MetricCard label="Position" value={data.position} color="cyan" />
                <MetricCard label="CTR Gap" value={`${data.gap}%`} color="amber" />
            </div>

            <div className="h-32 bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ctrBarData} layout="vertical" barGap={4}>
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={60} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                            <Cell fill="#f87171" />
                            <Cell fill="#34d399" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">How to Fix</h3>
                <div className="space-y-2">
                    <ActionItem text="Rewrite your meta title to be more compelling and click-worthy" />
                    <ActionItem text="Add numbers, power words, or brackets to your title tag" />
                    <ActionItem text="Improve meta description with a clear value proposition and CTA" />
                    <ActionItem text="Add structured data (FAQ, HowTo) for rich snippets" />
                </div>
            </div>
        </div>
    );
}

/* ─── Page Detail ─── */
function PageDetail({ data }: { data: any }) {
    return (
        <div className="space-y-5">
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Page URL</p>
                <p className="text-sm text-white font-mono break-all">{data.page}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Clicks" value={fmtNum(data.clicks)} color="emerald" />
                <MetricCard label="Impressions" value={fmtNum(data.impressions)} color="cyan" />
                <MetricCard label="Avg. Position" value={data.position} color="amber" />
            </div>
            <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Optimization Tips</h3>
                <div className="space-y-2">
                    <ActionItem text="Update content with fresh data and recent examples" />
                    <ActionItem text="Add more internal links to and from this page" />
                    <ActionItem text="Optimize images and improve page load speed" />
                </div>
            </div>
        </div>
    );
}

/* ─── Health Detail ─── */
function HealthDetail({ data }: { data: any }) {
    return (
        <div className="space-y-5">
            <div className={`rounded-xl p-4 text-center ${data.verdict === 'growing'
                ? 'bg-emerald-500/[0.06] border border-emerald-500/15'
                : data.verdict === 'declining'
                    ? 'bg-red-500/[0.06] border border-red-500/15'
                    : 'bg-amber-500/[0.06] border border-amber-500/15'
                }`}>
                <p className={`text-2xl font-bold ${data.verdict === 'growing' ? 'text-emerald-400' : data.verdict === 'declining' ? 'text-red-400' : 'text-amber-400'}`}>
                    {data.verdict === 'growing' ? 'Growing' : data.verdict === 'declining' ? 'Declining' : 'Stable'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Overall Site Health Status</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="User Change" value={`${data.changeUsers > 0 ? '+' : ''}${data.changeUsers}%`} color={data.changeUsers >= 0 ? 'emerald' : 'red'} />
                <MetricCard label="Click Change" value={`${data.changeClicks > 0 ? '+' : ''}${data.changeClicks}%`} color={data.changeClicks >= 0 ? 'emerald' : 'red'} />
                {data.avgCTR && <MetricCard label="Avg CTR" value={`${data.avgCTR}%`} color="cyan" />}
                {data.avgPosition && <MetricCard label="Avg Position" value={data.avgPosition} color="amber" />}
            </div>

            <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What This Means</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                    {data.verdict === 'growing'
                        ? 'Your site is showing positive momentum across key metrics. Users and organic clicks are both trending upward. Continue your current strategy and look for opportunities to accelerate growth.'
                        : data.verdict === 'declining'
                            ? 'Key metrics are trending downward. This could indicate algorithm changes, technical issues, or increased competition. Review your top pages, check for crawl errors, and audit recent content changes.'
                            : 'Your metrics are relatively stable. Look for quick wins like CTR optimization and content refresh opportunities to push into growth territory.'}
                </p>
            </div>
        </div>
    );
}

/* ─── KPI Detail ─── */
function KPIDetail({ data }: { data: any }) {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Current" value={fmtNum(data.value)} color="white" />
                {data.change !== undefined && (
                    <MetricCard
                        label="Change (WoW)"
                        value={`${data.change > 0 ? '+' : ''}${data.change}%`}
                        color={data.change >= 0 ? 'emerald' : 'red'}
                    />
                )}
                {data.previousValue !== undefined && (
                    <MetricCard label="Previous Period" value={fmtNum(data.previousValue)} color="zinc" />
                )}
            </div>
            {data.tip && (
                <div className="bg-blue-500/[0.06] border border-blue-500/15 rounded-xl p-4">
                    <p className="text-xs text-zinc-300">{data.tip}</p>
                </div>
            )}
        </div>
    );
}

/* ─── Reusable Components ─── */
function MetricCard({ label, value, subtitle, suffix, color }: { label: string; value: string | number; subtitle?: string; suffix?: string; color: string }) {
    const colorMap: Record<string, string> = {
        emerald: 'text-emerald-400', red: 'text-red-400', amber: 'text-amber-400',
        cyan: 'text-cyan-400', violet: 'text-violet-400', zinc: 'text-zinc-400', white: 'text-white',
    };
    return (
        <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3.5">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
            <p className={`text-xl font-bold mt-1 tabular-nums ${colorMap[color] || 'text-white'}`}>
                {value}{suffix}
            </p>
            {subtitle && <p className="text-[10px] text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
    );
}

function ActionItem({ text }: { text: string }) {
    return (
        <div className="flex items-start gap-2 py-2 px-3 bg-white/[0.02] rounded-lg border border-white/[0.04]">
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-zinc-300">{text}</span>
        </div>
    );
}

/* ─── Main Drawer ─── */
export default function OverviewDetailDrawer({ open, onClose, content }: Props) {
    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!content) return null;

    const renderContent = () => {
        switch (content.type) {
            case 'score': return <ScoreDetail data={content.data} />;
            case 'velocity': return <VelocityDetail data={content.data} />;
            case 'brand': return <BrandDetail data={content.data} />;
            case 'keyword': return <KeywordDetail data={content.data} />;
            case 'ctr': return <CTRDetail data={content.data} />;
            case 'page': return <PageDetail data={content.data} />;
            case 'health': return <HealthDetail data={content.data} />;
            case 'kpi': return <KPIDetail data={content.data} />;
            default: return null;
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md z-50 bg-[#050508] border-l border-white/[0.08] shadow-2xl overflow-y-auto"
                    >
                        <div className="sticky top-0 bg-[#050508]/95 backdrop-blur-md border-b border-white/[0.04] px-6 py-4 flex items-center justify-between z-10">
                            <div>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Details</p>
                                <h2 className="text-lg font-bold text-white mt-0.5">{content.title}</h2>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-white transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {renderContent()}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
