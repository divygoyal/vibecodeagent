export default function Loading() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="skeleton w-9 h-9 rounded-xl" />
                <div className="space-y-1.5">
                    <div className="skeleton h-5 w-36" />
                    <div className="skeleton h-3 w-52" />
                </div>
            </div>

            {/* Status Steps */}
            <div className="flex items-center gap-2">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex-1 skeleton h-12 rounded-xl" />
                ))}
            </div>

            {/* Bot Setup Card */}
            <div className="skeleton h-56 rounded-2xl" />

            {/* Capabilities Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
            </div>
        </div>
    );
}
