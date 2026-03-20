'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import FixWithBotButton from '@/components/FixWithBotButton'
import type { DomainOverviewData } from './types'
import { severityOrder } from './types'

interface Props {
  data: DomainOverviewData
  domain: string
  auditUrl: string
}

const dotColor: Record<string, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
  passed: 'text-emerald-400',
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
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Top Issues
        </h3>
        {totalCount > 0 && (
          <span className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md px-2 py-0.5">
            {totalCount}
          </span>
        )}
      </div>

      {/* Issues list */}
      {displayedIssues.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No issues found — your site looks great.
          </p>
        </div>
      ) : (
        <div>
          {displayedIssues.map((issue, idx) => {
            const isExpanded = expandedId === issue.id
            const isPassed = issue.severity === 'passed'
            const color = dotColor[issue.severity] || 'text-zinc-500'

            return (
              <div
                key={issue.id}
                className={`${idx > 0 ? 'border-t border-[var(--card-border)]' : ''}`}
              >
                <button
                  onClick={() =>
                    issue.recommendation
                      ? setExpandedId(isExpanded ? null : issue.id)
                      : undefined
                  }
                  className="w-full text-left py-3 group hover:bg-[var(--card-bg)] rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 inline-block ${color.replace('text-', 'bg-')}`} />

                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {issue.title}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                          {issue.description}
                        </p>
                      </div>
                    </div>
                    {!isPassed && (
                      <span className="shrink-0 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5">
                        Fix&nbsp;&rarr;
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded recommendation */}
                {isExpanded && issue.recommendation && (
                  <div className="pb-3 pl-5">
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
                      {issue.recommendation}
                    </p>
                    <FixWithBotButton
                      label="Fix with AI"
                      size="sm"
                      variant="ghost"
                      context={`Fix this SEO issue on ${domain}: ${issue.title}. ${issue.description}. Recommendation: ${issue.recommendation}`}
                      site={domain}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {data.audit && sortedIssues.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
          <Link
            href={`/dashboard/audit?url=${encodeURIComponent(auditUrl)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            View full audit
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default IssuesPanel
