'use client'

import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { DomainOverviewData, formatBytes } from './types'
import FixWithBotButton from '@/components/FixWithBotButton'
import { buildAskAiUrl } from '@/lib/askAi'

interface PageAnalysisProps {
  data: DomainOverviewData
  domain: string
}

function charColor(len: number, good: number, warn: number) {
  if (len === 0) return 'text-red-400'
  if (len > warn) return 'text-red-400'
  if (len > good) return 'text-amber-400'
  return 'text-emerald-400'
}

export default function PageAnalysis({ data, domain }: PageAnalysisProps) {
  const router = useRouter()
  const meta = data.audit?.meta

  if (!meta) {
    return (
      <div className="premium-card rounded-2xl p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Page Analysis</h3>
        <div className="text-center py-8">
          <FileText className="h-7 w-7 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">No page analysis data available.</p>
        </div>
      </div>
    )
  }

  const stats = [
    { value: meta.wordCount.toLocaleString(), label: 'Words' },
    { value: formatBytes(meta.pageSize), label: 'Size' },
    { value: String(meta.headings.h1), label: 'H1' },
    { value: String(meta.images.total), label: 'Images' },
    { value: String(meta.links.internal), label: 'Int. Links' },
    { value: String(meta.links.external), label: 'Ext. Links' },
  ]

  return (
    <div className="premium-card rounded-2xl p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-5">Page Analysis</h3>

      <div className="space-y-0">
        {/* Title */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Title</span>
              {meta.title ? (
                <span className={`text-[11px] font-medium ${charColor(meta.title.length, 60, 70)}`}>
                  {meta.title.length} chars
                </span>
              ) : (
                <span className="text-[11px] font-medium text-red-400">Missing</span>
              )}
            </div>
            <FixWithBotButton
              label={meta.title ? 'Optimize' : 'Fix'}
              size="sm"
              variant="ghost"
              context={meta.title
                ? `Optimize the title tag for ${domain}. Current: '${meta.title}' (${meta.title.length} chars)`
                : `Add a title tag for ${domain}. The page currently has no title tag set.`}
            />
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed break-all">
            {meta.title || <span className="italic text-red-400/80">No title tag set</span>}
          </p>
        </div>

        <div className="border-t border-[var(--card-border)]" />

        {/* Description */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Description</span>
              {meta.description ? (
                <span className={`text-[11px] font-medium ${charColor(meta.description.length, 160, 180)}`}>
                  {meta.description.length} chars
                </span>
              ) : (
                <span className="text-[11px] font-medium text-red-400">Missing</span>
              )}
            </div>
            <FixWithBotButton
              label={meta.description ? 'Optimize' : 'Fix'}
              size="sm"
              variant="ghost"
              context={meta.description
                ? `Optimize meta description for ${domain}. Current: '${meta.description}' (${meta.description.length} chars)`
                : `Add a meta description for ${domain}. The page currently has no meta description.`}
            />
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed line-clamp-3 break-all">
            {meta.description || <span className="italic text-red-400/80">No meta description set</span>}
          </p>
        </div>

        <div className="border-t border-[var(--card-border)]" />

        {/* Canonical */}
        <div className="py-3">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Canonical</span>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed break-all font-mono mt-1">
            {meta.canonical || <span className="italic text-red-400/80 font-sans">No canonical URL set</span>}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-5">
        {stats.map((s) => (
          <div
            key={s.label}
            onClick={() => {
              router.push(buildAskAiUrl(`Analyze the ${s.label} metric for ${domain}. Current value: ${s.value}. Is this good? How can it be improved?`))
            }}
            className="rounded-xl p-4 bg-[var(--card-bg)] border border-[var(--card-border)] cursor-pointer hover:border-emerald-500/30 transition-colors"
          >
            <p className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{s.value}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
