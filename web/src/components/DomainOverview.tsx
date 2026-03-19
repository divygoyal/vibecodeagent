'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ScanSearch,
  Loader2,
  AlertTriangle,
  Activity,
  FileText,
  Target,
  Cpu,
  Shield,
  Map,
  Zap,
  Sparkles,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  X,
  BookOpen,
  Brain,
} from 'lucide-react'

/* ─── Types ─── */

interface DomainOverviewData {
  domain: string
  url: string
  analyzedAt: string
  audit: {
    score: number
    summary: { critical: number; warning: number; info: number; passed: number; total: number }
    issues: Array<{
      id: string
      category: string
      title: string
      description: string
      severity: string
      recommendation?: string
      value?: string
    }>
    meta: {
      title?: string
      description?: string
      canonical?: string
      wordCount: number
      pageSize: number
      headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number }
      images: { total: number; withAlt: number; withoutAlt: number }
      links: { internal: number; external: number; total: number }
      scripts: number
      stylesheets: number
    }
    responseTime: number
    statusCode: number
  } | null
  pagespeed: {
    performance: number
    lcp: { value: number; unit: string; rating: string }
    cls: { value: number; unit: string; rating: string }
    tbt: { value: number; unit: string; rating: string }
    fcp: { value: number; unit: string; rating: string }
    si: { value: number; unit: string; rating: string }
    opportunities: Array<{ title: string; description: string; savingsMs: number }>
  } | null
  keywords: Array<{
    keyword: string
    volume: number
    difficulty: string
    intent: string
    contentType: string
    reason: string
  }>
  technologies: string[]
  robots: { found: boolean; rules: string[]; sitemapUrls: string[] } | null
  sitemap: { found: boolean; urlCount: number } | null
  readability: {
    score: number
    grade: number
    wordCount: number
    sentenceCount: number
    avgWordsPerSentence: number
    avgSyllablesPerWord: number
    rating: string
  } | null
  geoReadiness: {
    overallScore: number
    categories: {
      citability: { score: number; findings: string[] }
      structure: { score: number; findings: string[] }
      multimodal: { score: number; findings: string[] }
      authority: { score: number; findings: string[] }
    }
  } | null
}

interface DomainOverviewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
}

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function scoreColor(score: number): string {
  if (score >= 80) return '#34d399'
  if (score >= 50) return '#fbbf24'
  return '#ef4444'
}

function ratingColor(rating: string): { bg: string; text: string; label: string } {
  switch (rating) {
    case 'GOOD':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Good' }
    case 'NEEDS_IMPROVEMENT':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Needs Work' }
    case 'POOR':
      return { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Poor' }
    default:
      return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: rating }
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500'
    case 'warning':
      return 'bg-amber-500'
    case 'info':
      return 'bg-blue-500'
    default:
      return 'bg-zinc-500'
  }
}

function severityOrder(severity: string): number {
  switch (severity) {
    case 'critical':
      return 0
    case 'warning':
      return 1
    case 'info':
      return 2
    default:
      return 3
  }
}

function difficultyBadge(d: string) {
  switch (d) {
    case 'Low':
      return { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' }
    case 'Medium':
      return { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' }
    case 'High':
      return { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' }
    default:
      return { bg: 'bg-zinc-500/10 border-zinc-500/20', text: 'text-zinc-400' }
  }
}

function intentColor(intent: string): string {
  switch (intent) {
    case 'Informational':
      return 'text-blue-400'
    case 'Transactional':
      return 'text-emerald-400'
    case 'Commercial':
      return 'text-amber-400'
    case 'Navigational':
      return 'text-purple-400'
    default:
      return 'text-zinc-400'
  }
}

function charCountBadge(count: number, min: number, max: number) {
  const ok = count >= min && count <= max
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
        ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
      }`}
    >
      {count} chars
    </span>
  )
}

function readabilityRatingStyle(rating: string): { bg: string; text: string } {
  switch (rating) {
    case 'Very Easy':
      return { bg: 'bg-green-500/10', text: 'text-green-400' }
    case 'Easy':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400' }
    case 'Fairly Easy':
      return { bg: 'bg-cyan-500/10', text: 'text-cyan-400' }
    case 'Standard':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400' }
    case 'Fairly Difficult':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400' }
    case 'Difficult':
      return { bg: 'bg-orange-500/10', text: 'text-orange-400' }
    case 'Very Difficult':
      return { bg: 'bg-red-500/10', text: 'text-red-400' }
    default:
      return { bg: 'bg-zinc-500/10', text: 'text-zinc-400' }
  }
}

function geoBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

function geoTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function readabilityRecommendation(score: number): string {
  if (score >= 80) return 'Your content is easy to read for a broad audience. Great for user engagement and SEO.'
  if (score >= 60) return 'Your content has a standard readability level. Consider simplifying some sentences for wider appeal.'
  if (score >= 40) return 'Your content may be difficult for general audiences. Try shorter sentences and simpler vocabulary.'
  return 'Your content is quite hard to read. Consider breaking down complex sentences and using more common words.'
}

/* ─── Score Ring ─── */

function ScoreRing({
  score,
  size = 80,
  label,
  color,
}: {
  score: number
  size?: number
  label: string
  color?: string
}) {
  const resolvedColor = color ?? scoreColor(score)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={6}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div
        className="absolute flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-2xl font-bold" style={{ color: resolvedColor }}>
          {score}
        </span>
      </div>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  )
}

/* ─── Card wrapper ─── */

const Card = ({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className={`bg-[#0a0a12]/80 border border-white/[0.06] rounded-2xl ${className}`}
  >
    {children}
  </motion.div>
)

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle?: string
}) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
      <Icon className="h-4 w-4 text-zinc-400" />
    </div>
    <div>
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
    </div>
  </div>
)

/* ─── Main Component ─── */

export default function DomainOverview({ session }: DomainOverviewProps) {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DomainOverviewData | null>(null)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null)

  // Restore last analyzed domain from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tc-analyzed-domain')
      if (saved) setDomain(saved)
    } catch {
      // localStorage unavailable
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!domain.trim()) return
    setLoading(true)
    setError('')
    setData(null)

    try {
      localStorage.setItem('tc-analyzed-domain', domain.trim())
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
      setLoading(false)
    }
  }, [domain])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAnalyze()
  }

  const loadTimeColor = (seconds: number) => {
    if (seconds < 1.5) return 'bg-emerald-500/10 text-emerald-400'
    if (seconds < 3) return 'bg-amber-500/10 text-amber-400'
    return 'bg-red-500/10 text-red-400'
  }

  const sortedIssues = data?.audit?.issues
    ? [...data.audit.issues].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity))
    : []

  return (
    <div className="space-y-5">
      {/* ─── Domain Input Bar ─── */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your domain (e.g., example.com)"
              className="w-full rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500/30 focus:bg-white/[0.05]"
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || !domain.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/10 transition-all hover:shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ScanSearch className="h-4 w-4" />
            Analyze
          </button>
        </div>
      </Card>

      {/* ─── Loading State ─── */}
      {loading && (
        <Card className="p-8" delay={0.05}>
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-sm font-medium text-zinc-300">
              Analyzing <span className="text-emerald-400">{domain}</span>...
            </p>
            <div className="flex flex-col items-center gap-2 mt-2">
              {[
                'Running SEO audit...',
                'Checking Core Web Vitals...',
                'Researching keywords...',
                'Detecting technologies...',
              ].map((text, i) => (
                <motion.p
                  key={text}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.4 }}
                  className="text-xs text-zinc-500"
                >
                  {text}
                </motion.p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Error State ─── */}
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

      {/* ─── Results Dashboard ─── */}
      {data && (
        <div className="space-y-5">
          {/* a) Score Overview Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* SEO Health */}
            <Card className="p-5 flex flex-col items-center justify-center" delay={0.05}>
              <div className="relative flex items-center justify-center">
                <ScoreRing score={data.audit?.score ?? 0} size={80} label="SEO Health" />
              </div>
            </Card>

            {/* Performance */}
            <Card className="p-5 flex flex-col items-center justify-center" delay={0.1}>
              <div className="relative flex items-center justify-center">
                <ScoreRing
                  score={data.pagespeed?.performance ?? 0}
                  size={80}
                  label="Performance"
                />
              </div>
            </Card>

            {/* Issues Found */}
            <Card className="p-5 flex flex-col items-center justify-center gap-2" delay={0.15}>
              <span className="text-3xl font-bold text-zinc-100">
                {data.audit?.summary.total.toLocaleString() ?? 0}
              </span>
              <span className="text-xs text-zinc-500">Issues Found</span>
              {data.audit && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span className="text-zinc-400">{data.audit.summary.critical}C</span>
                  </span>
                  <span className="text-zinc-700">&middot;</span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="text-zinc-400">{data.audit.summary.warning}W</span>
                  </span>
                  <span className="text-zinc-700">&middot;</span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    <span className="text-zinc-400">{data.audit.summary.info}I</span>
                  </span>
                </div>
              )}
            </Card>

            {/* Load Time */}
            <Card className="p-5 flex flex-col items-center justify-center gap-2" delay={0.2}>
              <span className="text-3xl font-bold text-zinc-100">
                {data.audit ? `${(data.audit.responseTime / 1000).toFixed(2)}s` : '--'}
              </span>
              <span className="text-xs text-zinc-500">Load Time</span>
              {data.audit && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${loadTimeColor(data.audit.responseTime / 1000)}`}
                >
                  {data.audit.responseTime / 1000 < 1.5
                    ? 'Fast'
                    : data.audit.responseTime / 1000 < 3
                      ? 'Moderate'
                      : 'Slow'}
                </span>
              )}
            </Card>
          </div>

          {/* b) Core Web Vitals */}
          {data.pagespeed && (
            <Card className="p-5" delay={0.25}>
              <SectionHeader icon={Activity} title="Core Web Vitals" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'LCP', data: data.pagespeed.lcp },
                  { label: 'CLS', data: data.pagespeed.cls },
                  { label: 'TBT', data: data.pagespeed.tbt },
                  { label: 'FCP', data: data.pagespeed.fcp },
                  { label: 'Speed Index', data: data.pagespeed.si },
                ].map(({ label, data: metric }) => {
                  const rating = ratingColor(metric.rating)
                  return (
                    <div
                      key={label}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 flex flex-col items-center gap-1.5"
                    >
                      <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
                      <span className="text-lg font-bold text-zinc-200">
                        {metric.value}
                        <span className="text-xs font-normal text-zinc-500 ml-0.5">
                          {metric.unit}
                        </span>
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${rating.bg} ${rating.text}`}
                      >
                        {rating.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* c) Two-column: Issues + Page Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Top Issues */}
            <Card className="p-5" delay={0.3}>
              <SectionHeader icon={AlertTriangle} title="Top Issues" />
              {sortedIssues.length === 0 ? (
                <p className="text-xs text-zinc-500">No issues found.</p>
              ) : (
                <div className="space-y-2.5">
                  {sortedIssues.slice(0, 8).map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-start gap-2.5 rounded-lg bg-white/[0.02] border border-white/[0.03] p-3"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityColor(issue.severity)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-300">{issue.title}</p>
                        <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">
                          {issue.description}
                        </p>
                      </div>
                    </div>
                  ))}
                  {data.audit && sortedIssues.length > 8 && (
                    <Link
                      href={`/dashboard/audit?url=${encodeURIComponent(data.url)}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      View all in Full Audit
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {/* Right: Page Analysis */}
            <Card className="p-5" delay={0.35}>
              <SectionHeader icon={FileText} title="Page Analysis" />
              {data.audit?.meta ? (
                <div className="space-y-4">
                  {/* Meta Info */}
                  <div className="space-y-2.5">
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Title
                        </span>
                        {data.audit.meta.title && charCountBadge(data.audit.meta.title.length, 30, 60)}
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 break-all">
                        {data.audit.meta.title || <span className="text-red-400">Not set</span>}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                          Description
                        </span>
                        {data.audit.meta.description &&
                          charCountBadge(data.audit.meta.description.length, 150, 160)}
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 line-clamp-3 break-all">
                        {data.audit.meta.description || (
                          <span className="text-red-400">Not set</span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Canonical
                      </span>
                      <p className="text-xs text-zinc-300 mt-1 break-all">
                        {data.audit.meta.canonical || (
                          <span className="text-red-400">Not set</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: 'Word Count',
                        value: data.audit.meta.wordCount.toLocaleString(),
                      },
                      {
                        label: 'Page Size',
                        value: formatBytes(data.audit.meta.pageSize),
                      },
                      {
                        label: 'H1 Tags',
                        value: data.audit.meta.headings.h1.toString(),
                      },
                      {
                        label: 'Images',
                        value: `${data.audit.meta.images.withAlt}/${data.audit.meta.images.total}`,
                        sub: `${data.audit.meta.images.withoutAlt} missing alt`,
                      },
                      {
                        label: 'Internal Links',
                        value: data.audit.meta.links.internal.toLocaleString(),
                      },
                      {
                        label: 'External Links',
                        value: data.audit.meta.links.external.toLocaleString(),
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-2.5 text-center"
                      >
                        <p className="text-lg font-bold text-zinc-200">{stat.value}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{stat.label}</p>
                        {stat.sub && (
                          <p className="text-[10px] text-amber-400/70 mt-0.5">{stat.sub}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No page analysis data available.</p>
              )}
            </Card>
          </div>

          {/* d) Keyword Opportunities */}
          {data.keywords && data.keywords.length > 0 && (
            <Card className="p-5" delay={0.4}>
              <SectionHeader
                icon={Target}
                title="Keyword Opportunities"
                subtitle="AI-Powered Keyword Research"
              />
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      {['Keyword', 'Volume', 'Difficulty', 'Intent', 'Content Type'].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.keywords.map((kw) => {
                      const db = difficultyBadge(kw.difficulty)
                      const expanded = expandedKeyword === kw.keyword
                      return (
                        <Fragment key={kw.keyword}>
                          <tr
                            onClick={() =>
                              setExpandedKeyword(expanded ? null : kw.keyword)
                            }
                            className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                {expanded ? (
                                  <ChevronUp className="h-3 w-3 text-zinc-500 shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
                                )}
                                <span className="text-xs text-zinc-300">{kw.keyword}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-zinc-400">
                              {kw.volume.toLocaleString()}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium ${db.bg} ${db.text}`}
                              >
                                {kw.difficulty}
                              </span>
                            </td>
                            <td className={`px-5 py-3 text-xs font-medium ${intentColor(kw.intent)}`}>
                              {kw.intent}
                            </td>
                            <td className="px-5 py-3 text-xs text-zinc-400">{kw.contentType}</td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-white/[0.03]">
                              <td colSpan={5} className="px-5 py-3">
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  transition={{ duration: 0.2 }}
                                  className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3"
                                >
                                  <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
                                    Why this keyword?
                                  </p>
                                  <p className="text-xs text-zinc-400">{kw.reason}</p>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* e) Bottom Row: Technologies, Robots, Sitemap */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Technology Stack */}
            <Card className="p-5" delay={0.45}>
              <SectionHeader icon={Cpu} title="Technology Stack" />
              {data.technologies && data.technologies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No technologies detected</p>
              )}
            </Card>

            {/* Robots.txt */}
            <Card className="p-5" delay={0.5}>
              <SectionHeader icon={Shield} title="Robots.txt" />
              {data.robots ? (
                <div className="space-y-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      data.robots.found
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {data.robots.found ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    {data.robots.found ? 'Found' : 'Not Found'}
                  </span>
                  {data.robots.found && data.robots.rules.length > 0 && (
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-2.5">
                      {data.robots.rules.slice(0, 5).map((rule, i) => (
                        <p key={i} className="font-mono text-[11px] text-zinc-400 truncate">
                          {rule}
                        </p>
                      ))}
                      {data.robots.rules.length > 5 && (
                        <p className="text-[10px] text-zinc-600 mt-1">
                          +{data.robots.rules.length - 5} more rules
                        </p>
                      )}
                    </div>
                  )}
                  {data.robots.sitemapUrls && data.robots.sitemapUrls.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Sitemaps
                      </p>
                      {data.robots.sitemapUrls.map((url, i) => (
                        <p key={i} className="font-mono text-[11px] text-cyan-400 truncate">
                          {url}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No robots.txt data</p>
              )}
            </Card>

            {/* Sitemap */}
            <Card className="p-5" delay={0.55}>
              <SectionHeader icon={Map} title="Sitemap" />
              {data.sitemap ? (
                <div className="space-y-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      data.sitemap.found
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {data.sitemap.found ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    {data.sitemap.found ? 'Found' : 'Not Found'}
                  </span>
                  {data.sitemap.found && (
                    <div className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3 text-center">
                      <p className="text-2xl font-bold text-zinc-200">
                        {data.sitemap.urlCount.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">URLs indexed</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No sitemap data</p>
              )}
            </Card>
          </div>

          {/* f) PageSpeed Opportunities */}
          {data.pagespeed?.opportunities && data.pagespeed.opportunities.length > 0 && (
            <Card className="p-5" delay={0.6}>
              <SectionHeader icon={Zap} title="PageSpeed Opportunities" />
              <div className="space-y-2">
                {data.pagespeed.opportunities.map((opp, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-4 rounded-lg bg-white/[0.02] border border-white/[0.03] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-zinc-300">{opp.title}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">
                        {opp.description}
                      </p>
                    </div>
                    {opp.savingsMs > 0 && (
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Save {opp.savingsMs >= 1000 ? `${(opp.savingsMs / 1000).toFixed(1)}s` : `${Math.round(opp.savingsMs)}ms`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* g) Readability Analysis */}
          <Card className="p-5" delay={0.63}>
            <SectionHeader
              icon={BookOpen}
              title="Readability Analysis"
              subtitle="Flesch-Kincaid readability scoring"
            />
            {data.readability ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="relative flex items-center justify-center">
                    <ScoreRing
                      score={data.readability.score}
                      size={80}
                      label="Readability"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${readabilityRatingStyle(data.readability.rating).bg} ${readabilityRatingStyle(data.readability.rating).text}`}
                      >
                        {data.readability.rating}
                      </span>
                      <span className="text-xs text-zinc-500">
                        Grade Level: {data.readability.grade}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {readabilityRecommendation(data.readability.score)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Word Count', value: data.readability.wordCount.toLocaleString() },
                    { label: 'Sentence Count', value: data.readability.sentenceCount.toLocaleString() },
                    { label: 'Avg Words/Sentence', value: data.readability.avgWordsPerSentence.toString() },
                    { label: 'Avg Syllables/Word', value: data.readability.avgSyllablesPerWord.toString() },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-2.5 text-center"
                    >
                      <p className="text-lg font-bold text-zinc-200">{stat.value}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                <p className="text-xs text-zinc-500">Analyzing readability...</p>
              </div>
            )}
          </Card>

          {/* h) AI Search Readiness (GEO) */}
          <Card className="p-5" delay={0.66}>
            <SectionHeader
              icon={Brain}
              title="AI Search Readiness (GEO)"
              subtitle="Generative Engine Optimization scoring"
            />
            {data.geoReadiness ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="relative flex items-center justify-center shrink-0">
                    <ScoreRing
                      score={data.geoReadiness.overallScore}
                      size={80}
                      label="GEO Score"
                    />
                  </div>
                  <div className="flex-1 w-full space-y-3">
                    {(
                      [
                        { key: 'citability' as const, label: 'Citability', weight: '25%' },
                        { key: 'structure' as const, label: 'Structural Readability', weight: '30%' },
                        { key: 'multimodal' as const, label: 'Multi-modal Content', weight: '20%' },
                        { key: 'authority' as const, label: 'Authority Signals', weight: '25%' },
                      ] as const
                    ).map(({ key, label, weight }) => {
                      const cat = data.geoReadiness!.categories[key]
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-zinc-300">
                              {label}{' '}
                              <span className="text-zinc-600 text-[10px]">({weight})</span>
                            </span>
                            <span className={`text-xs font-semibold ${geoTextColor(cat.score)}`}>
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
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Findings details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(
                    [
                      { key: 'citability' as const, label: 'Citability' },
                      { key: 'structure' as const, label: 'Structure' },
                      { key: 'multimodal' as const, label: 'Multi-modal' },
                      { key: 'authority' as const, label: 'Authority' },
                    ] as const
                  ).map(({ key, label }) => {
                    const cat = data.geoReadiness!.categories[key]
                    return (
                      <div
                        key={key}
                        className="rounded-lg bg-white/[0.02] border border-white/[0.03] p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            {label}
                          </span>
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
                        </div>
                        <ul className="space-y-1">
                          {cat.findings.map((finding, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                              <span className="text-[11px] text-zinc-400">{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                <p className="text-xs text-zinc-500">Analyzing AI search readiness...</p>
              </div>
            )}
          </Card>

          {/* i) Action Buttons Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href={`/dashboard/audit?url=${encodeURIComponent(data.url)}`}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.65 }}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a12]/80 p-5 transition-all hover:border-cyan-500/20 hover:bg-cyan-500/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
                  <ScanSearch className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-cyan-300 transition-colors">
                    Full Site Audit
                  </p>
                  <p className="text-[11px] text-zinc-500">Deep-dive analysis</p>
                </div>
              </motion.div>
            </Link>

            <Link href="/dashboard/blog">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.7 }}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a12]/80 p-5 transition-all hover:border-emerald-500/20 hover:bg-emerald-500/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Sparkles className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-emerald-300 transition-colors">
                    Generate Content
                  </p>
                  <p className="text-[11px] text-zinc-500">AI-powered blog posts</p>
                </div>
              </motion.div>
            </Link>

            <Link href="/dashboard/seo">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.75 }}
                className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#0a0a12]/80 p-5 transition-all hover:border-purple-500/20 hover:bg-purple-500/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
                  <MessageSquare className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200 group-hover:text-purple-300 transition-colors">
                    AI Chat
                  </p>
                  <p className="text-[11px] text-zinc-500">Ask about your SEO</p>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
