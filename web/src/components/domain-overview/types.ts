/* ─── Domain Overview Types & Utilities ─── */

export interface DomainOverviewData {
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

/* ─── Color Helpers ─── */

export function scoreColor(score: number): string {
  if (score >= 80) return '#34d399'
  if (score >= 50) return '#fbbf24'
  return '#ef4444'
}

export function ratingColor(rating: string): { bg: string; text: string; label: string } {
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

export function severityColor(severity: string): string {
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

export function severityOrder(severity: string): number {
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

export function difficultyBadge(d: string) {
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

export function intentColor(intent: string): string {
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

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function readabilityRatingStyle(rating: string): { bg: string; text: string } {
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

export function readabilityRecommendation(score: number): string {
  if (score >= 80) return 'Your content is easy to read for a broad audience. Great for user engagement and SEO.'
  if (score >= 60) return 'Your content has a standard readability level. Consider simplifying some sentences for wider appeal.'
  if (score >= 40) return 'Your content may be difficult for general audiences. Try shorter sentences and simpler vocabulary.'
  return 'Your content is quite hard to read. Consider breaking down complex sentences and using more common words.'
}

export function geoBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export function geoTextColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

/* ─── Action Plan ─── */

export interface ActionPlanItem {
  id: string
  priority: 'critical' | 'high' | 'quick-win'
  title: string
  description: string
  actionLabel: string
  actionContext: string
  category: 'technical' | 'content' | 'performance' | 'ranking'
  link?: string
}

export function generateActionPlan(data: DomainOverviewData, goals: string[]): ActionPlanItem[] {
  const items: ActionPlanItem[] = []

  // Critical: audit issues with critical severity
  if (data.audit?.issues) {
    data.audit.issues
      .filter((i) => i.severity === 'critical')
      .slice(0, 5)
      .forEach((issue, idx) => {
        items.push({
          id: `critical-${idx}`,
          priority: 'critical',
          title: issue.title,
          description: issue.description,
          actionLabel: 'Fix with AI',
          actionContext: `Fix this critical SEO issue on ${data.domain}: ${issue.title}. ${issue.description}`,
          category: 'technical',
        })
      })
  }

  // High: keyword opportunities aligned with goals
  if (data.keywords && (goals.includes('ranking') || goals.includes('content'))) {
    data.keywords.slice(0, 5).forEach((kw, idx) => {
      items.push({
        id: `keyword-${idx}`,
        priority: 'high',
        title: `Target: "${kw.keyword}"`,
        description: `Volume: ${kw.volume}, Difficulty: ${kw.difficulty} — ${kw.reason || 'High potential keyword'}`,
        actionLabel: 'Generate Content',
        actionContext: `Write optimized content targeting the keyword "${kw.keyword}" for ${data.domain}. Intent: ${kw.intent}, Suggested type: ${kw.contentType}`,
        category: goals.includes('content') ? 'content' : 'ranking',
      })
    })
  }

  // High: performance issues aligned with traffic goal
  if (data.pagespeed && (goals.includes('traffic') || goals.includes('technical'))) {
    const perf = data.pagespeed
    if (perf.lcp?.rating !== 'good') {
      items.push({
        id: 'perf-lcp',
        priority: 'high',
        title: `Fix Largest Contentful Paint (${perf.lcp.value}${perf.lcp.unit})`,
        description: `LCP is ${perf.lcp.rating}. This directly impacts user experience and search rankings.`,
        actionLabel: 'Fix with AI',
        actionContext: `Fix LCP which is ${perf.lcp.value}${perf.lcp.unit} (${perf.lcp.rating}) for ${data.domain}`,
        category: 'performance',
      })
    }
    if (perf.opportunities?.length) {
      perf.opportunities.slice(0, 3).forEach((opp, idx) => {
        items.push({
          id: `pagespeed-${idx}`,
          priority: 'quick-win',
          title: opp.title,
          description: `${opp.description}${opp.savingsMs ? ` — Potential savings: ${opp.savingsMs}ms` : ''}`,
          actionLabel: 'Fix with AI',
          actionContext: `Fix this PageSpeed issue: ${opp.title}. ${opp.description}`,
          category: 'performance',
        })
      })
    }
  }

  // Quick wins: readability, GEO
  if (data.readability && data.readability.score < 60 && (goals.includes('content') || goals.includes('ranking'))) {
    items.push({
      id: 'readability',
      priority: 'quick-win',
      title: `Improve Readability (Score: ${data.readability.score.toFixed(0)})`,
      description: `Content is rated "${data.readability.rating}". Improving readability boosts engagement and rankings.`,
      actionLabel: 'Improve with AI',
      actionContext: `Improve content readability for ${data.domain}. Current Flesch-Kincaid score: ${data.readability.score.toFixed(0)} (${data.readability.rating})`,
      category: 'content',
    })
  }

  if (data.geoReadiness && data.geoReadiness.overallScore < 70) {
    items.push({
      id: 'geo',
      priority: 'quick-win',
      title: `Boost AI Search Readiness (Score: ${data.geoReadiness.overallScore})`,
      description: 'Optimize content structure for AI search engines like ChatGPT, Perplexity, and Google AI Overviews.',
      actionLabel: 'Optimize with AI',
      actionContext: `Improve AI search readiness for ${data.domain}. Current GEO score: ${data.geoReadiness.overallScore}/100`,
      category: 'content',
    })
  }

  // Sort: critical first, then high, then quick-win
  const priorityOrder = { critical: 0, high: 1, 'quick-win': 2 }
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return items
}
