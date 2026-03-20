'use client'

import React from 'react'
import { ScoreRing } from './ScoreRing'
import type { DomainOverviewData } from './types'

interface Props { data: DomainOverviewData; domain: string }
type Level = 'good' | 'mid' | 'bad'

function statusColor(level: Level) {
  if (level === 'good') return { text: 'text-emerald-400', bar: 'bg-emerald-500' }
  if (level === 'mid') return { text: 'text-amber-400', bar: 'bg-amber-500' }
  return { text: 'text-red-400', bar: 'bg-red-500' }
}

function scoreTier(s: number): { label: string; level: Level } {
  if (s >= 80) return { label: 'Healthy', level: 'good' }
  if (s >= 50) return { label: 'Needs Work', level: 'mid' }
  return { label: 'Critical', level: 'bad' }
}

function perfTier(s: number): { label: string; level: Level } {
  if (s >= 80) return { label: 'Fast', level: 'good' }
  if (s >= 50) return { label: 'Average', level: 'mid' }
  return { label: 'Slow', level: 'bad' }
}

function loadTier(s: number): { label: string; level: Level } {
  if (s < 1.5) return { label: 'Fast', level: 'good' }
  if (s < 3) return { label: 'Moderate', level: 'mid' }
  return { label: 'Slow', level: 'bad' }
}

const ActionLink = ({ label }: { label: string }) => (
  <span className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
    {label} &rarr;
  </span>
)

const Card = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className="premium-card rounded-2xl p-6 flex flex-col justify-between gap-4 cursor-pointer hover:border-[var(--card-hover)] transition-colors"
  >
    {children}
  </div>
)

const Bar = ({ value, max, level }: { value: number; max: number; level: Level }) => (
  <div className="w-full h-1.5 rounded-full bg-[var(--border-primary)] overflow-hidden">
    <div
      className={`h-full rounded-full ${statusColor(level).bar} transition-all duration-700`}
      style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }}
    />
  </div>
)

function askAI(prompt: string) {
  window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { message: prompt } }))
}

export function ScoreOverviewRow({ data }: Props) {
  const seoScore = data.audit?.score ?? 0
  const perfScore = data.pagespeed?.performance ?? 0
  const issueCount = data.audit?.summary.total ?? 0
  const loadSec = data.audit ? data.audit.responseTime / 1000 : 0
  const seo = scoreTier(seoScore)
  const perf = perfTier(perfScore)
  const lt = loadTier(loadSec)
  const criticals = data.audit?.summary.critical ?? 0
  const warnings = data.audit?.summary.warning ?? 0
  const infos = data.audit?.summary.info ?? 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card onClick={() => askAI(`My SEO health score is ${seoScore}/100 (${seo.label}). How can I improve my SEO health?`)}>
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-4">SEO Health</p>
          <div className="flex items-center gap-4 mb-3">
            <ScoreRing score={seoScore} size="sm" label="" />
            <span className="text-4xl font-bold text-[var(--text-primary)]">{seoScore}</span>
          </div>
          <Bar value={seoScore} max={100} level={seo.level} />
          <p className={`text-xs font-medium mt-2 ${statusColor(seo.level).text}`}>{seo.label}</p>
        </div>
        <ActionLink label="Improve" />
      </Card>

      <Card onClick={() => askAI(`My performance score is ${perfScore}/100 (${perf.label}). How can I boost my page speed?`)}>
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-4">Performance</p>
          <p className="text-4xl font-bold text-[var(--text-primary)] mb-3">{perfScore}</p>
          <Bar value={perfScore} max={100} level={perf.level} />
          <p className={`text-xs font-medium mt-2 ${statusColor(perf.level).text}`}>{perf.label}</p>
        </div>
        <ActionLink label="Boost Speed" />
      </Card>

      <Card onClick={() => askAI(`I have ${issueCount} issues: ${criticals} critical, ${warnings} warnings, ${infos} informational. How should I prioritize fixing these?`)}>
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-4">Issues Found</p>
          <p className="text-4xl font-bold text-[var(--text-primary)] mb-3">{issueCount}</p>
          <p className="text-xs text-[var(--text-secondary)] font-mono">
            <span className="text-red-400">{criticals}C</span>{' · '}
            <span className="text-amber-400">{warnings}W</span>{' · '}
            <span className="text-blue-400">{infos}I</span>
          </p>
        </div>
        <ActionLink label={criticals > 0 ? 'Fix Critical' : 'Fix All'} />
      </Card>

      <Card onClick={() => askAI(`My page load time is ${loadSec.toFixed(2)}s (${lt.label}). How can I speed up my site?`)}>
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-4">Load Time</p>
          <p className="text-4xl font-bold text-[var(--text-primary)] mb-3">
            {data.audit ? loadSec.toFixed(2) : '--'}
            <span className="text-lg font-normal text-[var(--text-tertiary)] ml-1">s</span>
          </p>
          <p className={`text-xs font-medium ${statusColor(lt.level).text}`}>{lt.label}</p>
        </div>
        <ActionLink label="Speed Up" />
      </Card>
    </div>
  )
}

export default ScoreOverviewRow
