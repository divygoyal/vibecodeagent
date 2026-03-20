'use client'

import { Brain } from 'lucide-react'
import { motion } from 'framer-motion'
import { ScoreRing } from './ScoreRing'
import { geoBarColor, geoTextColor } from './types'
import type { DomainOverviewData } from './types'
import FixWithBotButton from '../FixWithBotButton'

interface GeoReadinessProps {
  data: DomainOverviewData
  domain: string
}

const categories = [
  { key: 'citability' as const, label: 'Citability', weight: '25%' },
  { key: 'structure' as const, label: 'Structural Readability', weight: '30%' },
  { key: 'multimodal' as const, label: 'Multi-modal Content', weight: '20%' },
  { key: 'authority' as const, label: 'Authority Signals', weight: '25%' },
] as const

export default function GeoReadiness({ data, domain }: GeoReadinessProps) {
  const geo = data.geoReadiness

  const handleCategoryClick = (label: string, score: number) => {
    const question = `How can I improve my "${label}" score for AI search readiness (GEO)? Current score: ${score}/100. Give me specific, actionable steps.`
    window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question } }))
  }

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-4 w-4 text-zinc-400" />
        <h3 className="text-base font-semibold text-[var(--text-primary)]">AI Search Readiness (GEO)</h3>
      </div>

      {geo ? (
        <div className="space-y-4">
          {/* Score + Progress bars */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <ScoreRing score={geo.overallScore} size="lg" label="GEO Score" />
            <div className="flex-1 w-full space-y-3">
              {categories.map(({ key, label, weight }) => {
                const cat = geo.categories[key]
                return (
                  <button
                    key={key}
                    onClick={() => handleCategoryClick(label, cat.score)}
                    className="block w-full text-left cursor-pointer hover:bg-white/[0.02] rounded-lg p-1 -m-1 transition-colors"
                    title={`Click to ask AI about improving ${label}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--text-primary)]">
                        {label}{' '}
                        <span className="text-xs text-[var(--text-secondary)]">({weight})</span>
                      </span>
                      <span className={`text-sm font-semibold ${geoTextColor(cat.score)}`}>
                        {cat.score}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.04]">
                      <motion.div
                        className={`h-full rounded-full ${geoBarColor(cat.score)}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Findings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map(({ key, label }) => {
              const cat = geo.categories[key]
              if (!cat.findings.length) return null

              return (
                <div key={key} className="space-y-1.5">
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    {label}
                  </p>
                  <ul className="space-y-1">
                    {cat.findings.map((finding, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                        <span className="text-sm text-[var(--text-secondary)]">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          <FixWithBotButton
            label="Improve AI Readiness"
            size="sm"
            variant="link"
            context={`Improve AI search readiness (GEO) for ${domain}. Current score: ${geo.overallScore}/100`}
          />
        </div>
      ) : null}
    </div>
  )
}
