'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, LineChart, Sparkles } from 'lucide-react';

import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';

type AnalyticsTone = 'emerald' | 'cyan' | 'amber' | 'mixed';

const toneStyles: Record<AnalyticsTone, { icon: string; badge: string }> = {
    emerald: {
        icon: 'border border-[#37E6C7]/20 bg-[#37E6C7]/10 text-[#37E6C7]',
        badge: 'border-[#37E6C7]/20 bg-[#37E6C7]/10 text-[#37E6C7]',
    },
    cyan: {
        icon: 'border border-[#C07DFF]/20 bg-[#C07DFF]/10 text-[#C07DFF]',
        badge: 'border-[#C07DFF]/20 bg-[#C07DFF]/10 text-[#C07DFF]',
    },
    amber: {
        icon: 'border border-amber-500/20 bg-amber-500/10 text-amber-400',
        badge: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
    },
    mixed: {
        icon: 'border border-white/[0.06] bg-white/[0.03] text-zinc-300',
        badge: 'border-white/[0.06] bg-white/[0.03] text-zinc-300',
    },
};

export function formatCompactNumber(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    return value.toLocaleString();
}

export function formatPercent(value: number, digits = 1) {
    return `${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (minutes === 0) {
        return `${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

export function AnalyticsSubpageShell({
    eyebrow,
    title,
    description,
    actions,
    children,
}: {
    eyebrow: string;
    title: string;
    description: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between mb-8">
                <div>
                    <h1 className="text-[28px] font-semibold tracking-tight text-white drop-shadow-sm">
                        {title}
                    </h1>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
                        {description}
                    </p>
                </div>

                {actions ? <div className="flex items-center gap-3 shrink-0">{actions}</div> : null}
            </div>

            {children}
        </div>
    );
}

export function AnalyticsSubpagePanel({
    title,
    description,
    action,
    children,
    tone = 'mixed',
    className = '',
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
    tone?: AnalyticsTone;
    className?: string;
}) {
    return (
        <DashboardHoverSurface
            as="section"
            tone={tone}
            className={`flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-6 shadow-sm ${className}`.trim()}
        >
            <div className="mb-6 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="text-[1rem] font-semibold tracking-[-0.025em] text-white">
                        {title}
                    </h2>
                    {description ? (
                        <p className="mt-1 text-[12px] font-medium leading-5 text-zinc-500 sm:text-[12px]">
                            {description}
                        </p>
                    ) : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>

            {children}
        </DashboardHoverSurface>
    );
}

export function AnalyticsSubpageMetricGrid({ children }: { children: ReactNode }) {
    return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function AnalyticsSubpageMetricCard({
    label,
    value,
    helper,
    icon: Icon,
    tone = 'mixed',
    accent,
    trend,
}: {
    label: string;
    value: string;
    helper?: string;
    icon: LucideIcon;
    tone?: AnalyticsTone;
    accent?: ReactNode;
    trend?: number;
}) {
    const trendAccent = typeof trend === 'number'
        ? (
            <AnalyticsSubpageBadge
                label={`${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`}
                tone={trend >= 0 ? 'emerald' : 'amber'}
                icon={LineChart}
            />
        )
        : null;

    return (
        <DashboardHoverSurface
            className="flex flex-col rounded-[20px] border border-white/[0.04] bg-[#111216] p-5 shadow-sm"
            tone={tone}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[12px] ${toneStyles[tone].icon}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-[12px] font-semibold text-zinc-400">
                        {label}
                    </p>
                    <p className="mt-2 truncate text-[1.9rem] font-semibold leading-none tracking-[-0.05em] text-white">
                        {value}
                    </p>
                    {helper ? (
                        <p className="mt-1.5 text-[12px] font-medium leading-5 text-zinc-500">
                            {helper}
                        </p>
                    ) : null}
                </div>

                {(accent || trendAccent) ? <div className="shrink-0">{accent || trendAccent}</div> : null}
            </div>
        </DashboardHoverSurface>
    );
}

export function AnalyticsSubpageBadge({
    label,
    tone = 'mixed',
    icon: Icon,
}: {
    label: string;
    tone?: AnalyticsTone;
    icon?: LucideIcon;
}) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-[11px] border px-3 py-1.5 text-[11px] font-semibold ${toneStyles[tone].badge}`}>
            {Icon ? <Icon className="h-3 w-3" /> : null}
            {label}
        </span>
    );
}

export function AnalyticsInsightList({
    items,
}: {
    items: Array<{ label: string; value: string; note?: string }>;
}) {
    return (
        <div className="grid gap-2.5">
            {items.map((item) => (
                <div
                    key={`${item.label}-${item.value}`}
                    className="rounded-[16px] border border-white/[0.04] bg-[#111216] px-4 py-3.5"
                >
                    <p className="text-[11px] font-semibold text-zinc-400">
                        {item.label}
                    </p>
                    <p className="mt-2 text-[1.02rem] font-semibold tracking-[-0.025em] text-white">
                        {item.value}
                    </p>
                    {item.note ? (
                        <p className="mt-1.5 text-[12px] font-medium leading-5 text-zinc-500">
                            {item.note}
                        </p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export function AnalyticsSubpageEmptyState({
    title,
    description,
}: {
    title: string;
    description: string;
}) {
    return (
        <div className="rounded-[20px] border border-white/[0.04] bg-[#111216] px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] border border-white/[0.06] bg-white/[0.02]">
                <LineChart className="h-5 w-5 text-zinc-400" />
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-white">{title}</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm font-medium text-zinc-500">
                {description}
            </p>
        </div>
    );
}

export function AnalyticsSubpageLoadingState({
    title,
    cards = 4,
}: {
    title: string;
    cards?: number;
}) {
    return (
        <div className="space-y-6">
            <div className="rounded-[20px] border border-white/[0.04] bg-[#111216] px-5 py-5 sm:px-7 sm:py-6 shadow-sm">
                <div className="h-4 w-24 animate-pulse rounded-full bg-white/[0.03]" />
                <div className="mt-4 h-8 w-64 animate-pulse rounded-full bg-white/[0.04]" />
                <div className="mt-3 h-3.5 w-full max-w-xl animate-pulse rounded-full bg-white/[0.03]" />
            </div>

            <AnalyticsSubpagePanel
                title={title}
                description="Loading analytics..."
            >
                <div className={`grid gap-2.5 ${cards > 2 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
                    {Array.from({ length: cards }).map((_, index) => (
                        <div
                            key={index}
                            className="rounded-[16px] border border-white/[0.04] bg-[#111216] px-4 py-4"
                        >
                            <div className="h-9 w-9 animate-pulse rounded-[10px] bg-white/[0.03]" />
                            <div className="mt-4 h-3 w-20 animate-pulse rounded-full bg-white/[0.03]" />
                            <div className="mt-3 h-8 w-28 animate-pulse rounded-full bg-white/[0.04]" />
                        </div>
                    ))}
                </div>
            </AnalyticsSubpagePanel>
        </div>
    );
}

export function AnalyticsSectionLink({
    label,
    href,
    onClick,
}: {
    label: string;
    href?: string;
    onClick?: () => void;
}) {
    const className = 'inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-300 transition hover:text-emerald-200';

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={className}
            >
                {label}
                <ArrowRight className="h-3.5 w-3.5" />
            </button>
        );
    }

    return (
        <a
            href={href}
            className={className}
        >
            {label}
            <ArrowRight className="h-3.5 w-3.5" />
        </a>
    );
}
