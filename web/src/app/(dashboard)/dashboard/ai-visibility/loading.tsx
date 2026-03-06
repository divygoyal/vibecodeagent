export default function Loading() {
    return (
        <div className="space-y-5 animate-pulse">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-xl" />
                    <div className="space-y-1.5">
                        <div className="skeleton h-5 w-28" />
                        <div className="skeleton h-3 w-56" />
                    </div>
                </div>
                <div className="skeleton h-8 w-20 rounded-lg" />
            </div>

            {/* Explainer Banner */}
            <div className="skeleton h-20 rounded-2xl" />

            {/* GEO Score Hero */}
            <div className="skeleton h-44 rounded-2xl" />

            {/* Platform Cards - 4 across */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton h-32 rounded-2xl" />
                ))}
            </div>

            {/* Dimension Breakdown + Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="skeleton h-64 rounded-2xl" />
                <div className="skeleton h-64 rounded-2xl" />
            </div>

            {/* Competitor Intelligence */}
            <div className="skeleton h-56 rounded-2xl" />
        </div>
    );
}
