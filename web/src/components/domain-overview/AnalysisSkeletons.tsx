'use client'

/* ─── Shimmer Skeleton Loaders for Domain Overview ─── */

function SkeletonCard({ className }: { className?: string }) {
  return <div className={`shimmer-loading rounded-2xl h-32 ${className || ''}`} />
}

function SkeletonRow() {
  return <div className="shimmer-loading rounded-lg h-12 w-full" />
}

/** Full analysis skeleton matching DomainOverview layout */
export function AnalysisSkeleton() {
  return (
    <div className="space-y-6 cascade-fade">
      {/* Score Overview - 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Core Web Vitals - single row */}
      <div className="shimmer-loading rounded-2xl h-24" />

      {/* Issues + Page Analysis - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
        <SkeletonCard className="h-64" />
      </div>

      {/* Keywords table */}
      <div className="space-y-2">
        <div className="shimmer-loading rounded-lg h-10 w-full" />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>

      {/* Tech + Robots + Sitemap */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

/** Step indicator with spinning/check icons for progress during analysis */
export function AnalysisProgress({ steps }: { steps: { label: string; done: boolean }[] }) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          {step.done ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          )}
          <span
            className={`text-sm ${step.done ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}
