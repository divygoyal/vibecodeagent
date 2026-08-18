export default function Loading() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header with filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-xl" />
                    <div className="space-y-1.5">
                        <div className="skeleton h-5 w-28" />
                        <div className="skeleton h-3 w-44" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="skeleton h-8 w-28 rounded-lg" />
                    <div className="skeleton h-8 w-24 rounded-lg" />
                </div>
            </div>

            {/* KPI Cards - 4 cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="skeleton h-28 rounded-2xl" />
                ))}
            </div>

            {/* Traffic Chart */}
            <div className="skeleton h-72 rounded-2xl" />

            {/* Two-column: breakdown tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="skeleton h-72 rounded-2xl" />
                <div className="skeleton h-72 rounded-2xl" />
            </div>

            {/* World Map + Device/Browser */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="skeleton h-64 rounded-2xl lg:col-span-2" />
                <div className="skeleton h-64 rounded-2xl" />
            </div>
        </div>
    );
}
