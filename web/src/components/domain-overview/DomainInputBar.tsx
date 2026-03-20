'use client'

import { useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface DomainInputBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  recentDomains?: string[]
}

export default function DomainInputBar({
  value,
  onChange,
  onSubmit,
  loading,
  recentDomains,
}: DomainInputBarProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) onSubmit()
    },
    [loading, onSubmit]
  )

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Enter domain to analyze"
            className="w-full rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] pl-10 pr-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold rounded-xl px-5 py-3 hover:shadow-lg hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {recentDomains && recentDomains.length > 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Recent:{' '}
          {recentDomains.map((d, i) => (
            <span key={d}>
              <button
                onClick={() => onChange(d)}
                disabled={loading}
                className="text-[var(--text-secondary)] hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {d}
              </button>
              {i < recentDomains.length - 1 && ', '}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
