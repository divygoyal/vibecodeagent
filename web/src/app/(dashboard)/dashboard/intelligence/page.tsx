'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Radar, TrendingUp, TrendingDown, AlertTriangle, Target, Eye,
    Zap, ArrowUpRight, ArrowDownRight, ChevronDown, MousePointer,
    Activity, Sparkles, Crown, Shield, Clock, Brain,
    CheckCircle2, XCircle, Flame, Search, BarChart3, Hash,
    Loader2, RefreshCw, Filter, ChevronRight
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { useSeoData, useSiteList, useAnalyticsData, useContainerStatus } from '@/lib/useDashboardData';
import { useRegistration } from '../layout';
import { signIn } from 'next-auth/react';

/* ─── Types ─── */
interface AlertItem {
    id: string;
    type: 'traffic_drop' | 'traffic_spike' | 'ranking_loss' | 'ranking_gain' | 'content_decay' |
    'ctr_problem' | 'opportunity' | 'new_keyword' | 'position_change';
    severity: 'critical' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    metric?: string;
    change?: number;
    timestamp: string;
    category: 'traffic' | 'rankings' | 'content' | 'opportunities';
}

interface OpportunityItem {
    query: string;
    position: number;
    impressions: number;
    clicks: number;
    ctr: number;
    potentialClicks: number;
    type: 'striking_distance' | 'ctr_fix' | 'quick_win' | 'rising';
}

/* ─── Severity Configs ─── */
const severityStyles = {
    critical: {
        bg: 'bg-red-500/[0.06]', border: 'border-red-500/20', text: 'text-red-400',
        icon: XCircle, pulse: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/20'
    },
    warning: {
        bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', text: 'text-amber-400',
        icon: AlertTriangle, pulse: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    },
    info: {
        bg: 'bg-blue-500/[0.06]', border: 'border-blue-500/20', text: 'text-blue-400',
        icon: Eye, pulse: 'bg-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    },
    success: {
        bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', text: 'text-emerald-400',
        icon: CheckCircle2, pulse: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
};

const categoryConfig = {
    traffic: { label: 'Traffic', icon: BarChart3, color: 'text-blue-400' },
    rankings: { label: 'Rankings', icon: Target, color: 'text-violet-400' },
    content: { label: 'Content', icon: Activity, color: 'text-amber-400' },
    opportunities: { label: 'Opportunities', icon: Sparkles, color: 'text-emerald-400' },
};

/* ─── Expected CTR by position (industry avg) ─── */
const expectedCTR = (pos: number): number => {
    if (pos <= 1) return 31.7;
    if (pos <= 2) return 24.7;
    if (pos <= 3) return 18.7;
    if (pos <= 4) return 13.6;
    if (pos <= 5) return 9.5;
    if (pos <= 6) return 6.2;
    if (pos <= 7) return 4.2;
    if (pos <= 8) return 3.1;
    if (pos <= 9) return 2.6;
    if (pos <= 10) return 2.4;
    return 1.0;
};

/* ─── Intelligence Engine: compute alerts from raw data ─── */
function computeAlerts(seoData: any, analyticsData: any): AlertItem[] {
    const alerts: AlertItem[] = [];
    const now = new Date().toISOString();
    let id = 0;

    if (!seoData) return alerts;

    const kpis = seoData.kpis;
    const queries = seoData.queries || [];
    const pages = seoData.pages || [];
    const trend = seoData.trend || [];

    // ── Traffic Alerts ──
    if (kpis) {
        if (kpis.changeClicks < -20) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: kpis.changeClicks < -40 ? 'critical' : 'warning',
                title: `Traffic dropped ${Math.abs(kpis.changeClicks)}%`,
                description: `Your clicks declined from the previous period. ${kpis.changeClicks < -40 ? 'This is a significant drop that needs immediate attention.' : 'Monitor this trend closely.'}`,
                metric: `${kpis.totalClicks.toLocaleString()} clicks`, change: kpis.changeClicks,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changeClicks > 20) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_spike', severity: 'success',
                title: `Traffic surged +${kpis.changeClicks}%`,
                description: `Great news! Your clicks increased significantly. Identify what's working and double down.`,
                metric: `${kpis.totalClicks.toLocaleString()} clicks`, change: kpis.changeClicks,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changeImpressions < -25) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: 'warning',
                title: `Impressions dropped ${Math.abs(kpis.changeImpressions)}%`,
                description: `Your visibility in search results is declining. This could indicate ranking losses or seasonal trends.`,
                metric: `${kpis.totalImpressions.toLocaleString()} impressions`, change: kpis.changeImpressions,
                timestamp: now, category: 'traffic',
            });
        }
        if (kpis.changePosition > 2) {
            alerts.push({
                id: `alert-${id++}`, type: 'ranking_loss', severity: 'warning',
                title: `Avg. position worsened by ${kpis.changePosition.toFixed(1)} spots`,
                description: `Your overall ranking position dropped. Check individual keywords to identify the cause.`,
                metric: `Position ${kpis.avgPosition}`, change: kpis.changePosition,
                timestamp: now, category: 'rankings',
            });
        }
        if (kpis.changePosition < -2) {
            alerts.push({
                id: `alert-${id++}`, type: 'ranking_gain', severity: 'success',
                title: `Rankings improved by ${Math.abs(kpis.changePosition).toFixed(1)} positions`,
                description: `Your overall position in search results improved. Your SEO efforts are paying off!`,
                metric: `Position ${kpis.avgPosition}`, change: kpis.changePosition,
                timestamp: now, category: 'rankings',
            });
        }
    }

    // ── Content Decay ──
    const decayingPages = pages.filter((p: any) => (p.status === 'decay' || p.position > 20) && p.impressions > 50);
    if (decayingPages.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'content_decay', severity: decayingPages.length > 5 ? 'critical' : 'warning',
            title: `${decayingPages.length} page${decayingPages.length > 1 ? 's' : ''} showing content decay`,
            description: `These pages are losing rankings and visibility. Refresh content, update information, and add internal links to recover.`,
            metric: `${decayingPages.length} pages affected`,
            timestamp: now, category: 'content',
        });
    }

    // ── CTR Problems ──
    const ctrProblems = queries.filter((q: any) => {
        const expected = expectedCTR(q.position);
        return q.position <= 10 && q.ctr < expected * 0.5 && q.impressions > 100;
    });
    if (ctrProblems.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'ctr_problem', severity: 'warning',
            title: `${ctrProblems.length} keyword${ctrProblems.length > 1 ? 's' : ''} with below-average CTR`,
            description: `These keywords rank well but get fewer clicks than expected. Rewriting meta titles and descriptions could significantly boost traffic.`,
            metric: `${ctrProblems.length} keywords affected`,
            timestamp: now, category: 'content',
        });
    }

    // ── Striking Distance Opportunities ──
    const strikingDistance = queries.filter((q: any) => q.position > 3 && q.position <= 20 && q.impressions > 50);
    if (strikingDistance.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'opportunity', severity: 'info',
            title: `${strikingDistance.length} keywords within striking distance`,
            description: `These keywords are on the edge of page 1. A small content boost, more internal links, or better meta tags could push them to top positions.`,
            metric: `${strikingDistance.length} keywords (pos 4-20)`,
            timestamp: now, category: 'opportunities',
        });
    }

    // ── Quick Wins ──
    const quickWins = queries.filter((q: any) => q.position > 10 && q.position <= 15 && q.impressions > 200);
    if (quickWins.length > 0) {
        alerts.push({
            id: `alert-${id++}`, type: 'new_keyword', severity: 'info',
            title: `${quickWins.length} quick-win keyword${quickWins.length > 1 ? 's' : ''} detected`,
            description: `These keywords have high impressions but sit just below page 1. They're the easiest wins to capture more organic traffic.`,
            metric: `Position 11-15, ${quickWins.reduce((sum: number, q: any) => sum + q.impressions, 0).toLocaleString()} impressions`,
            timestamp: now, category: 'opportunities',
        });
    }

    // ── Traffic Trend analysis ──
    if (trend.length >= 14) {
        const last7 = trend.slice(-7);
        const prev7 = trend.slice(-14, -7);
        const avgLast = last7.reduce((sum: number, d: any) => sum + d.clicks, 0) / 7;
        const avgPrev = prev7.reduce((sum: number, d: any) => sum + d.clicks, 0) / 7;
        if (avgPrev > 0 && avgLast < avgPrev * 0.7) {
            alerts.push({
                id: `alert-${id++}`, type: 'traffic_drop', severity: 'critical',
                title: `Week-over-week traffic declined ${Math.round((1 - avgLast / avgPrev) * 100)}%`,
                description: `The last 7 days show significantly less traffic than the previous week. Check for algorithm updates, technical issues, or seasonal patterns.`,
                metric: `${Math.round(avgLast)} avg daily clicks (was ${Math.round(avgPrev)})`,
                change: -Math.round((1 - avgLast / avgPrev) * 100),
                timestamp: now, category: 'traffic',
            });
        }
    }

    // Sort: critical first, then warning, info, success
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/* ─── Compute Opportunities ─── */
function computeOpportunities(seoData: any): OpportunityItem[] {
    const queries = seoData?.queries || [];
    const opps: OpportunityItem[] = [];

    for (const q of queries) {
        const expected = expectedCTR(q.position);
        const potentialClicks = Math.round((expected / 100) * q.impressions);

        if (q.position > 3 && q.position <= 10 && q.impressions > 50) {
            opps.push({ ...q, potentialClicks, type: 'striking_distance' as const });
        } else if (q.position <= 5 && q.ctr < expected * 0.5 && q.impressions > 100) {
            opps.push({ ...q, potentialClicks, type: 'ctr_fix' as const });
        } else if (q.position > 10 && q.position <= 15 && q.impressions > 200) {
            opps.push({ ...q, potentialClicks, type: 'quick_win' as const });
        }
    }

    return opps.sort((a, b) => b.potentialClicks - a.potentialClicks).slice(0, 20);
}

/* ─── Animations ─── */
const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

/* ═══════════════════════════════════════════════════════════
   MAIN INTELLIGENCE CENTER PAGE
   ═══════════════════════════════════════════════════════════ */
export default function IntelligencePage() {
    const { hasGoogleConnection, isLoading: containerLoading } = useContainerStatus();
    const { sites, isLoading: sitesLoading } = useSiteList(hasGoogleConnection);
    const { selectedSite, setSelectedSite, selectedProperty } = useRegistration();
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterSeverity, setFilterSeverity] = useState<string>('all');
    const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

    // Auto-select first site
    useEffect(() => {
        if (sites.length > 0 && !selectedSite) setSelectedSite(sites[0].siteUrl);
    }, [sites, selectedSite]);

    // Fetch data
    const { data: seoData, isLoading: seoLoading, isError: seoError } = useSeoData('all', selectedSite, hasGoogleConnection);
    const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData('overview', selectedProperty, hasGoogleConnection);

    const isLoading = seoLoading || analyticsLoading || containerLoading;

    // Compute intelligence
    const alerts = useMemo(() => computeAlerts(seoData, analyticsData), [seoData, analyticsData]);
    const opportunities = useMemo(() => computeOpportunities(seoData), [seoData]);

    // Filtered alerts
    const filteredAlerts = useMemo(() => {
        return alerts.filter(a => {
            if (filterCategory !== 'all' && a.category !== filterCategory) return false;
            if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
            return true;
        });
    }, [alerts, filterCategory, filterSeverity]);

    // Stats
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const opportunityCount = alerts.filter(a => a.category === 'opportunities').length;
    const successCount = alerts.filter(a => a.severity === 'success').length;

    // Health Score
    const healthScore = useMemo(() => {
        let score = 100;
        for (const a of alerts) {
            if (a.severity === 'critical') score -= 20;
            else if (a.severity === 'warning') score -= 10;
            else if (a.severity === 'info') score -= 3;
        }
        return Math.max(0, Math.min(100, score));
    }, [alerts]);

    const healthColor = healthScore >= 80 ? 'text-emerald-400' : healthScore >= 50 ? 'text-amber-400' : 'text-red-400';
    const healthBg = healthScore >= 80 ? 'from-emerald-400 to-cyan-400' : healthScore >= 50 ? 'from-amber-400 to-orange-400' : 'from-red-400 to-pink-400';

    // Sparkline from trend
    const trendData = (seoData?.trend || []).slice(-14).map((d: any) => ({ v: d.clicks }));

    // ── Connect prompt ──
    if (!containerLoading && !hasGoogleConnection) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-emerald-500/20 flex items-center justify-center">
                    <Radar className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">Connect Google to activate Intelligence</h2>
                <p className="text-sm text-zinc-400 text-center max-w-md">The Intelligence Center analyzes your Search Console and Analytics data to surface proactive insights.</p>
                <button onClick={() => signIn('google')} className="px-5 py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-400 text-black font-semibold rounded-xl hover:opacity-90 transition-all text-sm">
                    Connect Google
                </button>
            </div>
        );
    }

    // ── Loading ──
    if (isLoading && !seoData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 animate-spin border-t-emerald-400" />
                    <Radar className="w-6 h-6 text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <span className="text-zinc-400 text-sm">Scanning your data for insights...</span>
            </div>
        );
    }

    // ── Error with site selector ──
    if (seoError && !seoData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <div className="text-center max-w-md">
                    <h2 className="text-xl font-semibold text-white mb-2">Couldn&apos;t analyze this property</h2>
                    <p className="text-sm text-zinc-400">The selected site may not be accessible. Try a different one.</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm">
                    <h3 className="text-sm font-semibold text-white mb-3">Select a site</h3>
                    <div className="relative">
                        <select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} disabled={sitesLoading || sites.length === 0}
                            className="w-full appearance-none bg-zinc-900 border border-white/[0.1] rounded-lg pl-3 pr-8 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition">
                            {sitesLoading ? <option>Loading...</option>
                                : sites.length === 0 ? <option value="">No sites found</option>
                                    : sites.map(s => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl.replace('sc-domain:', '')}</option>)
                            }
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6 p-6">

            {/* ═══ HEADER ═══ */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <Radar className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Intelligence Center</h1>
                            <p className="text-xs text-zinc-500">Proactive alerts & opportunities from your data</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Site selector */}
                    <div className="relative">
                        <select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)} disabled={sitesLoading}
                            className="appearance-none bg-zinc-900 border border-white/[0.1] rounded-lg pl-3 pr-8 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-emerald-500/50 transition min-w-[180px]">
                            {sites.map(s => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl.replace('sc-domain:', '')}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                    {isLoading && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
                </div>
            </motion.div>

            {/* ═══ TOP STATS ROW ═══ */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-5 gap-4">

                {/* Health Score */}
                <div className="col-span-2 lg:col-span-1 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
                    <div className="relative">
                        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                            <circle cx="40" cy="40" r="34" fill="none" stroke="url(#healthGrad)" strokeWidth="6"
                                strokeLinecap="round" strokeDasharray={`${(healthScore / 100) * 213.6} 213.6`}
                                className="transition-all duration-1000" />
                            <defs>
                                <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={healthScore >= 80 ? '#34d399' : healthScore >= 50 ? '#fbbf24' : '#f87171'} />
                                    <stop offset="100%" stopColor={healthScore >= 80 ? '#22d3ee' : healthScore >= 50 ? '#fb923c' : '#ec4899'} />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-2xl font-black ${healthColor}`}>{healthScore}</span>
                        </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1 font-medium">HEALTH SCORE</span>
                </div>

                {/* Critical Issues */}
                <div className={`bg-white/[0.02] border rounded-2xl p-5 transition-all ${criticalCount > 0 ? 'border-red-500/20 hover:border-red-500/30' : 'border-white/[0.06] hover:border-white/[0.1]'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${criticalCount > 0 ? 'bg-red-500/10' : 'bg-white/[0.04]'}`}>
                            <XCircle className={`w-4 h-4 ${criticalCount > 0 ? 'text-red-400' : 'text-zinc-600'}`} />
                        </div>
                        {criticalCount > 0 && <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                    </div>
                    <div className={`text-2xl font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-zinc-600'}`}>{criticalCount}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Critical Issues</div>
                </div>

                {/* Warnings */}
                <div className={`bg-white/[0.02] border rounded-2xl p-5 transition-all ${warningCount > 0 ? 'border-amber-500/20 hover:border-amber-500/30' : 'border-white/[0.06] hover:border-white/[0.1]'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${warningCount > 0 ? 'bg-amber-500/10' : 'bg-white/[0.04]'}`}>
                            <AlertTriangle className={`w-4 h-4 ${warningCount > 0 ? 'text-amber-400' : 'text-zinc-600'}`} />
                        </div>
                    </div>
                    <div className={`text-2xl font-bold ${warningCount > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{warningCount}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Warnings</div>
                </div>

                {/* Opportunities */}
                <div className={`bg-white/[0.02] border rounded-2xl p-5 transition-all ${opportunityCount > 0 ? 'border-emerald-500/20 hover:border-emerald-500/30' : 'border-white/[0.06] hover:border-white/[0.1]'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${opportunityCount > 0 ? 'bg-emerald-500/10' : 'bg-white/[0.04]'}`}>
                            <Sparkles className={`w-4 h-4 ${opportunityCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`} />
                        </div>
                    </div>
                    <div className={`text-2xl font-bold ${opportunityCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>{opportunityCount}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Opportunities</div>
                </div>

                {/* Wins */}
                <div className={`bg-white/[0.02] border rounded-2xl p-5 transition-all ${successCount > 0 ? 'border-emerald-500/20 hover:border-emerald-500/30' : 'border-white/[0.06] hover:border-white/[0.1]'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${successCount > 0 ? 'bg-emerald-500/10' : 'bg-white/[0.04]'}`}>
                            <Crown className={`w-4 h-4 ${successCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`} />
                        </div>
                    </div>
                    <div className={`text-2xl font-bold ${successCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>{successCount}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Wins</div>
                </div>
            </motion.div>

            {/* ═══ FILTER BAR ═══ */}
            <motion.div variants={fadeUp} className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 mr-2">
                    <Filter className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs text-zinc-500 font-medium">Filter:</span>
                </div>
                {/* Category filters */}
                <button onClick={() => setFilterCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterCategory === 'all' ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'}`}>
                    All
                </button>
                {Object.entries(categoryConfig).map(([key, cfg]) => {
                    const count = alerts.filter(a => a.category === key).length;
                    return (
                        <button key={key} onClick={() => setFilterCategory(key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${filterCategory === key ? 'bg-white/[0.08] text-white border border-white/[0.1]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'}`}>
                            <cfg.icon className={`w-3 h-3 ${cfg.color}`} />
                            {cfg.label}
                            {count > 0 && <span className="text-[9px] bg-white/[0.06] px-1.5 py-0.5 rounded-full">{count}</span>}
                        </button>
                    );
                })}

                <div className="w-px h-5 bg-white/[0.06] mx-1" />

                {/* Severity filters */}
                {(['critical', 'warning', 'info', 'success'] as const).map(sev => {
                    const count = alerts.filter(a => a.severity === sev).length;
                    if (count === 0) return null;
                    const cfg = severityStyles[sev];
                    return (
                        <button key={sev} onClick={() => setFilterSeverity(filterSeverity === sev ? 'all' : sev)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 border ${filterSeverity === sev ? cfg.badge + ' ' + cfg.border : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${cfg.pulse}`} />
                            {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                        </button>
                    );
                })}
            </motion.div>

            {/* ═══ ALERTS FEED ═══ */}
            <motion.div variants={fadeUp}>
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Active Alerts</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 font-medium">
                        {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {filteredAlerts.length === 0 ? (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white mb-1">All clear!</h3>
                        <p className="text-xs text-zinc-500">
                            {filterCategory !== 'all' || filterSeverity !== 'all'
                                ? 'No alerts match your current filters.'
                                : 'No issues detected. Your site is performing well.'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {filteredAlerts.map((alert) => {
                                const cfg = severityStyles[alert.severity];
                                const Icon = cfg.icon;
                                const catCfg = categoryConfig[alert.category];
                                const isExpanded = expandedAlert === alert.id;

                                return (
                                    <motion.div
                                        key={alert.id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className={`${cfg.bg} border ${cfg.border} rounded-xl overflow-hidden transition-all duration-200 hover:bg-opacity-10 cursor-pointer group`}
                                        onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                                    >
                                        <div className="p-4">
                                            <div className="flex items-start gap-3">
                                                {/* Icon */}
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
                                                    <Icon className={`w-4 h-4 ${cfg.text}`} />
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <h3 className="text-sm font-semibold text-white">{alert.title}</h3>
                                                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${cfg.badge}`}>
                                                            {alert.severity}
                                                        </span>
                                                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 font-medium flex items-center gap-1">
                                                            <catCfg.icon className="w-2.5 h-2.5" />
                                                            {catCfg.label}
                                                        </span>
                                                    </div>

                                                    {/* Change indicator */}
                                                    {alert.change !== undefined && (
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            {alert.metric && <span className="text-xs text-zinc-400">{alert.metric}</span>}
                                                            <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${alert.change >= 0 ? (alert.type === 'ranking_loss' ? 'text-red-400' : 'text-emerald-400') : 'text-red-400'}`}>
                                                                {alert.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                                {alert.change > 0 ? '+' : ''}{alert.change}%
                                                            </span>
                                                        </div>
                                                    )}
                                                    {!alert.change && alert.metric && (
                                                        <span className="text-xs text-zinc-500">{alert.metric}</span>
                                                    )}
                                                </div>

                                                {/* Expand chevron */}
                                                <ChevronRight className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                            </div>

                                            {/* Expanded detail */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="mt-3 pt-3 border-t border-white/[0.04]">
                                                            <p className="text-xs text-zinc-400 leading-relaxed">{alert.description}</p>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </motion.div>

            {/* ═══ OPPORTUNITIES TABLE ═══ */}
            {opportunities.length > 0 && (
                <motion.div variants={fadeUp}>
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-violet-400" />
                        <h2 className="text-sm font-semibold text-white">Top Opportunities</h2>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">
                            {opportunities.length} keywords
                        </span>
                    </div>

                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-zinc-500 border-b border-white/[0.06]">
                                        <th className="text-left py-3 px-4 font-medium">Keyword</th>
                                        <th className="text-right py-3 px-4 font-medium">Position</th>
                                        <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">Impressions</th>
                                        <th className="text-right py-3 px-4 font-medium hidden md:table-cell">Current CTR</th>
                                        <th className="text-right py-3 px-4 font-medium">Potential Clicks</th>
                                        <th className="text-right py-3 px-4 font-medium hidden lg:table-cell">Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {opportunities.map((opp, i) => {
                                        const typeLabels = {
                                            striking_distance: { label: 'Striking Distance', style: 'bg-violet-500/10 text-violet-400' },
                                            ctr_fix: { label: 'CTR Fix', style: 'bg-amber-500/10 text-amber-400' },
                                            quick_win: { label: 'Quick Win', style: 'bg-emerald-500/10 text-emerald-400' },
                                            rising: { label: 'Rising', style: 'bg-blue-500/10 text-blue-400' },
                                        };
                                        const typeInfo = typeLabels[opp.type];

                                        return (
                                            <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition group">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <Search className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                                                        <span className="text-zinc-300 font-medium truncate max-w-[200px]">{opp.query}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right py-3 px-4">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${opp.position <= 5 ? 'bg-emerald-400/10 text-emerald-400'
                                                        : opp.position <= 10 ? 'bg-amber-400/10 text-amber-400'
                                                            : 'bg-red-400/10 text-red-400'
                                                        }`}>
                                                        #{opp.position.toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="text-right py-3 px-4 text-zinc-400 hidden sm:table-cell">{opp.impressions.toLocaleString()}</td>
                                                <td className="text-right py-3 px-4 text-zinc-400 hidden md:table-cell">{opp.ctr}%</td>
                                                <td className="text-right py-3 px-4">
                                                    <span className="text-emerald-400 font-semibold">+{opp.potentialClicks.toLocaleString()}</span>
                                                </td>
                                                <td className="text-right py-3 px-4 hidden lg:table-cell">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeInfo.style}`}>
                                                        {typeInfo.label}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══ INSIGHT CARDS ═══ */}
            <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* CTR Benchmark Card */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <MousePointer className="w-4 h-4 text-violet-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">CTR Benchmark</h3>
                    </div>
                    {(() => {
                        const queries = seoData?.queries || [];
                        const top5 = queries.filter((q: any) => q.position <= 5 && q.impressions > 50);
                        const avgCtr = top5.length > 0 ? top5.reduce((s: number, q: any) => s + q.ctr, 0) / top5.length : 0;
                        const benchmark = 18.0;
                        const good = avgCtr >= benchmark;
                        return (
                            <div>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className={`text-2xl font-bold ${good ? 'text-emerald-400' : 'text-amber-400'}`}>{avgCtr.toFixed(1)}%</span>
                                    <span className="text-xs text-zinc-500">vs {benchmark}% avg</span>
                                </div>
                                <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                                    <div className={`h-full rounded-full transition-all ${good ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-amber-400'}`}
                                        style={{ width: `${Math.min(100, (avgCtr / 30) * 100)}%` }} />
                                </div>
                                <p className="text-[10px] text-zinc-600">
                                    {good ? 'Above average! Your titles & descriptions are performing well.' : 'Below average. Consider rewriting meta titles and descriptions.'}
                                </p>
                            </div>
                        );
                    })()}
                </div>

                {/* Keyword Distribution */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Hash className="w-4 h-4 text-blue-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">Keyword Distribution</h3>
                    </div>
                    {(() => {
                        const queries = seoData?.queries || [];
                        const buckets = [
                            { label: 'Top 3', count: queries.filter((q: any) => q.position <= 3).length, color: 'bg-emerald-400' },
                            { label: 'Pos 4–10', count: queries.filter((q: any) => q.position > 3 && q.position <= 10).length, color: 'bg-cyan-400' },
                            { label: 'Pos 11–20', count: queries.filter((q: any) => q.position > 10 && q.position <= 20).length, color: 'bg-amber-400' },
                            { label: 'Pos 20+', count: queries.filter((q: any) => q.position > 20).length, color: 'bg-zinc-600' },
                        ];
                        const total = Math.max(1, queries.length);
                        return (
                            <div className="space-y-2.5">
                                {buckets.map(b => (
                                    <div key={b.label}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-zinc-400">{b.label}</span>
                                            <span className="text-xs font-semibold text-zinc-300">{b.count} <span className="text-zinc-600">({Math.round((b.count / total) * 100)}%)</span></span>
                                        </div>
                                        <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${b.color} transition-all duration-500`}
                                                style={{ width: `${(b.count / total) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* Quick Trend */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.1] transition">
                    <div className="flex items-center gap-2.5 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">14-Day Trend</h3>
                    </div>
                    {trendData.length > 2 ? (
                        <div className="h-[80px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <Tooltip content={({ active, payload }) =>
                                        active && payload?.[0] ? (
                                            <div className="bg-zinc-900 border border-white/[0.1] rounded px-2 py-1 text-[10px] text-zinc-300">
                                                {payload[0].value?.toLocaleString()} clicks
                                            </div>
                                        ) : null
                                    } />
                                    <Area type="monotone" dataKey="v" stroke="#34d399" fill="url(#trendGrad)" strokeWidth={2} dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="text-xs text-zinc-600">Not enough data to show trend</p>
                    )}
                </div>
            </motion.div>

            {/* ═══ BOTTOM: What's Working ═══ */}
            {(() => {
                const queries = seoData?.queries || [];
                const topPerformers = queries.filter((q: any) => q.position <= 3 && q.clicks > 5).slice(0, 5);
                if (topPerformers.length === 0) return null;
                return (
                    <motion.div variants={fadeUp} className="bg-gradient-to-r from-emerald-500/[0.04] to-cyan-500/[0.04] border border-emerald-500/[0.12] rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Crown className="w-4 h-4 text-emerald-400" />
                            <h2 className="text-sm font-semibold text-white">What&apos;s Working</h2>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Top performers</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {topPerformers.map((q: any, i: number) => (
                                <div key={i} className="bg-white/[0.03] border border-emerald-500/[0.1] rounded-xl p-3">
                                    <div className="flex items-center gap-1 mb-2">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-bold">#{q.position.toFixed(0)}</span>
                                        <Flame className="w-3 h-3 text-amber-400" />
                                    </div>
                                    <p className="text-xs text-zinc-300 font-medium truncate mb-1">{q.query}</p>
                                    <p className="text-[10px] text-zinc-500">{q.clicks} clicks · {q.impressions.toLocaleString()} imp</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                );
            })()}

        </motion.div>
    );
}
