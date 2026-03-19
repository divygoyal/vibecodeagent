'use client'

import { FileText, Type, AlignLeft, Link2, Image, Hash, FileCode, ArrowUpRight } from 'lucide-react'
import { DomainOverviewData, formatBytes } from './types'
import FixWithBotButton from '@/components/FixWithBotButton'

interface PageAnalysisProps {
  data: DomainOverviewData
  domain: string
}

function titleCharBadge(length: number) {
  let cls = 'bg-emerald-500/10 text-emerald-400'
  if (length > 70) cls = 'bg-red-500/10 text-red-400'
  else if (length > 60) cls = 'bg-amber-500/10 text-amber-400'
  return (
    <span className={`ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {length} chars
    </span>
  )
}

function descCharBadge(length: number) {
  let cls = 'bg-emerald-500/10 text-emerald-400'
  if (length > 180) cls = 'bg-red-500/10 text-red-400'
  else if (length > 160) cls = 'bg-amber-500/10 text-amber-400'
  return (
    <span className={`ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {length} chars
    </span>
  )
}

export default function PageAnalysis({ data, domain }: PageAnalysisProps) {
  const meta = data.audit?.meta

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <FileText className="h-4 w-4 text-zinc-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">Page Analysis</h3>
      </div>

      {meta ? (
        <div className="space-y-4">
          {/* Meta Info */}
          <div className="space-y-2.5">
            {/* Title */}
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Title
                  </span>
                  {meta.title && titleCharBadge(meta.title.length)}
                </div>
                {meta.title && (
                  <FixWithBotButton
                    label="Optimize"
                    size="sm"
                    variant="ghost"
                    context={`Optimize the title tag for ${domain}. Current: '${meta.title}' (${meta.title.length} chars)`}
                  />
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1 break-all">
                {meta.title || <span className="text-red-400">Not set</span>}
              </p>
            </div>

            {/* Description */}
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Description
                  </span>
                  {meta.description && descCharBadge(meta.description.length)}
                </div>
                {meta.description && (
                  <FixWithBotButton
                    label="Optimize"
                    size="sm"
                    variant="ghost"
                    context={`Optimize meta description for ${domain}. Current: '${meta.description}' (${meta.description.length} chars)`}
                  />
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1 line-clamp-3 break-all">
                {meta.description || <span className="text-red-400">Not set</span>}
              </p>
            </div>

            {/* Canonical */}
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Canonical
                </span>
                {!meta.canonical && (
                  <FixWithBotButton
                    label="Fix"
                    size="sm"
                    variant="ghost"
                    context={`Set up canonical URL for ${domain}`}
                  />
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1 break-all">
                {meta.canonical || <span className="text-red-400">Not set</span>}
              </p>
            </div>
          </div>

          {/* Stats Grid (3x2) */}
          <div className="grid grid-cols-3 gap-2">
            {/* Word Count */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">{meta.wordCount.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Word Count</p>
            </div>

            {/* Page Size */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">{formatBytes(meta.pageSize)}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Page Size</p>
            </div>

            {/* H1 Tags */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">{meta.headings.h1}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">H1 Tags</p>
            </div>

            {/* Images */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">
                {meta.images.withAlt}/{meta.images.total}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Images</p>
              {meta.images.withoutAlt > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-amber-400">{meta.images.withoutAlt} missing alt</span>
                  <FixWithBotButton
                    label="Fix"
                    size="sm"
                    variant="ghost"
                    context={`Fix ${meta.images.withoutAlt} images missing alt text on ${domain}. Add descriptive alt attributes for better SEO and accessibility.`}
                  />
                </div>
              )}
            </div>

            {/* Internal Links */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">{meta.links.internal.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Internal Links</p>
            </div>

            {/* External Links */}
            <div className="stat-card-hover rounded-xl p-3 bg-[var(--card-bg)] border border-[var(--card-border)]">
              <p className="text-lg font-bold text-zinc-200">{meta.links.external.toLocaleString()}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">External Links</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">No page analysis data available.</p>
      )}
    </div>
  )
}
