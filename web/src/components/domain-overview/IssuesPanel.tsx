'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
  AlertCircle,
  Info,
  HelpCircle,
  Lightbulb,
} from 'lucide-react'
import FixWithBotButton from '@/components/FixWithBotButton'
import type { DomainOverviewData } from './types'
import { severityOrder } from './types'

interface Props {
  data: DomainOverviewData
  domain: string
  auditUrl: string
}

function severityConfig(severity: string) {
  switch (severity) {
    case 'critical':
      return {
        icon: ShieldAlert,
        label: 'Critical',
        dotColor: 'bg-red-500',
        badgeBg: 'bg-red-500/15',
        badgeText: 'text-red-400',
        borderColor: 'border-l-red-500',
        rowBg: 'bg-red-500/[0.04]',
        iconBg: 'bg-red-500/15',
        iconColor: 'text-red-400',
      }
    case 'warning':
      return {
        icon: AlertCircle,
        label: 'Warning',
        dotColor: 'bg-amber-500',
        badgeBg: 'bg-amber-500/15',
        badgeText: 'text-amber-400',
        borderColor: 'border-l-amber-500',
        rowBg: 'bg-amber-500/[0.03]',
        iconBg: 'bg-amber-500/15',
        iconColor: 'text-amber-400',
      }
    case 'info':
      return {
        icon: Info,
        label: 'Info',
        dotColor: 'bg-blue-500',
        badgeBg: 'bg-blue-500/15',
        badgeText: 'text-blue-400',
        borderColor: 'border-l-blue-500',
        rowBg: 'bg-blue-500/[0.03]',
        iconBg: 'bg-blue-500/15',
        iconColor: 'text-blue-400',
      }
    default:
      return {
        icon: HelpCircle,
        label: 'Notice',
        dotColor: 'bg-zinc-500',
        badgeBg: 'bg-zinc-500/15',
        badgeText: 'text-zinc-400',
        borderColor: 'border-l-zinc-500',
        rowBg: 'bg-zinc-500/[0.03]',
        iconBg: 'bg-zinc-500/15',
        iconColor: 'text-zinc-400',
      }
  }
}

export function IssuesPanel({ data, domain, auditUrl }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedIssues = data.audit?.issues
    ? [...data.audit.issues].sort(
        (a, b) => severityOrder(a.severity) - severityOrder(b.severity)
      )
    : []

  const displayedIssues = sortedIssues.slice(0, 8)
  const totalCount = sortedIssues.length
  const criticalCount = sortedIssues.filter(i => i.severity === 'critical').length

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-amber-500/20 ring-1 ring-red-500/20">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            {criticalCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-[var(--card-bg)]">
                {criticalCount > 9 ? '9+' : criticalCount}
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Top Issues</h3>
              {totalCount > 0 && (
                <span className="rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm shadow-red-500/25">
                  {totalCount}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Critical issues need immediate attention
            </p>
          </div>
        </div>
      </div>

      {/* Issues list */}
      {displayedIssues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 mb-3">
            <ShieldAlert className="h-6 w-6 text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">No issues found</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Your site is looking great!</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayedIssues.map((issue, idx) => {
            const isExpanded = expandedId === issue.id
            const isCritical = issue.severity === 'critical'
            const config = severityConfig(issue.severity)
            const SeverityIcon = config.icon

            return (
              <div
                key={issue.id}
                className={`
                  group relative rounded-xl border border-[var(--card-border)] overflow-hidden
                  transition-all duration-300 cascade-fade
                  border-l-2 ${config.borderColor}
                  ${config.rowBg}
                  hover:border-[var(--card-border-hover,var(--card-border))] hover:shadow-lg hover:shadow-black/5
                  ${isCritical ? 'ring-1 ring-red-500/10 hover:ring-red-500/20' : ''}
                `}
                style={{
                  animationDelay: `${idx * 80}ms`,
                  ...(isCritical ? { animation: 'subtlePulse 3s ease-in-out infinite' } : {}),
                }}
              >
                {/* Main row */}
                <div className="flex items-start gap-3 p-3.5 pr-3">
                  {/* Severity icon badge */}
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.iconBg}`}
                  >
                    <SeverityIcon className={`h-3.5 w-3.5 ${config.iconColor}`} />
                  </div>

                  {/* Content area */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {/* Severity label + title row */}
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${config.badgeBg} ${config.badgeText}`}
                          >
                            {config.label}
                          </span>
                        </div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                          {issue.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-2 mt-1 leading-relaxed">
                          {issue.description}
                        </p>
                      </div>

                      {/* Fix button */}
                      <div className="shrink-0 ml-2 mt-1">
                        <FixWithBotButton
                          label="Fix"
                          size="sm"
                          variant={isCritical ? 'solid' : 'ghost'}
                          context={`Fix this SEO issue on ${domain}: ${issue.title}. ${issue.description}. ${issue.recommendation ? `Recommendation: ${issue.recommendation}` : ''}`}
                          site={domain}
                        />
                      </div>
                    </div>

                    {/* Expand toggle */}
                    {issue.recommendation && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 transition-transform" />
                        ) : (
                          <ChevronRight className="h-3 w-3 transition-transform" />
                        )}
                        {isExpanded ? 'Hide' : 'View'} Recommendation
                      </button>
                    )}

                    {/* Expanded recommendation */}
                    {isExpanded && issue.recommendation && (
                      <div className="mt-2.5 rounded-lg bg-[var(--card-bg)]/60 backdrop-blur-sm border border-[var(--card-border)] p-3.5 transition-all duration-300">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lightbulb className="h-3 w-3 text-amber-400" />
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Recommendation
                          </p>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                          {issue.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer — view all link */}
      {data.audit && sortedIssues.length > 8 && (
        <div className="mt-5 pt-4 border-t border-[var(--card-border)]">
          <Link
            href={`/dashboard/audit?url=${encodeURIComponent(auditUrl)}`}
            className="group/link inline-flex items-center gap-2 text-xs font-semibold transition-colors"
          >
            <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent group-hover/link:from-emerald-300 group-hover/link:to-cyan-300 transition-all">
              View all in Full Audit
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-emerald-400 group-hover/link:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      )}

      {/* Subtle pulse keyframe for critical issues */}
      <style jsx>{`
        @keyframes subtlePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          50% { box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.08); }
        }
      `}</style>
    </div>
  )
}

export default IssuesPanel
