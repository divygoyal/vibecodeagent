'use client'

import { useState } from 'react'
import { Brain, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <Brain className="h-4 w-4 text-zinc-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">AI Search Readiness (GEO)</h3>
          <p className="text-xs text-zinc-500">Generative Engine Optimization scoring</p>
        </div>
      </div>

      {geo ? (
        <div className="space-y-4">
          {/* Score + Progress bars */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="relative flex items-center justify-center shrink-0 score-ring-glow">
              <ScoreRing score={geo.overallScore} size="lg" label="GEO Score" />
            </div>
            <div className="flex-1 w-full space-y-3">
              {categories.map(({ key, label, weight }) => {
                const cat = geo.categories[key]
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-300">
                        {label}{' '}
                        <span className="text-zinc-600 text-[10px]">({weight})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${geoTextColor(cat.score)}`}>
                          {cat.score}
                        </span>
                        <FixWithBotButton
                          label="Optimize"
                          size="sm"
                          variant="ghost"
                          context={`Improve ${label} for AI search readiness on ${domain}. Current score: ${cat.score}/100`}
                        />
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.04]">
                      <motion.div
                        className={`h-full rounded-full ${geoBarColor(cat.score)}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Expandable findings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map(({ key, label }) => {
              const cat = geo.categories[key]
              const isExpanded = expandedCategory === key

              return (
                <div
                  key={key}
                  className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3"
                >
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between mb-1"
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      {label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                          cat.score >= 80
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : cat.score >= 60
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {cat.score}/100
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3 text-zinc-500" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-zinc-500" />
                      )}
                    </div>
                  </button>
                  {isExpanded && cat.findings.length > 0 && (
                    <motion.ul
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1 mt-2"
                    >
                      {cat.findings.map((finding, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                          <span className="text-[11px] text-zinc-400">{finding}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-4 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          <p className="text-xs text-zinc-500">Analyzing AI search readiness...</p>
        </div>
      )}
    </div>
  )
}
