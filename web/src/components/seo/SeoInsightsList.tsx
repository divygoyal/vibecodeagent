'use client';

import {
    AlertTriangle,
    ArrowUpRight,
    BookOpen,
    CheckCircle2,
    FileWarning,
    Lightbulb,
    Shuffle,
    Target,
    Zap,
    type LucideIcon,
} from 'lucide-react';

export interface SeoRecommendation {
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    action: string;
    impact: string;
    page: string | null;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
    content_decay: BookOpen,
    keyword_gap: Target,
    technical: Zap,
    cannibalization: Shuffle,
    opportunity: CheckCircle2,
};

const SEVERITY_TONE: Record<string, { dot: string; chip: string }> = {
    high: { dot: 'bg-red-400', chip: 'border-red-500/20 bg-red-500/10 text-red-400' },
    medium: { dot: 'bg-amber-400', chip: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
    low: { dot: 'bg-blue-400', chip: 'border-blue-500/20 bg-blue-500/10 text-blue-400' },
};

interface SeoInsightsListProps {
    items: SeoRecommendation[];
    emptyMessage?: string;
    maxItems?: number;
}

export default function SeoInsightsList({ items, emptyMessage = 'No insights yet — connect your site and let data accumulate.', maxItems = 5 }: SeoInsightsListProps) {
    const display = items.slice(0, maxItems);

    if (display.length === 0) {
        return (
            <div className="rounded-[16px] border border-white/[0.04] bg-[#0d0e12] px-4 py-6 text-center text-[12px] text-zinc-500">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="grid gap-2.5">
            {display.map((rec) => {
                const Icon = TYPE_ICONS[rec.type] || Lightbulb;
                const tone = SEVERITY_TONE[rec.severity] || SEVERITY_TONE.low;
                const FallbackIcon = rec.severity === 'high' ? AlertTriangle : rec.severity === 'medium' ? FileWarning : Lightbulb;
                return (
                    <div
                        key={rec.id}
                        className="rounded-[16px] border border-white/[0.04] bg-[#0d0e12] px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.06] bg-white/[0.03]">
                                <Icon className="h-3.5 w-3.5 text-zinc-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                                    <p className="text-[13px] font-semibold tracking-tight text-white">{rec.title}</p>
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${tone.chip}`}>
                                        <FallbackIcon className="h-2.5 w-2.5" />
                                        {rec.severity}
                                    </span>
                                </div>
                                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{rec.description}</p>
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-300">
                                    <ArrowUpRight className="h-3 w-3" />
                                    <span className="font-medium">{rec.action}</span>
                                    <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                                        {rec.impact}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
