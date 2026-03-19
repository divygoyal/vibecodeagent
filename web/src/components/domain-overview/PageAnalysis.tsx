'use client'

import { FileText, Type, AlignLeft, Link2, Image, Hash, Clock, Code2, AlertTriangle } from 'lucide-react'
import { DomainOverviewData, formatBytes } from './types'
import FixWithBotButton from '@/components/FixWithBotButton'

interface PageAnalysisProps {
  data: DomainOverviewData
  domain: string
}

/* ── Character-count helpers ─────────────────────────────────────────── */

function titleStatus(len: number) {
  if (len === 0) return { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', label: '0 chars', pct: 0, bar: 'bg-red-500' }
  if (len > 70) return { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', label: `${len} chars`, pct: 100, bar: 'bg-red-500' }
  if (len > 60) return { cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', label: `${len} chars`, pct: (len / 70) * 100, bar: 'bg-amber-500' }
  return { cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', label: `${len} chars`, pct: (len / 70) * 100, bar: 'bg-emerald-500' }
}

function descStatus(len: number) {
  if (len === 0) return { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', label: '0 chars', pct: 0, bar: 'bg-red-500' }
  if (len > 180) return { cls: 'bg-red-500/15 text-red-400 border border-red-500/20', label: `${len} chars`, pct: 100, bar: 'bg-red-500' }
  if (len > 160) return { cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20', label: `${len} chars`, pct: (len / 180) * 100, bar: 'bg-amber-500' }
  return { cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', label: `${len} chars`, pct: (len / 160) * 100, bar: 'bg-emerald-500' }
}

/* ── Stat card icon mapping ──────────────────────────────────────────── */

const statIcons = [
  { icon: Type,   color: 'from-blue-500 to-blue-600',   bg: 'bg-blue-500/10' },
  { icon: Clock,  color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10' },
  { icon: Hash,   color: 'from-cyan-500 to-cyan-600',   bg: 'bg-cyan-500/10' },
  { icon: Image,  color: 'from-violet-500 to-violet-600', bg: 'bg-violet-500/10' },
  { icon: Link2,  color: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10' },
  { icon: Code2,  color: 'from-rose-500 to-rose-600',   bg: 'bg-rose-500/10' },
]

/* ── Component ───────────────────────────────────────────────────────── */

export default function PageAnalysis({ data, domain }: PageAnalysisProps) {
  const meta = data.audit?.meta

  return (
    <div className="premium-card rounded-2xl p-6 relative overflow-hidden">
      {/* Gradient accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 opacity-60" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/10">
          <FileText className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Page Analysis</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{domain}</p>
        </div>
      </div>

      {meta ? (
        <div className="space-y-5">
          {/* ── Meta Sections ──────────────────────────────────────── */}
          <div className="space-y-3">

            {/* Title */}
            {meta.title ? (() => {
              const st = titleStatus(meta.title.length)
              return (
                <div className="glass-card rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        Title
                      </span>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <FixWithBotButton
                      label="Optimize"
                      size="sm"
                      variant="ghost"
                      context={`Optimize the title tag for ${domain}. Current: '${meta.title}' (${meta.title.length} chars)`}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed break-all">
                    {meta.title}
                  </p>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${st.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(st.pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })() : (
              <div className="rounded-xl p-4 space-y-2 border-2 border-dashed border-red-500/30 bg-red-500/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Title
                    </span>
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                      Missing
                    </span>
                  </div>
                  <FixWithBotButton
                    label="Fix"
                    size="sm"
                    variant="solid"
                    context={`Add a title tag for ${domain}. The page currently has no title tag set.`}
                  />
                </div>
                <p className="text-[13px] text-red-400/80 italic">No title tag set</p>
              </div>
            )}

            {/* Description */}
            {meta.description ? (() => {
              const st = descStatus(meta.description.length)
              return (
                <div className="glass-card rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                        Description
                      </span>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <FixWithBotButton
                      label="Optimize"
                      size="sm"
                      variant="ghost"
                      context={`Optimize meta description for ${domain}. Current: '${meta.description}' (${meta.description.length} chars)`}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-3 break-all">
                    {meta.description}
                  </p>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${st.bar} transition-all duration-500`}
                      style={{ width: `${Math.min(st.pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })() : (
              <div className="rounded-xl p-4 space-y-2 border-2 border-dashed border-red-500/30 bg-red-500/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Description
                    </span>
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                      Missing
                    </span>
                  </div>
                  <FixWithBotButton
                    label="Fix"
                    size="sm"
                    variant="solid"
                    context={`Add a meta description for ${domain}. The page currently has no meta description.`}
                  />
                </div>
                <p className="text-[13px] text-red-400/80 italic">No meta description set</p>
              </div>
            )}

            {/* Canonical */}
            {meta.canonical ? (
              <div className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                    Canonical URL
                  </span>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed break-all font-mono">
                  {meta.canonical}
                </p>
              </div>
            ) : (
              <div className="rounded-xl p-4 space-y-2 border-2 border-dashed border-red-500/30 bg-red-500/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Canonical URL
                    </span>
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                      Missing
                    </span>
                  </div>
                  <FixWithBotButton
                    label="Fix"
                    size="sm"
                    variant="solid"
                    context={`Set up canonical URL for ${domain}`}
                  />
                </div>
                <p className="text-[13px] text-red-400/80 italic">No canonical URL set</p>
              </div>
            )}
          </div>

          {/* ── Stats Grid (3x2) ──────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Word Count */}
            {(() => {
              const s = statIcons[0]
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{meta.wordCount.toLocaleString()}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Word Count</p>
                </div>
              )
            })()}

            {/* Page Size */}
            {(() => {
              const s = statIcons[1]
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{formatBytes(meta.pageSize)}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Page Size</p>
                </div>
              )
            })()}

            {/* H1 Tags */}
            {(() => {
              const s = statIcons[2]
              const isProblematic = meta.headings.h1 === 0 || meta.headings.h1 > 1
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{meta.headings.h1}</p>
                    {isProblematic && (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">H1 Tags</p>
                </div>
              )
            })()}

            {/* Images */}
            {(() => {
              const s = statIcons[3]
              const hasMissing = meta.images.withoutAlt > 0
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-violet-400" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {meta.images.withAlt}<span className="text-sm font-normal text-[var(--text-muted)]">/{meta.images.total}</span>
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Images w/ Alt</p>
                  {hasMissing && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--card-border)]">
                      <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        {meta.images.withoutAlt} missing
                      </span>
                      <FixWithBotButton
                        label="Fix"
                        size="sm"
                        variant="ghost"
                        context={`Fix ${meta.images.withoutAlt} images missing alt text on ${domain}. Add descriptive alt attributes for better SEO and accessibility.`}
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Internal Links */}
            {(() => {
              const s = statIcons[4]
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{meta.links.internal.toLocaleString()}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Internal Links</p>
                </div>
              )
            })()}

            {/* External Links */}
            {(() => {
              const s = statIcons[5]
              return (
                <div className="stat-card-hover rounded-xl p-4 border border-[var(--card-border)] bg-[var(--card-bg)]">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} mb-3`}>
                    <s.icon className="h-4 w-4 text-rose-400" />
                  </div>
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{meta.links.external.toLocaleString()}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">External Links</p>
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-6 text-center">
          <FileText className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-muted)]">No page analysis data available.</p>
        </div>
      )}
    </div>
  )
}
