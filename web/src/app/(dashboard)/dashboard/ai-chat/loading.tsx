export default function Loading() {
    return (
        <div className="flex flex-col h-full animate-pulse">
            {/* Chat header */}
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-xl" />
                    <div className="space-y-1.5">
                        <div className="skeleton h-5 w-32" />
                        <div className="skeleton h-3 w-40" />
                    </div>
                </div>
                <div className="skeleton h-8 w-20 rounded-lg" />
            </div>

            {/* Chat area with starter prompts */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-lg space-y-4">
                    <div className="skeleton h-6 w-48 mx-auto" />
                    <div className="skeleton h-4 w-64 mx-auto" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="skeleton h-16 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </div>

            {/* Input bar */}
            <div className="p-4 border-t border-white/[0.06]">
                <div className="skeleton h-12 rounded-2xl max-w-3xl mx-auto" />
            </div>
        </div>
    );
}
