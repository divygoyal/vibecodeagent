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

  const handleScoreRingClick = () => {
    if (!r) return
    const question = `Improve content readability for my site. Current readability score: ${r.score}/100 (${r.rating}), grade level: ${r.grade}. What specific changes should I make?`
    window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai', { detail: { question } }))
  }

  return (
    <div className="premium-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-4 w-4 text-zinc-400" />
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Readability Analysis</h3>
      </div>

      {r ? (
        <div className="space-y-4">
          {/* Score + Info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button onClick={handleScoreRingClick} className="cursor-pointer hover:scale-105 transition-transform" title="Click to ask AI to improve readability">
              <ScoreRing score={r.score} size="lg" label="Readability" />
            </button>
            <div className="flex-1 space-y-2">
              <p className="text-sm text-[var(--text-primary)]">
                Grade Level: {r.grade}
              </p>
              <p className={`text-sm font-semibold ${readabilityRatingStyle(r.rating).text}`}>
                {r.rating}
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
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
                <p className="text-xl font-bold text-[var(--text-primary)]">{stat.value}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
