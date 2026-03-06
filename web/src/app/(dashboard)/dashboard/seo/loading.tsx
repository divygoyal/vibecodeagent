export default function Loading() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-xl" />
                    <div className="space-y-1.5">
                        <div className="skeleton h-5 w-32" />
                        <div className="skeleton h-3 w-48" />
                    </div>
                </div>
                <div className="skeleton h-8 w-24 rounded-lg" />
            </div>

            {/* KPI Cards - 6 cards in grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
            </div>

            {/* Trend Chart */}
            <div className="skeleton h-72 rounded-2xl" />

            {/* Two-column: Queries table + Pages table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="skeleton h-80 rounded-2xl" />
                <div className="skeleton h-80 rounded-2xl" />
            </div>

            {/* Recommendations */}
            <div className="skeleton h-48 rounded-2xl" />
        </div>
    );
}
