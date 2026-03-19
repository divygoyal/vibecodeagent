'use client'

import React from 'react'
import { Shield, Zap, AlertTriangle, Clock } from 'lucide-react'
import { ScoreRing } from './ScoreRing'
import FixWithBotButton from '@/components/FixWithBotButton'
import type { DomainOverviewData } from './types'
import { scoreColor } from './types'

interface Props {
  data: DomainOverviewData
  domain: string
}

function loadTimeColor(seconds: number): string {
  if (seconds < 1.5) return 'bg-emerald-500/10 text-emerald-400'
  if (seconds < 3) return 'bg-amber-500/10 text-amber-400'
  return 'bg-red-500/10 text-red-400'
}

function loadTimeLabel(seconds: number): string {
  if (seconds < 1.5) return 'Fast'
  if (seconds < 3) return 'Moderate'
  return 'Slow'
}

export function ScoreOverviewRow({ data, domain }: Props) {
  const seoScore = data.audit?.score ?? 0
  const perfScore = data.pagespeed?.performance ?? 0
  const issueCount = data.audit?.summary.total ?? 0
  const loadTimeSec = data.audit ? data.audit.responseTime / 1000 : 0
  const loadTimeFormatted = data.audit ? `${loadTimeSec.toFixed(2)}s` : '--'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* SEO Health */}
      <div className="premium-card stat-card-hover rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          <Shield className="h-3 w-3" />
          SEO Health
        </div>
        <div className="score-ring-glow">
          <ScoreRing score={seoScore} size="lg" label="" />
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color: scoreColor(seoScore) }}
        >
          {seoScore >= 80 ? 'Healthy' : seoScore >= 50 ? 'Needs Work' : 'Critical'}
        </span>
        <FixWithBotButton
          label="Improve"
          size="sm"
          variant="ghost"
          context={`How to improve SEO health from ${seoScore} to 90+ for ${domain}`}
          site={domain}
        />
      </div>

      {/* Performance */}
      <div className="premium-card stat-card-hover rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          <Zap className="h-3 w-3" />
          Performance
        </div>
        <div className="score-ring-glow">
          <ScoreRing score={perfScore} size="lg" label="" />
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color: scoreColor(perfScore) }}
        >
          {perfScore >= 80 ? 'Fast' : perfScore >= 50 ? 'Average' : 'Slow'}
        </span>
        <FixWithBotButton
          label="Improve"
          size="sm"
          variant="ghost"
          context={`How to improve performance score from ${perfScore} for ${domain}`}
          site={domain}
        />
      </div>

      {/* Issues Found */}
      <div className="premium-card stat-card-hover rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          <AlertTriangle className="h-3 w-3" />
          Issues Found
        </div>
        <span className="text-3xl font-bold text-[var(--text-primary)]">
          {issueCount.toLocaleString()}
        </span>
        {data.audit && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-[var(--text-secondary)]">
                {data.audit.summary.critical}C
              </span>
            </span>
            <span className="text-zinc-700">&middot;</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span className="text-[var(--text-secondary)]">
                {data.audit.summary.warning}W
              </span>
            </span>
            <span className="text-zinc-700">&middot;</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-[var(--text-secondary)]">
                {data.audit.summary.info}I
              </span>
            </span>
          </div>
        )}
        <FixWithBotButton
          label="Fix All"
          size="sm"
          variant="ghost"
          context={`Prioritize and fix these ${issueCount} SEO issues for ${domain}`}
          site={domain}
        />
      </div>

      {/* Load Time */}
      <div className="premium-card stat-card-hover rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" />
          Load Time
        </div>
        <span className="text-3xl font-bold text-[var(--text-primary)]">
          {loadTimeFormatted}
        </span>
        {data.audit && (
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${loadTimeColor(loadTimeSec)}`}
          >
            {loadTimeLabel(loadTimeSec)}
          </span>
        )}
        <FixWithBotButton
          label="Speed Up"
          size="sm"
          variant="ghost"
          context={`How to reduce load time from ${loadTimeSec.toFixed(2)}s for ${domain}`}
          site={domain}
        />
      </div>
    </div>
  )
}

export default ScoreOverviewRow
