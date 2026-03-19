'use client'

import { Zap } from 'lucide-react'
import type { DomainOverviewData } from './types'
import FixWithBotButton from '../FixWithBotButton'

interface PageSpeedOpportunitiesProps {
  data: DomainOverviewData
  domain: string
}

export default function PageSpeedOpportunities({ data, domain }: PageSpeedOpportunitiesProps) {
  const opportunities = data.pagespeed?.opportunities ?? []

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <Zap className="h-4 w-4 text-zinc-400" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-200">PageSpeed Opportunities</h3>
      </div>

      {opportunities.length === 0 ? (
        <div className="flex items-center gap-2 py-6 justify-center">
          <Zap className="h-4 w-4 text-emerald-400" />
          <p className="text-xs text-zinc-400">No significant performance issues found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map((opp, i) => (
            <div
              key={i}
              className="table-row-premium flex items-start justify-between gap-4 rounded-lg p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-300">{opp.title}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                  {opp.description}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {opp.savingsMs > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">
                    Save{' '}
                    {opp.savingsMs >= 1000
                      ? `${(opp.savingsMs / 1000).toFixed(1)}s`
                      : `${Math.round(opp.savingsMs)}ms`}
                  </span>
                )}
                <FixWithBotButton
                  label="Fix"
                  size="sm"
                  variant="ghost"
                  context={`Fix this PageSpeed issue on ${domain}: ${opp.title}. ${opp.description}. Potential savings: ${opp.savingsMs}ms`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
