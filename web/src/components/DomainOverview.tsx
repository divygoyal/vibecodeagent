'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

import DomainInputBar from './domain-overview/DomainInputBar'
import { AnalysisSkeleton, AnalysisProgress } from './domain-overview/AnalysisSkeletons'
import { ScoreOverviewRow } from './domain-overview/ScoreOverviewRow'
import { CoreWebVitals } from './domain-overview/CoreWebVitals'
import { IssuesPanel } from './domain-overview/IssuesPanel'
import PageAnalysis from './domain-overview/PageAnalysis'
import KeywordTable from './domain-overview/KeywordTable'
import TechStackPanel from './domain-overview/TechStackPanel'
import PageSpeedOpportunities from './domain-overview/PageSpeedOpportunities'
import ReadabilityPanel from './domain-overview/ReadabilityPanel'
import GeoReadiness from './domain-overview/GeoReadiness'
import ActionButtonsRow from './domain-overview/ActionButtonsRow'
import type { DomainOverviewData } from './domain-overview/types'

/* ─── Props ─── */

interface DomainOverviewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
}

/* ─── Main Component ─── */

export default function DomainOverview({ session }: DomainOverviewProps) {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DomainOverviewData | null>(null)
  const [error, setError] = useState('')
  const [recentDomains, setRecentDomains] = useState<string[]>([])
  const [analysisSteps, setAnalysisSteps] = useState<{ label: string; done: boolean }[]>([])

  // Restore last analyzed domain and recent domains from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tc-analyzed-domain')
      if (saved) setDomain(saved)

      const recent = localStorage.getItem('tc-recent-domains')
      if (recent) setRecentDomains(JSON.parse(recent))
    } catch {
      // localStorage unavailable
    }
  }, [])

  const analyzeDomain = useCallback(async () => {
    if (!domain.trim()) return
    setLoading(true)
    setError('')
    setData(null)

    // Initialize analysis steps
    const steps = [
      { label: 'Running SEO audit...', done: false },
      { label: 'Checking Core Web Vitals...', done: false },
      { label: 'Researching keywords...', done: false },
      { label: 'Detecting technologies...', done: false },
    ]
    setAnalysisSteps([...steps])

    // Animate steps progressively
    const stepTimers = steps.map((_, i) =>
      setTimeout(() => {
        setAnalysisSteps((prev) =>
          prev.map((s, j) => (j <= i ? { ...s, done: true } : s))
        )
      }, 800 + i * 1200)
    )

    // Save domain to localStorage
    try {
      localStorage.setItem('tc-analyzed-domain', domain.trim())

      // Update recent domains list
      const updated = [
        domain.trim(),
        ...recentDomains.filter((d) => d !== domain.trim()),
      ].slice(0, 5)
      setRecentDomains(updated)
      localStorage.setItem('tc-recent-domains', JSON.stringify(updated))
    } catch {
      // ignore
    }

    try {
      const res = await fetch('/api/domain-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim() }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e.error || 'Analysis failed')
      }
      setData(await res.json())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      stepTimers.forEach(clearTimeout)
      setLoading(false)
    }
  }, [domain, recentDomains])

  return (
    <div className="space-y-5">
      {/* Domain Input */}
      <DomainInputBar
        value={domain}
        onChange={setDomain}
        onSubmit={analyzeDomain}
        loading={loading}
        recentDomains={recentDomains}
      />

      {/* Loading State */}
      {loading && (
        <div className="space-y-6">
          <AnalysisProgress steps={analysisSteps} />
          <AnalysisSkeleton />
        </div>
      )}

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </motion.div>
      )}

      {/* Results Dashboard */}
      {data && !loading && (
        <div className="space-y-6 cascade-fade">
          <div className="section-divider" />
          <ScoreOverviewRow data={data} domain={data.domain} />

          <div className="section-divider" />
          <CoreWebVitals data={data} domain={data.domain} />

          <div className="section-divider" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IssuesPanel data={data} domain={data.domain} auditUrl={data.url} />
            <PageAnalysis data={data} domain={data.domain} />
          </div>

          <div className="section-divider" />
          <KeywordTable data={data} domain={data.domain} />

          <div className="section-divider" />
          <TechStackPanel data={data} domain={data.domain} />

          <div className="section-divider" />
          <PageSpeedOpportunities data={data} domain={data.domain} />

          <div className="section-divider" />
          <ReadabilityPanel data={data} domain={data.domain} />

          <div className="section-divider" />
          <GeoReadiness data={data} domain={data.domain} />

          <div className="section-divider" />
          <ActionButtonsRow domain={data.domain} auditUrl={data.url} />
        </div>
      )}
    </div>
  )
}
