'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Zap, Globe, Target } from 'lucide-react';

interface InsightProps {
    kpis: any;
    countries: any[];
    channels: any[];
    pages: any[];
    devices: any[];
    browsers: any[];
    referrers: any[];
}

interface Insight {
    type: 'positive' | 'negative' | 'warning' | 'info';
    icon: React.ReactNode;
    text: string;
    priority: number;
}

const ICONS = {
    positive: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,
    negative: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
    info: <Zap className="w-3.5 h-3.5 text-blue-400" />,
};

const TYPE_COLORS = {
    positive: 'border-emerald-500/20 bg-emerald-500/[0.03]',
    negative: 'border-red-500/20 bg-red-500/[0.03]',
    warning: 'border-amber-500/20 bg-amber-500/[0.03]',
    info: 'border-blue-500/20 bg-blue-500/[0.03]',
};

function generateInsights({ kpis, countries, channels, pages, devices, browsers, referrers }: InsightProps): Insight[] {
    const insights: Insight[] = [];

    if (!kpis) return insights;

    // User growth
    if (kpis.changeUsers > 10) {
        insights.push({
            type: 'positive', icon: ICONS.positive, priority: 10,
            text: `Visitor traffic is up ${kpis.changeUsers}% compared to previous period. Growth is accelerating.`,
        });
    } else if (kpis.changeUsers < -10) {
        insights.push({
            type: 'negative', icon: ICONS.negative, priority: 10,
            text: `Visitor traffic dropped ${Math.abs(kpis.changeUsers)}%. Investigate potential issues with top traffic sources.`,
        });
    }

    // Bounce rate
    if (kpis.avgBounceRate > 60) {
        insights.push({
            type: 'warning', icon: ICONS.warning, priority: 8,
            text: `Bounce rate is high at ${kpis.avgBounceRate}%. Consider improving page load speed and content relevance.`,
        });
    } else if (kpis.avgBounceRate < 30) {
        insights.push({
            type: 'positive', icon: ICONS.positive, priority: 6,
            text: `Excellent bounce rate of ${kpis.avgBounceRate}%. Visitors are engaging well with your content.`,
        });
    }

    // Session duration
    if (kpis.avgSessionDuration > 180) {
        insights.push({
            type: 'positive', icon: ICONS.positive, priority: 5,
            text: `Average session duration is ${Math.floor(kpis.avgSessionDuration / 60)}m ${Math.round(kpis.avgSessionDuration % 60)}s — strong engagement signal.`,
        });
    } else if (kpis.avgSessionDuration < 30) {
        insights.push({
            type: 'warning', icon: ICONS.warning, priority: 7,
            text: `Sessions averaging under 30 seconds. Content may not be meeting visitor expectations.`,
        });
    }

    // Geo concentration
    if (countries.length > 0) {
        const total = countries.reduce((s: number, c: any) => s + (c.users || 0), 0);
        const topPct = Math.round(((countries[0]?.users || 0) / Math.max(total, 1)) * 100);
        if (topPct > 70) {
            insights.push({
                type: 'warning', icon: ICONS.warning, priority: 6,
                text: `${topPct}% of traffic comes from ${countries[0]?.country}. High geographic concentration increases risk.`,
            });
        }
        if (countries.length >= 10) {
            insights.push({
                type: 'info', icon: ICONS.info, priority: 3,
                text: `Traffic from ${countries.length} countries. Good international diversity.`,
            });
        }
    }

    // Channel insights
    if (channels.length > 0) {
        const organic = channels.find((c: any) => c.name?.toLowerCase().includes('organic'));
        const direct = channels.find((c: any) => c.name?.toLowerCase().includes('direct'));
        const total = channels.reduce((s: number, c: any) => s + (c.value || 0), 0);

        if (organic && total > 0) {
            const organicPct = Math.round((organic.value / total) * 100);
            if (organicPct > 50) {
                insights.push({
                    type: 'positive', icon: ICONS.positive, priority: 7,
                    text: `Organic search drives ${organicPct}% of traffic. Strong SEO performance.`,
                });
            }
        }

        if (direct && total > 0) {
            const directPct = Math.round((direct.value / total) * 100);
            if (directPct > 40) {
                insights.push({
                    type: 'info', icon: ICONS.info, priority: 4,
                    text: `${directPct}% direct traffic suggests strong brand awareness.`,
                });
            }
        }
    }

    // Device insights
    if (devices.length > 0) {
        const mobile = devices.find((d: any) => d.device?.toLowerCase() === 'mobile');
        const total = devices.reduce((s: number, d: any) => s + (d.sessions || 0), 0);
        if (mobile && total > 0) {
            const mobilePct = Math.round((mobile.sessions / total) * 100);
            if (mobilePct > 60) {
                insights.push({
                    type: 'info', icon: ICONS.info, priority: 5,
                    text: `Mobile dominates at ${mobilePct}%. Ensure mobile UX is optimized.`,
                });
            }
        }
    }

    // Top page bounce analysis
    if (pages.length > 0) {
        const highBouncePage = pages.find((p: any) => (p.bounceRate || 0) > 70 && (p.views || 0) > 100);
        if (highBouncePage) {
            insights.push({
                type: 'warning', icon: ICONS.warning, priority: 8,
                text: `"${highBouncePage.page}" has ${highBouncePage.bounceRate}% bounce with ${highBouncePage.views} views. High-impact optimization opportunity.`,
            });
        }
    }

    // Referrer insight
    if (referrers.length > 0) {
        const topRef = referrers[0];
        insights.push({
            type: 'info', icon: ICONS.info, priority: 3,
            text: `Top referrer "${topRef.name}" sent ${topRef.value?.toLocaleString()} visitors. Consider deepening this partnership.`,
        });
    }

    // Returning users
    if (kpis.returningUsers && kpis.totalUsers) {
        const retPct = Math.round((kpis.returningUsers / kpis.totalUsers) * 100);
        if (retPct > 40) {
            insights.push({
                type: 'positive', icon: ICONS.positive, priority: 5,
                text: `${retPct}% returning visitors — strong audience loyalty and retention.`,
            });
        } else if (retPct < 15) {
            insights.push({
                type: 'warning', icon: ICONS.warning, priority: 6,
                text: `Only ${retPct}% returning visitors. Consider email capture and retargeting to improve retention.`,
            });
        }
    }

    return insights.sort((a, b) => b.priority - a.priority);
}

export default function AIInsightEngine(props: InsightProps) {
    const insights = useMemo(() => generateInsights(props), [props.kpis, props.countries, props.channels, props.pages, props.devices, props.browsers, props.referrers]);

    if (insights.length === 0) return null;

    return (
        <div className="bg-[var(--card-bg)] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">AI Insights</h3>
                <span className="text-[10px] text-zinc-600 ml-auto">{insights.length} insights generated</span>
            </div>
            <div className="divide-y divide-white/[0.03]">
                {insights.slice(0, 6).map((insight, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className={`px-5 py-3 ${TYPE_COLORS[insight.type]} hover:bg-white/[0.02] transition`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">{insight.icon}</div>
                            <p className="text-xs text-zinc-300 leading-relaxed">{insight.text}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
