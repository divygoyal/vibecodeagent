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

/* ─── Health helpers ─── */

function healthTier(score: number) {
  if (score >= 80) return { label: 'Healthy', gradient: 'from-emerald-500 to-cyan-500', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', glow: 'shadow-emerald-500/20' }
  if (score >= 50) return { label: 'Needs Work', gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/25', glow: 'shadow-amber-500/20' }
  return { label: 'Critical', gradient: 'from-red-500 to-rose-500', bg: 'bg-red-500/15 text-red-400 border-red-500/25', glow: 'shadow-red-500/20' }
}

function perfTier(score: number) {
  if (score >= 80) return { label: 'Fast', gradient: 'from-emerald-500 to-cyan-500', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', glow: 'shadow-emerald-500/20' }
  if (score >= 50) return { label: 'Average', gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/25', glow: 'shadow-amber-500/20' }
  return { label: 'Slow', gradient: 'from-red-500 to-rose-500', bg: 'bg-red-500/15 text-red-400 border-red-500/25', glow: 'shadow-red-500/20' }
}

function loadTimeTier(seconds: number) {
  if (seconds < 1.5) return { label: 'Fast', gradient: 'from-emerald-500 to-cyan-500', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', glow: 'shadow-emerald-500/20', barColor: 'bg-emerald-500', barWidth: '30%' }
  if (seconds < 3) return { label: 'Moderate', gradient: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/25', glow: 'shadow-amber-500/20', barColor: 'bg-amber-500', barWidth: '60%' }
  return { label: 'Slow', gradient: 'from-red-500 to-rose-500', bg: 'bg-red-500/15 text-red-400 border-red-500/25', glow: 'shadow-red-500/20', barColor: 'bg-red-500', barWidth: '90%' }
}

function accentBarGradient(gradient: string) {
  switch (gradient) {
    case 'from-emerald-500 to-cyan-500': return 'from-emerald-500 via-emerald-400 to-cyan-500'
    case 'from-amber-500 to-orange-500': return 'from-amber-500 via-amber-400 to-orange-500'
    case 'from-red-500 to-rose-500': return 'from-red-500 via-red-400 to-rose-500'
    default: return gradient
  }
}

/* ─── Severity bar helper ─── */

function SeverityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max((count / total) * 100, 4) : 0
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-[10px] font-medium text-[var(--text-tertiary)] w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-[var(--text-secondary)] w-6 text-right tabular-nums">{count}</span>
    </div>
  )
}

export function ScoreOverviewRow({ data, domain }: Props) {
  const seoScore = data.audit?.score ?? 0
  const perfScore = data.pagespeed?.performance ?? 0
  const issueCount = data.audit?.summary.total ?? 0
  const loadTimeSec = data.audit ? data.audit.responseTime / 1000 : 0
  const loadTimeFormatted = data.audit ? loadTimeSec.toFixed(2) : '--'

  const seo = healthTier(seoScore)
  const perf = perfTier(perfScore)
  const criticals = data.audit?.summary.critical ?? 0
  const warnings = data.audit?.summary.warning ?? 0
  const infos = data.audit?.summary.info ?? 0
  const issueTier = criticals > 0
    ? { gradient: 'from-red-500 to-rose-500', glow: 'shadow-red-500/20' }
    : warnings > 0
      ? { gradient: 'from-amber-500 to-orange-500', glow: 'shadow-amber-500/20' }
      : { gradient: 'from-emerald-500 to-cyan-500', glow: 'shadow-emerald-500/20' }
  const lt = loadTimeTier(loadTimeSec)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

      {/* ──────────── SEO Health ──────────── */}
      <div className={`premium-card stat-card-hover rounded-2xl overflow-hidden shadow-lg ${seo.glow}`}>
        {/* Accent bar */}
        <div className={`h-[2px] w-full bg-gradient-to-r ${accentBarGradient(seo.gradient)}`} />
        <div className="p-5 flex flex-col gap-4">
          {/* Top: ring + details */}
          <div className="flex items-center gap-4">
            {/* Ring with radial glow */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full opacity-20 blur-xl" style={{ background: `radial-gradient(circle, ${scoreColor(seoScore)}55, transparent 70%)` }} />
              <div className="score-ring-glow relative">
                <ScoreRing score={seoScore} size="lg" label="" />
              </div>
            </div>
            {/* Details */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Shield className="h-3.5 w-3.5" />
                SEO Health
              </div>
              <span className="text-3xl font-bold gradient-text bg-gradient-to-r bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${scoreColor(seoScore)}, ${scoreColor(seoScore)}88)` }}>
                {seoScore}
              </span>
              <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${seo.bg} ${seoScore < 50 ? 'animate-pulse' : ''}`}>
                {seo.label}
              </span>
            </div>
          </div>
          {/* Action */}
          <div className="w-full">
            <FixWithBotButton
              label="Improve SEO"
              size="md"
              variant="solid"
              context={`How to improve SEO health from ${seoScore} to 90+ for ${domain}`}
              site={domain}
            />
          </div>
        </div>
      </div>

      {/* ──────────── Performance ──────────── */}
      <div className={`premium-card stat-card-hover rounded-2xl overflow-hidden shadow-lg ${perf.glow}`}>
        <div className={`h-[2px] w-full bg-gradient-to-r ${accentBarGradient(perf.gradient)}`} />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full opacity-20 blur-xl" style={{ background: `radial-gradient(circle, ${scoreColor(perfScore)}55, transparent 70%)` }} />
              <div className="score-ring-glow relative">
                <ScoreRing score={perfScore} size="lg" label="" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Zap className="h-3.5 w-3.5" />
                Performance
              </div>
              <span className="text-3xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${scoreColor(perfScore)}, ${scoreColor(perfScore)}88)` }}>
                {perfScore}
              </span>
              <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${perf.bg} ${perfScore < 50 ? 'animate-pulse' : ''}`}>
                {perf.label}
              </span>
            </div>
          </div>
          <div className="w-full">
            <FixWithBotButton
              label="Boost Speed"
              size="md"
              variant="solid"
              context={`How to improve performance score from ${perfScore} for ${domain}`}
              site={domain}
            />
          </div>
        </div>
      </div>

      {/* ──────────── Issues Found ──────────── */}
      <div className={`premium-card stat-card-hover rounded-2xl overflow-hidden shadow-lg ${issueTier.glow}`}>
        <div className={`h-[2px] w-full bg-gradient-to-r ${accentBarGradient(issueTier.gradient)}`} />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            {/* Big issue number with glow */}
            <div className="relative shrink-0 flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <div className="absolute inset-0 rounded-full opacity-15 blur-xl" style={{ background: criticals > 0 ? 'radial-gradient(circle, #ef444455, transparent 70%)' : warnings > 0 ? 'radial-gradient(circle, #f59e0b55, transparent 70%)' : 'radial-gradient(circle, #34d39955, transparent 70%)' }} />
              <div className="flex flex-col items-center relative">
                <span className={`text-4xl font-black bg-gradient-to-r ${issueTier.gradient} bg-clip-text text-transparent`}>
                  {issueCount.toLocaleString()}
                </span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">issues</span>
              </div>
            </div>
            {/* Severity breakdown */}
            <div className="flex flex-col gap-1.5 min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Breakdown
              </div>
              {data.audit && (
                <>
                  <SeverityBar label="Critical" count={criticals} total={issueCount} color="bg-red-500" />
                  <SeverityBar label="Warning" count={warnings} total={issueCount} color="bg-amber-500" />
                  <SeverityBar label="Info" count={infos} total={issueCount} color="bg-blue-500" />
                </>
              )}
            </div>
          </div>
          <div className="w-full">
            <FixWithBotButton
              label="Fix All Issues"
              size="md"
              variant={criticals > 0 ? 'solid' : 'ghost'}
              context={`Prioritize and fix these ${issueCount} SEO issues for ${domain}`}
              site={domain}
            />
          </div>
        </div>
      </div>

      {/* ──────────── Load Time ──────────── */}
      <div className={`premium-card stat-card-hover rounded-2xl overflow-hidden shadow-lg ${lt.glow}`}>
        <div className={`h-[2px] w-full bg-gradient-to-r ${accentBarGradient(lt.gradient)}`} />
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            {/* Big time value */}
            <div className="relative shrink-0 flex items-center justify-center" style={{ width: 80, height: 80 }}>
              <div className="absolute inset-0 rounded-full opacity-15 blur-xl" style={{ background: `radial-gradient(circle, ${loadTimeSec < 1.5 ? '#34d39955' : loadTimeSec < 3 ? '#f59e0b55' : '#ef444455'}, transparent 70%)` }} />
              <div className="flex flex-col items-center relative">
                <span className={`text-3xl font-black bg-gradient-to-r ${lt.gradient} bg-clip-text text-transparent`}>
                  {loadTimeFormatted}
                </span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] mt-0.5">seconds</span>
              </div>
            </div>
            {/* Classification + bar */}
            <div className="flex flex-col gap-2 min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Clock className="h-3.5 w-3.5" />
                Load Time
              </div>
              <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${lt.bg} ${loadTimeSec >= 3 ? 'animate-pulse' : ''}`}>
                {lt.label}
              </span>
              {/* Response time bar */}
              {data.audit && (
                <div className="mt-1 w-full">
                  <div className="flex items-center justify-between text-[9px] text-[var(--text-tertiary)] mb-1">
                    <span>Response</span>
                    <span>{data.audit.responseTime}ms</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className={`h-full rounded-full ${lt.barColor} transition-all duration-700`} style={{ width: lt.barWidth }} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="w-full">
            <FixWithBotButton
              label="Speed Up"
              size="md"
              variant="solid"
              context={`How to reduce load time from ${loadTimeSec.toFixed(2)}s for ${domain}`}
              site={domain}
            />
          </div>
        </div>
      </div>

    </div>
  )
}

export default ScoreOverviewRow
