'use client'

import { BookOpen } from 'lucide-react'
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
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Readability Analysis</h3>
      </div>

      {r ? (
        <div className="space-y-4">
          {/* Score + Info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <ScoreRing score={r.score} size="lg" label="Readability" />
            <div className="flex-1 space-y-2">
              <p className="text-xs text-zinc-500">
                Grade Level: {r.grade}
              </p>
              <p className={`text-xs font-medium ${readabilityRatingStyle(r.rating).text}`}>
                {r.rating}
              </p>
              <p className="text-xs text-zinc-500">
                {readabilityRecommendation(r.score)}
              </p>
              <FixWithBotButton
                label="Improve Readability"
                size="sm"
                variant="link"
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
                className="rounded-lg border border-white/[0.05] p-2.5 text-center"
              >
                <p className="text-lg font-bold text-zinc-200">{stat.value}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
