'use client';

import { ArrowRight, BookOpen, CheckCircle2, Lightbulb, Shuffle, Sparkles, Target, Zap, type LucideIcon } from 'lucide-react';
import { AnalyticsSubpagePanel } from '@/components/analytics/subpages/AnalyticsSubpageShell';
import type { SeoRecommendation } from './SeoInsightsList';

interface SeoRecommendationsPanelProps {
    items: SeoRecommendation[];
}

const TYPE_ICONS: Record<string, LucideIcon> = {
    content_decay: BookOpen,
    keyword_gap: Target,
    technical: Zap,
    cannibalization: Shuffle,
    opportunity: CheckCircle2,
};

const SEVERITY_BADGE: Record<string, string> = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
};

const SEVERITY_LABEL: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
};

export default function SeoRecommendationsPanel({ items }: SeoRecommendationsPanelProps) {
    const display = items.slice(0, 3);

    return (
        <AnalyticsSubpagePanel
            title="Recommendations"
            description="Highest-impact actions for your site."
        >
            {display.length === 0 ? (
                <div className="rounded-[12px] border border-white/[0.04] bg-[#0a0b0e] px-4 py-6 text-center text-[12px] text-zinc-500">
                    No recommendations yet — connect your site and let data accumulate.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {display.map(rec => {
                        const Icon = TYPE_ICONS[rec.type] || Lightbulb;
                        const sevCls = SEVERITY_BADGE[rec.severity] || SEVERITY_BADGE.low;
                        const sevLabel = SEVERITY_LABEL[rec.severity] || 'Low';
                        return (
                            <div
                                key={rec.id}
                                className="rounded-[14px] border border-white/[0.05] bg-[#0d0e12] px-3.5 py-3 transition-colors hover:border-white/[0.1]"
                            >
                                <div className="flex items-start gap-2.5">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-white/[0.06] bg-white/[0.03]">
                                        <Icon className="h-3.5 w-3.5 text-zinc-300" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[13px] font-semibold leading-snug tracking-tight text-white">
                                                {rec.title}
                                            </p>
                                            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sevCls}`}>
                                                {sevLabel}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-[11.5px] leading-snug text-zinc-500">{rec.description}</p>
                                        <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                                            <Sparkles className="h-3 w-3" />
                                            {rec.impact}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {items.length > 3 ? (
                <button
                    type="button"
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[12px] font-medium text-emerald-300 transition hover:text-emerald-200"
                >
                    View all recommendations
                    <ArrowRight className="h-3 w-3" />
                </button>
            ) : null}
        </AnalyticsSubpagePanel>
    );
}
