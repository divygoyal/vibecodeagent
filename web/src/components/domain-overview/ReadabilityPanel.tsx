'use client'

import { BookOpen, Loader2 } from 'lucide-react'
import { ScoreRing } from './ScoreRing'
import { readabilityRatingStyle, readabilityRecommendation } from './types'
import type { DomainOverviewData } from './types'
import FixWithBotButton from '../FixWithBotButton'

interface ReadabilityPanelProps {
  data: DomainOverviewData
  domain: string
}

export default function ReadabilityPanel({ data, domain }: ReadabilityPanelProps) {
  const r = data.readability

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
          <BookOpen className="h-4 w-4 text-zinc-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Readability Analysis</h3>
          <p className="text-xs text-zinc-500">Flesch-Kincaid readability scoring</p>
        </div>
      </div>

      {r ? (
        <div className="space-y-4">
          {/* Score + Info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative flex items-center justify-center score-ring-glow">
              <ScoreRing score={r.score} size="lg" label="Readability" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-zinc-500">
                Grade Level: {r.grade}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${readabilityRatingStyle(r.rating).bg} ${readabilityRatingStyle(r.rating).text}`}
                >
                  {r.rating}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {readabilityRecommendation(r.score)}
              </p>
              <FixWithBotButton
                label="Improve Readability"
                size="sm"
                variant="ghost"
                context={`Improve content readability for ${domain}. Current score: ${r.score} (${r.rating})`}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'Word Count', value: r.wordCount.toLocaleString() },
              { label: 'Sentence Count', value: r.sentenceCount.toLocaleString() },
              { label: 'Avg Words/Sentence', value: r.avgWordsPerSentence.toString() },
              { label: 'Avg Syllables/Word', value: r.avgSyllablesPerWord.toString() },
            ].map((stat) => (
              <div
                key={stat.label}
                className="stat-card-hover rounded-lg bg-white/[0.02] border border-white/[0.03] p-2.5 text-center"
              >
                <p className="text-lg font-bold text-zinc-200">{stat.value}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-4 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          <p className="text-xs text-zinc-500">Analyzing...</p>
        </div>
      )}
    </div>
  )
}
