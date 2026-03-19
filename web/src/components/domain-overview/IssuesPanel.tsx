'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import FixWithBotButton from '@/components/FixWithBotButton'
import type { DomainOverviewData } from './types'
import { severityColor, severityOrder } from './types'

interface Props {
  data: DomainOverviewData
  domain: string
  auditUrl: string
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

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--card-bg)]">
          <AlertTriangle className="h-4 w-4 text-[var(--text-tertiary)]" />
        </div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Issues</h3>
          {totalCount > 0 && (
            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
              {totalCount}
            </span>
          )}
        </div>
      </div>

      {/* Issues list */}
      {displayedIssues.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">No issues found.</p>
      ) : (
        <div className="space-y-2">
          {displayedIssues.map((issue, idx) => {
            const isExpanded = expandedId === issue.id
            const isCritical = issue.severity === 'critical'

            return (
              <div
                key={issue.id}
                className={`table-row-premium rounded-lg transition-all cascade-fade ${
                  isCritical ? 'border-l-2 border-l-red-500 animate-pulse' : ''
                }`}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div
                  className="flex items-start gap-2.5 p-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                >
                  {/* Severity dot */}
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityColor(issue.severity)}`}
                  />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          {issue.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-2 mt-0.5">
                          {issue.description}
                        </p>
                      </div>

                      {/* Expand icon */}
                      <div className="shrink-0 mt-0.5">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        )}
                      </div>
                    </div>

                    {/* Expanded recommendation */}
                    {isExpanded && issue.recommendation && (
                      <div className="mt-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] p-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                          Recommendation
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {issue.recommendation}
                        </p>
                      </div>
                    )}

                    {/* Fix button */}
                    <div className="mt-2">
                      <FixWithBotButton
                        label="Fix"
                        size="sm"
                        variant="ghost"
                        context={`Fix this SEO issue on ${domain}: ${issue.title}. ${issue.description}. ${issue.recommendation ? `Recommendation: ${issue.recommendation}` : ''}`}
                        site={domain}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View all link */}
      {data.audit && sortedIssues.length > 8 && (
        <Link
          href={`/dashboard/audit?url=${encodeURIComponent(auditUrl)}`}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          View all in Full Audit
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

export default IssuesPanel
