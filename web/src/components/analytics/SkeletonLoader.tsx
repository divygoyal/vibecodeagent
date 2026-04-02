'use client';

const CHART_BAR_HEIGHTS = [26, 32, 38, 30, 44, 52, 36, 58, 48, 62, 40, 34, 46, 56, 42, 64, 50, 36, 54, 60, 42, 68, 46, 58, 40, 62, 34, 48, 56, 44];

export function SkeletonPulse({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />
    );
}

export function SkeletonKPIStrip() {
    return (
        <div className="analytics-loading-card overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="min-h-[150px] border-b border-white/[0.05] px-4 py-4 xl:border-b-0 xl:border-r xl:border-white/[0.05]">
                    <SkeletonPulse className="h-3 w-16" />
                        <SkeletonPulse className="mt-4 h-8 w-24" />
                        <SkeletonPulse className="mt-3 h-5 w-16 rounded-full" />
                        <SkeletonPulse className="mt-6 h-10 w-full rounded-2xl" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SkeletonChart() {
    return (
        <div className="analytics-loading-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SkeletonPulse className="h-5 w-40" />
                <div className="flex gap-2">
                    <SkeletonPulse className="h-9 w-20 rounded-full" />
                    <SkeletonPulse className="h-9 w-16 rounded-full" />
                </div>
            </div>
            <div className="mt-5 flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonPulse key={i} className="h-8 w-24 rounded-full" />
                ))}
            </div>
            <div className="mt-6 h-[300px] flex items-end gap-1 px-2">
                {Array.from({ length: 30 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex-1 animate-pulse rounded-t-xl bg-white/[0.05]"
                        style={{ height: `${CHART_BAR_HEIGHTS[i % CHART_BAR_HEIGHTS.length]}%`, animationDelay: `${i * 50}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
    return (
        <div className="analytics-loading-card p-5 space-y-3">
            <SkeletonPulse className="h-4 w-32" />
            <div className="flex items-center justify-between">
                <SkeletonPulse className="h-8 w-40 rounded-full" />
                <SkeletonPulse className="h-8 w-20 rounded-full" />
            </div>
            <SkeletonPulse className="h-8 w-full rounded-xl" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] px-3 py-3">
                    <SkeletonPulse className="h-5 w-5 rounded-full" />
                    <SkeletonPulse className="h-4 flex-1" />
                    <SkeletonPulse className="h-4 w-14" />
                    <SkeletonPulse className="h-4 w-10" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="analytics-main-page space-y-5 animate-in fade-in duration-300">
            <SkeletonKPIStrip />
            <SkeletonChart />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <SkeletonTable rows={6} />
                <SkeletonTable rows={6} />
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <SkeletonTable rows={3} />
                <SkeletonTable rows={3} />
                <SkeletonTable rows={3} />
            </div>
        </div>
    );
}
