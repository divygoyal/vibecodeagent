'use client';

export function SkeletonPulse({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-white/[0.04] rounded-lg ${className}`} />
    );
}

export function SkeletonKPIStrip() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="bg-[rgba(255,255,255,0.025)] border border-white/[0.06] rounded-2xl p-4 space-y-3">
                    <SkeletonPulse className="h-3 w-16" />
                    <SkeletonPulse className="h-7 w-20" />
                    <SkeletonPulse className="h-3 w-12" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonChart() {
    return (
        <div className="bg-[rgba(255,255,255,0.025)] border border-white/[0.06] rounded-2xl p-5">
            <SkeletonPulse className="h-4 w-32 mb-4" />
            <div className="h-[260px] flex items-end gap-1 px-4">
                {Array.from({ length: 30 }).map((_, i) => (
                    <div
                        key={i}
                        className="flex-1 animate-pulse bg-white/[0.04] rounded-t"
                        // Deterministic — keyed off `i` — so the SSR HTML matches the
                        // first CSR paint and we don't trigger React #418 hydration.
                        style={{ height: `${30 + ((i * 17) % 55)}%`, animationDelay: `${i * 50}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
    return (
        <div className="bg-[rgba(255,255,255,0.025)] border border-white/[0.06] rounded-2xl p-5 space-y-3">
            <SkeletonPulse className="h-4 w-28 mb-4" />
            <SkeletonPulse className="h-8 w-full rounded-lg" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <SkeletonPulse className="h-4 w-4 rounded-full" />
                    <SkeletonPulse className="h-4 flex-1" />
                    <SkeletonPulse className="h-4 w-16" />
                    <SkeletonPulse className="h-4 w-12" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <SkeletonKPIStrip />
            <SkeletonChart />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SkeletonTable rows={6} />
                <SkeletonTable rows={6} />
            </div>
        </div>
    );
}
