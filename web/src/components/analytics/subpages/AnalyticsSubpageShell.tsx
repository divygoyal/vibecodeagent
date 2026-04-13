'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, LineChart, Sparkles } from 'lucide-react';

import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';

type AnalyticsTone = 'emerald' | 'cyan' | 'amber' | 'mixed';

const toneStyles: Record<AnalyticsTone, { icon: string; badge: string }> = {
    emerald: {
        icon: 'border border-emerald-500/18 bg-emerald-500/[0.08] text-emerald-300',
        badge: 'border-emerald-500/18 bg-emerald-500/[0.08] text-emerald-200',
    },
    cyan: {
        icon: 'border border-cyan-500/18 bg-cyan-500/[0.08] text-cyan-300',
        badge: 'border-cyan-500/18 bg-cyan-500/[0.08] text-cyan-200',
    },
    amber: {
        icon: 'border border-amber-500/18 bg-amber-500/[0.08] text-amber-300',
        badge: 'border-amber-500/18 bg-amber-500/[0.08] text-amber-200',
    },
    mixed: {
        icon: 'border border-white/[0.08] bg-white/[0.03] text-zinc-200',
        badge: 'border-white/[0.08] bg-white/[0.03] text-zinc-300',
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
        <div className="space-y-3.5 sm:space-y-4">
            <div className="relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#050606] px-5 py-5 shadow-[0_20px_54px_rgba(0,0,0,0.36)] sm:px-6 sm:py-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.06),transparent_32%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.05),transparent_28%)]" />
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-zinc-300">
                            <Sparkles className="h-3 w-3 text-emerald-300" />
                            <span>{eyebrow}</span>
                        </div>
                        <h1 className="text-[1.85rem] font-semibold tracking-[-0.035em] text-white sm:text-[2.2rem]">
                            {title}
                        </h1>
                        <p className="mt-2 max-w-2xl text-[13px] font-medium leading-6 text-zinc-400 sm:text-[13px]">
                            {description}
                        </p>
                    </div>

                    {actions ? <div className="relative shrink-0">{actions}</div> : null}
                </div>
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
            className={`premium-card rounded-[20px] border border-white/[0.075] bg-[#060707] p-4 sm:p-5 ${className}`.trim()}
        >
            <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
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
            className="premium-card rounded-[18px] border border-white/[0.075] bg-[#070808] p-4 sm:p-[18px]"
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
                    className="rounded-[16px] border border-white/[0.07] bg-[#080909] px-4 py-3.5"
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
        <div className="rounded-[22px] border border-white/[0.08] bg-[#060707] px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.03]">
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
        <div className="space-y-4">
            <div className="rounded-[24px] border border-white/[0.08] bg-[#060707] px-5 py-5 sm:px-7 sm:py-6">
                <div className="h-4 w-24 animate-pulse rounded-full bg-white/[0.05]" />
                <div className="mt-4 h-8 w-64 animate-pulse rounded-full bg-white/[0.06]" />
                <div className="mt-3 h-3.5 w-full max-w-xl animate-pulse rounded-full bg-white/[0.04]" />
            </div>

            <AnalyticsSubpagePanel
                title={title}
                description="Loading analytics"
            >
                <div className={`grid gap-2.5 ${cards > 2 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'}`}>
                    {Array.from({ length: cards }).map((_, index) => (
                        <div
                            key={index}
                            className="rounded-[20px] border border-white/[0.06] bg-[#090909] px-4 py-4"
                        >
                            <div className="h-9 w-9 animate-pulse rounded-[14px] bg-white/[0.05]" />
                            <div className="mt-4 h-3 w-20 animate-pulse rounded-full bg-white/[0.04]" />
                            <div className="mt-3 h-8 w-28 animate-pulse rounded-full bg-white/[0.06]" />
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
