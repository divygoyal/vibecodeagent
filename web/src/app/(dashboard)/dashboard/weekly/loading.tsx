/**
 * Weekly Briefing loading skeleton. Matches the analytics/loading.tsx and
 * seo/loading.tsx conventions — `skeleton` class shimmer over the same
 * structural blocks the page will render once data is in.
 */

export default function Loading() {
    return (
        <div className="space-y-8 animate-pulse">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <div className="skeleton h-3 w-32 rounded" />
                    <div className="skeleton h-7 w-56 rounded" />
                    <div className="skeleton h-3 w-72 rounded" />
                </div>
                <div className="skeleton h-9 w-64 rounded-xl" />
            </div>

            {/* Week tabs strip */}
            <div className="flex gap-2 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-16 w-36 rounded-xl flex-shrink-0" />
                ))}
            </div>

            {/* Headline */}
            <div className="space-y-2">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-8 w-2/3 rounded" />
                <div className="skeleton h-3 w-48 rounded" />
            </div>

            {/* Action cards — 3 stacked */}
            <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
            </div>

            {/* KPI tiles — 4 in a row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
            </div>

            {/* Linked artifacts — 2-col */}
            <div className="grid gap-4 lg:grid-cols-2">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="skeleton h-48 rounded-2xl" />
                ))}
            </div>
        </div>
    );
}
