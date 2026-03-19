'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScanSearch, Loader2 } from 'lucide-react'

interface DomainInputBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  recentDomains?: string[]
}

const placeholders = ['example.com', 'yoursite.io', 'competitor.com']

export default function DomainInputBar({
  value,
  onChange,
  onSubmit,
  loading,
  recentDomains,
}: DomainInputBarProps) {
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState(placeholders[0])
  const [charIdx, setCharIdx] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  // Animated placeholder cycling
  useEffect(() => {
    const target = placeholders[placeholderIdx]

    if (!isDeleting && charIdx < target.length) {
      const timeout = setTimeout(() => {
        setDisplayedPlaceholder(target.slice(0, charIdx + 1))
        setCharIdx(charIdx + 1)
      }, 80)
      return () => clearTimeout(timeout)
    }

    if (!isDeleting && charIdx === target.length) {
      const timeout = setTimeout(() => setIsDeleting(true), 2000)
      return () => clearTimeout(timeout)
    }

    if (isDeleting && charIdx > 0) {
      const timeout = setTimeout(() => {
        setDisplayedPlaceholder(target.slice(0, charIdx - 1))
        setCharIdx(charIdx - 1)
      }, 40)
      return () => clearTimeout(timeout)
    }

    if (isDeleting && charIdx === 0) {
      setIsDeleting(false)
      setPlaceholderIdx((prev) => (prev + 1) % placeholders.length)
    }
  }, [charIdx, isDeleting, placeholderIdx])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) onSubmit()
    },
    [loading, onSubmit]
  )

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Input */}
        <div className="relative flex-1">
          <ScanSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder={displayedPlaceholder}
            className="w-full rounded-xl bg-white/[0.03] border border-white/[0.06] pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-all focus:border-emerald-500/30 focus:ring-2 focus:ring-emerald-500/30 focus:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Analyze button */}
        <button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-semibold px-6 py-2.5 rounded-xl hover:shadow-lg hover:shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Recent domains */}
      {recentDomains && recentDomains.length > 0 && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Recent:
          </span>
          {recentDomains.map((d) => (
            <button
              key={d}
              onClick={() => onChange(d)}
              disabled={loading}
              className="inline-flex items-center rounded-lg bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/20 hover:bg-emerald-500/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
