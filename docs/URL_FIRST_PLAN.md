# URL-First Onboarding: Detailed Implementation Plan

> Turn seosearchconsole.com into "Enter URL → Instant AI SEO Analysis" (like SEObot)
> Generated: 2026-03-20

---

## The Concept

```
User enters URL
    ↓
Phase 1: Scrape homepage + discover pages (3-5 sec)
    ↓
Phase 2: Crawl top 10-20 pages (5-10 sec)
    ↓
Phase 3: Run all analysis services (2-5 sec)
    ↓
Phase 4: AI (Gemini) synthesizes everything into plain-English insights
    ↓
Show results (no login required)
    ↓
CTA: "Want traffic data? Connect Google Search Console"
```

---

## What We Can Reuse

### From pseo.site (Crawling + Structure Analysis)

| Component | File | What It Does | Reuse How |
|-----------|------|-------------|-----------|
| **Cheerio Crawler** | `lib/crawler.ts` | Discovers pages via sitemap + deep crawl, extracts SEO data per page | Port the crawl logic — it extracts title, H1, meta, word count, schema, images, links per page |
| **URL Pattern Detection** | `lib/analyze-urls.ts` | Groups URLs by structure, detects programmatic vs editorial vs structural | Use to show "Your site structure" analysis |
| **PSEO Scoring** | `lib/pseo-score.ts` | 7-factor score (pattern variety, programmatic scale, content depth, site size) | Adapt into an "SEO Structure Score" |
| **Link Graph** | `api/link-graph/route.ts` | Computes internal link equity, orphan pages, link distribution | Show link health visualization |
| **Blueprint Extraction** | `api/extract-blueprint/route.ts` | Gemini analyzes 3 sample pages → detects templates, variables, content strategy | Use for AI site analysis |
| **On-Page SEO Aggregation** | `lib/onpage-seo.ts` | Groups pages by pattern, detects title/H1 templates, schema coverage | Show content consistency analysis |
| **SSE Streaming** | `api/analyze/route.ts` | Real-time progress events during crawl | Reuse exact same streaming pattern |

### From seosearchconsole.com (Analysis Services — Already Built!)

| Service | What It Does | GSC Needed? | Use In URL-First? |
|---------|-------------|-------------|-------------------|
| **Technical SEO Audit** (9 categories) | Crawlability, indexability, security, mobile, URLs, CWV, schema, JS, IndexNow | No | **YES** — full audit from HTML |
| **Content Quality** | Word count, content-to-code ratio, thin content, quality tier | No | **YES** — per page quality |
| **Internal Link Crawler** | BFS crawl, link attributes, orphans, broken links, redirect chains | No | **YES** — link health |
| **GEO Insights** (AI Readiness) | 5-dimension scoring for Google AI Overview, ChatGPT, Perplexity | No | **YES** — unique feature |
| **Readability** | Flesch score, grade level, passive voice | No | **YES** — content quality |
| **Schema Detection** | JSON-LD types, validation, missing recommendations | No | **YES** — structured data |
| **Image SEO** | Alt text, formats, dimensions, CDN usage | No | **YES** — image audit |
| **Page Audit** | Title, meta, headings, word count, images, canonical | No | **YES** — per-page checks |
| **Keyword Planner** | Search volume, competition for any keywords | No | **YES** — extract keywords from content → get volume |
| **E-E-A-T Analysis** | Experience, expertise, authority, trust signals | No | **YES** — from HTML |
| **Robots.txt Analysis** | Crawler access, AI bot compatibility | No | **YES** — from URL |
| Power Pages | Authority + opportunity scoring | **Yes** | No (GSC upsell) |
| Topic Clusters | Pillar-spoke identification | **Yes** | No (GSC upsell) |
| Mission Control | Actionable missions | **Yes** | No (GSC upsell) |
| Internal Link Suggestions | Where to add links | **Yes** | Partial (crawler-only) |

**Result: 13 analysis services run WITHOUT GSC. Only 4 require GSC.**

---

## The Analysis Pipeline

### What Gets Analyzed (Per URL Entry)

```
User enters: example.com
                │
                ▼
┌─────────────────────────────────────────────────┐
│ PHASE 1: Discovery (3-5 seconds)                │
│                                                 │
│ 1. Fetch robots.txt                             │
│    → Crawler rules, sitemap location            │
│    → AI bot access (GPTBot, ClaudeBot, etc.)    │
│                                                 │
│ 2. Fetch sitemap.xml                            │
│    → All page URLs (up to 500)                  │
│    → Last modified dates                        │
│                                                 │
│ 3. Fetch homepage HTML                          │
│    → Title, meta, H1, schema, word count        │
│    → Discover nav links → key pages             │
│                                                 │
│ SSE: "Discovered 150 pages on your site..."     │
└─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ PHASE 2: Smart Crawl (5-10 seconds)             │
│                                                 │
│ Crawl top 15-30 pages (free) / 100 (pro):       │
│ → Homepage                                      │
│ → Top nav pages (about, pricing, blog, etc.)    │
│ → 2-3 samples per URL pattern                   │
│ → Key content pages (longest, most linked)      │
│                                                 │
│ Per page extract:                               │
│ → title, h1, h2s, meta description              │
│ → word count, content-to-code ratio             │
│ → schema types (JSON-LD)                        │
│ → internal links (count + targets)              │
│ → external links (count + targets)              │
│ → images (count, alt text rate)                 │
│ → canonical, hreflang, robots meta              │
│ → OG tags, viewport, security headers           │
│                                                 │
│ SSE: "Crawling page 12 of 20..."               │
└─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ PHASE 3: Analysis (2-5 seconds, parallel)       │
│                                                 │
│ All run in parallel on crawled data:            │
│                                                 │
│ A. Technical SEO Audit (9 categories)           │
│    → Security, mobile, crawlability, etc.       │
│    → Score per category (0-100)                 │
│                                                 │
│ B. Content Quality Analysis                     │
│    → Per-page quality tier                      │
│    → Thin content detection                     │
│    → Reading level + readability                │
│                                                 │
│ C. URL Structure & Patterns                     │
│    → Pattern detection (from pseo.site logic)   │
│    → Programmatic vs editorial vs structural    │
│    → Depth distribution                         │
│                                                 │
│ D. Internal Link Analysis                       │
│    → Link equity distribution                   │
│    → Orphan pages                               │
│    → Broken links                               │
│    → Hub pages (most linked)                    │
│                                                 │
│ E. AI Search Readiness (GEO)                    │
│    → Google AI Overview score                   │
│    → ChatGPT citation score                     │
│    → Perplexity citation score                  │
│                                                 │
│ F. Schema & Structured Data                     │
│    → What's present, what's missing             │
│    → Recommendations per page type              │
│                                                 │
│ G. Image SEO                                    │
│    → Alt text coverage                          │
│    → Format optimization (WebP?)                │
│    → Missing dimensions                         │
│                                                 │
│ H. E-E-A-T Signals                              │
│    → Author attribution                         │
│    → Citations and references                   │
│    → Date signals and freshness                 │
│                                                 │
│ I. Keyword Extraction + Volume                  │
│    → Extract top keywords from H1s, titles      │
│    → Fetch search volume from Keyword Planner   │
│    → Show opportunity: "your topics get X       │
│      monthly searches"                          │
│                                                 │
│ SSE: "Running 9 analysis modules..."            │
└─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ PHASE 4: AI Synthesis (2-3 seconds)             │
│                                                 │
│ Feed ALL analysis data to Gemini 2.5 Flash:     │
│                                                 │
│ Prompt:                                         │
│ "You are an expert SEO consultant. I've just    │
│  analyzed {domain}. Here's the raw data:        │
│  [technical audit, content quality, link graph, │
│   GEO scores, schema, keywords, structure]      │
│                                                 │
│  Generate:                                      │
│  1. One-paragraph site summary (what it does,   │
│     who it's for, content strategy)             │
│  2. Overall SEO score (0-100) with breakdown    │
│  3. Top 5 critical issues to fix (with fixes)   │
│  4. Top 3 growth opportunities                  │
│  5. Content strategy recommendations            │
│  6. Competitor positioning insight"             │
│                                                 │
│ SSE: "Generating AI recommendations..."         │
└─────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────┐
│ RESULTS PAGE                                    │
│                                                 │
│ ┌─────────────────────────────────┐             │
│ │ SEO Score: 72/100               │             │
│ │ ██████████████░░░░░░ 72%        │             │
│ └─────────────────────────────────┘             │
│                                                 │
│ 📝 AI Summary                                  │
│ "example.com is a SaaS tool for... Their site   │
│  has solid technical fundamentals but weak       │
│  internal linking and missing schema markup..."  │
│                                                 │
│ 🏆 Score Breakdown                              │
│ ├── Technical SEO:    85/100 ████████░░         │
│ ├── Content Quality:  68/100 ██████░░░░         │
│ ├── Link Health:      55/100 █████░░░░░         │
│ ├── AI Readiness:     62/100 ██████░░░░         │
│ ├── Schema Coverage:  40/100 ████░░░░░░         │
│ └── Site Structure:   78/100 ███████░░░         │
│                                                 │
│ 🔴 Critical Issues (5)                          │
│ 1. Missing FAQ schema on 12 pages               │
│    Fix: Add FAQPage JSON-LD → [Generate Schema] │
│ 2. 8 orphan pages (no internal links)           │
│    Fix: Add links from hub pages → [See Map]    │
│ 3. Thin content on /about (89 words)            │
│    Fix: Expand to 300+ words with...            │
│ 4. No hreflang despite 3 language versions      │
│    Fix: Add hreflang tags → [Generate Tags]     │
│ 5. Images missing alt text (62% coverage)       │
│    Fix: Add descriptive alt attributes          │
│                                                 │
│ 🚀 Growth Opportunities                         │
│ 1. "Your keywords get 45K monthly searches.     │
│     You could rank for 12 more with content."   │
│ 2. "Your blog pattern has only 8 posts.         │
│     Competitors average 50+."                   │
│ 3. "AI search readiness is 62/100.              │
│     Fix schema + structure for AI citations."   │
│                                                 │
│ 📊 Site Structure                               │
│ ├── 150 total pages discovered                  │
│ ├── 3 URL patterns detected                     │
│ │   /blog/{post} — 45 pages (editorial)         │
│ │   /features/{feature} — 12 pages (structural) │
│ │   /pricing — 1 page (structural)              │
│ ├── Depth: avg 2.3 (optimal)                    │
│ └── Programmatic potential: 35%                  │
│                                                 │
│ 🔗 Internal Links                               │
│ ├── Avg links per page: 15                      │
│ ├── Orphan pages: 8                             │
│ ├── Hub page: /blog (42 outlinks)               │
│ └── [View Link Map]                             │
│                                                 │
│ 🤖 AI Search Readiness                          │
│ ├── Google AI Overview: 65/100                  │
│ ├── ChatGPT Citations:  58/100                  │
│ └── Perplexity:         62/100                  │
│                                                 │
│ 🔍 Keyword Opportunities                        │
│ ├── "seo tool" — 12,100/mo — not ranking        │
│ ├── "page audit" — 2,400/mo — not ranking       │
│ └── Connect GSC for ranking data →              │
│                                                 │
│ ┌─────────────────────────────────────────┐     │
│ │ 🔒 Want traffic data & rankings?        │     │
│ │                                         │     │
│ │ Connect Google Search Console to see:   │     │
│ │ • Which keywords you rank for           │     │
│ │ • Traffic trends & anomalies            │     │
│ │ • CTR optimization opportunities        │     │
│ │ • Keyword cannibalization               │     │
│ │ • Topic cluster analysis                │     │
│ │                                         │     │
│ │ [Connect Google Search Console →]       │     │
│ └─────────────────────────────────────────┘     │
│                                                 │
│ 💬 Ask AI about your site                       │
│ ┌─────────────────────────────────┐             │
│ │ "How can I improve my blog SEO?" │  [Send]   │
│ └─────────────────────────────────┘             │
│                                                 │
│ The AI chatbot has your full site context —      │
│ it knows every issue, every page, every link.   │
└─────────────────────────────────────────────────┘
```

---

## Implementation Architecture

### New Files to Create

```
seositemap-nextjs/
├── app/
│   ├── analyze/                          # NEW: URL-first analysis flow
│   │   ├── page.tsx                      # URL input + SSE results page
│   │   └── [slug]/page.tsx               # Shareable report page (SEO value!)
│   ├── api/
│   │   └── site-analyze/                 # NEW: Main analysis endpoint
│   │       └── route.ts                  # SSE streaming analysis pipeline
├── services/
│   ├── siteAnalysisPipeline.ts           # NEW: Orchestrates all analysis
│   ├── crawlerService.ts                 # NEW: Adapted from pseo.site crawler
│   └── aiSynthesisService.ts             # NEW: Gemini summarization
```

### Files to Modify

```
├── app/
│   ├── page.tsx                          # Add URL input to landing page hero
│   └── dashboard/
│       └── overview/page.tsx             # Pre-populate with URL analysis data
├── services/
│   └── chatSystemPrompt.ts              # Include scraped data in context
├── context/
│   └── DashboardContext.tsx              # Accept URL analysis as initial state
```

---

## Detailed Implementation Steps

### Step 1: Port Crawler from pseo.site

Create `services/crawlerService.ts` — adapted from pseo.site's `lib/crawler.ts`:

```typescript
// What to port:
// 1. Sitemap discovery (robots.txt + sitemap.xml)
// 2. Cheerio-based page crawling (title, h1, meta, schema, links, images)
// 3. Pattern-aware stopping (max N pages per pattern)
// 4. SSE progress callbacks

// What to change:
// - Lighter: max 20 pages free, 100 pro (pseo does 300-1000)
// - Faster: 5s timeout (same as pseo)
// - Add: content extraction (full body text for AI analysis)
// - Add: nav link discovery (find key pages from homepage nav)

interface CrawlResult {
  pages: PageData[];
  sitemapUrls: string[];
  robotsTxt: string | null;
  patterns: UrlPattern[];
  discoveredPages: number;
}

interface PageData {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h2s: string[];
  wordCount: number;
  contentText: string;           // Body text for AI (first 1000 chars)
  imageCount: number;
  imagesWithAlt: number;
  schemaTypes: string[];
  internalLinks: { url: string; anchor: string }[];
  externalLinks: { url: string; anchor: string }[];
  canonical: string | null;
  hasViewport: boolean;
  hasOgTitle: boolean;
  hasOgImage: boolean;
  hreflangCount: number;
  robotsMeta: string | null;
  statusCode: number;
  responseTime: number;
}
```

### Step 2: Create Analysis Pipeline

Create `services/siteAnalysisPipeline.ts` — orchestrates everything:

```typescript
// Runs ALL analysis services in parallel on crawled data
async function analyzeSite(domain: string, onProgress: SSECallback): SiteAnalysis {

  // Phase 1: Crawl
  const crawlResult = await crawlSite(domain, { maxPages: 20 });

  // Phase 2: Run all analyses in parallel
  const [
    technicalAudit,      // 9-category technical SEO (existing service)
    contentQuality,      // Per-page content analysis (existing service)
    linkAnalysis,        // Internal link graph (from pseo.site logic)
    geoScores,           // AI search readiness (existing service)
    schemaAudit,         // Schema detection (existing service)
    imageAudit,          // Image SEO (existing service)
    readability,         // Readability per page (existing service)
    eeatAnalysis,        // E-E-A-T signals (existing service)
    urlPatterns,         // URL structure (from pseo.site logic)
    keywordData,         // Extract keywords → Keyword Planner volume
  ] = await Promise.allSettled([
    runTechnicalSeoAudit(homepage),
    analyzeContentQuality(pages),
    computeLinkGraph(pages),
    analyzeGeoInsights(homepage),
    detectSchemas(pages),
    analyzeImages(pages),
    analyzeReadability(homepage),
    analyzeEeat(homepage),
    analyzeUrlPatterns(allUrls),
    extractAndEnrichKeywords(pages),
  ]);

  // Phase 3: AI Synthesis
  const aiSummary = await synthesizeWithGemini(allResults);

  // Phase 4: Compute overall score
  const overallScore = computeOverallScore(allResults);

  return { crawlResult, analyses, aiSummary, overallScore };
}
```

### Step 3: Create SSE API Route

Create `app/api/site-analyze/route.ts`:

```typescript
// SSE streaming endpoint (same pattern as pseo.site's /api/analyze)
// Events:
//   phase    → { phase: "crawling" | "analyzing" | "ai", message: string }
//   progress → { crawled: 5, total: 20, percent: 25 }
//   result   → { section: "technical" | "content" | "links" | ..., data: ... }
//   summary  → { aiSummary, overallScore, topIssues, opportunities }
//   done     → { success: true, reportId: "abc123" }

// Rate limiting: 3 analyses/day for anonymous, 10 for free users, unlimited for pro
```

### Step 4: Keyword Extraction + Planner Volume

New logic that doesn't exist in either codebase:

```typescript
// 1. Extract keywords from crawled pages
function extractKeywords(pages: PageData[]): string[] {
  // From H1 tags (primary intent)
  // From title tags (ranking targets)
  // From H2 headings (topic coverage)
  // Deduplicate, lowercase, remove brand terms
  // Return top 20 keywords
}

// 2. Get search volume from Keyword Planner (existing API!)
// POST /api/keyword-research/ideas
// Input: extracted keywords
// Output: volume, competition per keyword

// 3. Show: "Your topics get 45K monthly searches"
// This is UNIQUE — no free tool does keyword extraction + volume lookup
```

### Step 5: AI Synthesis with Gemini

Create `services/aiSynthesisService.ts`:

```typescript
// Feed all analysis data to Gemini 2.5 Flash
async function synthesizeWithGemini(data: AllAnalysisData): AISummary {
  const prompt = `
    You are an expert SEO consultant analyzing ${data.domain}.

    Here is the complete analysis data:
    - Technical SEO: ${JSON.stringify(data.technical)}
    - Content Quality: ${JSON.stringify(data.content)}
    - Link Health: ${JSON.stringify(data.links)}
    - AI Readiness: ${JSON.stringify(data.geo)}
    - Schema: ${JSON.stringify(data.schema)}
    - Keywords: ${JSON.stringify(data.keywords)}
    - Site Structure: ${JSON.stringify(data.patterns)}

    Generate a JSON response:
    {
      "siteSummary": "One paragraph describing what this site does, who it serves",
      "overallScore": 72,
      "scoreBreakdown": {
        "technicalSeo": 85,
        "contentQuality": 68,
        "linkHealth": 55,
        "aiReadiness": 62,
        "schemaCoverage": 40,
        "siteStructure": 78
      },
      "criticalIssues": [
        { "title": "...", "impact": "high", "fix": "...", "category": "..." }
      ],
      "opportunities": [
        { "title": "...", "potentialImpact": "...", "effort": "low|medium|high" }
      ],
      "contentStrategy": "2-3 sentences on content direction",
      "competitorInsight": "What type of competitors this site faces"
    }
  `;
}
```

### Step 6: Results Page UI

Create `app/analyze/page.tsx`:

```
┌──────────────────────────────────────────────────┐
│ Landing state:                                   │
│                                                  │
│ [Logo] SEO Search Console                        │
│                                                  │
│  Get a complete SEO analysis in 30 seconds       │
│                                                  │
│  ┌────────────────────────────────┐              │
│  │ https://yoursite.com           │  [Analyze]   │
│  └────────────────────────────────┘              │
│                                                  │
│  No signup required. 50+ checks. AI-powered.     │
│                                                  │
│  Trusted by 500+ websites                        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Analyzing state (SSE streaming):                 │
│                                                  │
│  Analyzing yoursite.com                          │
│                                                  │
│  ✅ Discovered sitemap (150 pages)               │
│  ✅ Crawled homepage + key pages                 │
│  🔄 Running technical audit...                   │
│  ⏳ Analyzing content quality...                 │
│  ⏳ Checking AI search readiness...              │
│  ⏳ Generating AI recommendations...             │
│                                                  │
│  ████████████░░░░░░░░ 60%                        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ Results state:                                   │
│                                                  │
│  [Full results as shown in pipeline section]     │
│                                                  │
│  Sections:                                       │
│  1. AI Summary + Overall Score                   │
│  2. Score Breakdown (6 categories)               │
│  3. Critical Issues (expandable cards)           │
│  4. Growth Opportunities                         │
│  5. Site Structure (URL patterns)                │
│  6. Internal Link Map                            │
│  7. AI Search Readiness                          │
│  8. Keyword Opportunities                        │
│  9. AI Chat (contextual)                         │
│  10. GSC upsell banner                           │
│                                                  │
│  [Share Report] [Download PDF] [Connect GSC →]   │
└──────────────────────────────────────────────────┘
```

### Step 7: Shareable Report Pages (SEO Gold)

Create `app/analyze/[slug]/page.tsx`:

Every analysis generates a shareable URL like:
```
seosearchconsole.com/analyze/example-com
```

This page is **indexable by Google**, which means:
- Every analyzed site = a new page on your domain
- Google indexes these → you rank for "[sitename] SEO audit"
- Users share their reports → backlinks
- Viral loop: "Check your site's SEO score" → share → more users

---

## Complete Feature List (What Gets Shown)

### Free (No Login) — 20 pages crawled

| # | Feature | Source | Description |
|---|---------|--------|-------------|
| 1 | **AI Site Summary** | Gemini | What the site does, who it serves, content strategy |
| 2 | **Overall SEO Score** (0-100) | Composite | Weighted average of all categories |
| 3 | **Technical SEO** (9 sub-scores) | SSC service | Crawlability, indexability, security, mobile, URLs, CWV, schema, JS, IndexNow |
| 4 | **Content Quality** | SSC service | Per-page quality tier, thin content flags, readability |
| 5 | **Readability Score** | SSC service | Flesch reading ease, grade level, passive voice % |
| 6 | **URL Structure Analysis** | pseo.site logic | Pattern detection, depth distribution, programmatic % |
| 7 | **Internal Link Health** | pseo.site logic | Orphan pages, link equity, hub pages, broken links |
| 8 | **AI Search Readiness** | SSC service | Google AI Overview, ChatGPT, Perplexity scores |
| 9 | **Schema Audit** | SSC service | Present types, missing recommendations, validation |
| 10 | **Image SEO** | SSC service | Alt text coverage, format optimization |
| 11 | **E-E-A-T Signals** | SSC service | Author attribution, citations, freshness |
| 12 | **Robots.txt Analysis** | SSC service | AI crawler access, sitemap references |
| 13 | **Keyword Extraction** | NEW | Top keywords from titles/H1s with search volume from Planner |
| 14 | **Top 5 Critical Issues** | Gemini | AI-prioritized issues with specific fix instructions |
| 15 | **Top 3 Opportunities** | Gemini | Growth recommendations based on data |
| 16 | **AI Chat** (limited) | SSC service | Ask questions about the analysis (5 messages free) |
| 17 | **Shareable Report URL** | NEW | Public URL for sharing |

### Pro (Login + Subscription) — 100 pages crawled

| # | Feature | Source | Description |
|---|---------|--------|-------------|
| 18 | **Full site crawl** (100 pages) | Crawler | Deeper analysis, more patterns |
| 19 | **Link map visualization** | pseo.site logic | Interactive force-directed graph |
| 20 | **Per-page analysis table** | Combined | Sortable table with all metrics per page |
| 21 | **Content strategy** | Gemini | Detailed content recommendations |
| 22 | **Competitor comparison** | NEW | Enter competitor URL, side-by-side |
| 23 | **PDF export** | pseo.site logic | Branded PDF report |
| 24 | **Unlimited AI chat** | SSC service | Full context chat |
| 25 | **Historical tracking** | Supabase | Re-analyze monthly, see trends |

### GSC Connected (Upsell)

| # | Feature | Source | Description |
|---|---------|--------|-------------|
| 26 | **Real traffic data** | GSC API | Clicks, impressions, CTR, position |
| 27 | **Keyword rankings** | GSC API | Every keyword you rank for |
| 28 | **Traffic trends** | GSC API | Period-over-period comparison |
| 29 | **Topic clusters** | SSC service | Pillar-spoke identification |
| 30 | **Power pages** | SSC service | Authority + opportunity scoring |
| 31 | **Internal link suggestions** | SSC service | AI-powered "add link from A to B" |
| 32 | **Mission Control** | SSC service | GROW / FIX / QUICK_WINS missions |
| 33 | **Keyword cannibalization** | SSC service | Pages competing for same keywords |
| 34 | **Content decay detection** | SSC service | Pages losing traffic |

---

## Development Order

### Sprint 1: Core Pipeline (3-5 days)
1. Port crawler from pseo.site → `services/crawlerService.ts`
2. Create analysis pipeline → `services/siteAnalysisPipeline.ts`
3. Create SSE API route → `app/api/site-analyze/route.ts`
4. Create keyword extraction + Planner lookup
5. Create AI synthesis → `services/aiSynthesisService.ts`
6. Test end-to-end: URL → crawl → analyze → AI summary

### Sprint 2: Results UI (3-5 days)
1. Create analyze page with URL input → `app/analyze/page.tsx`
2. Build SSE streaming UI (progress indicators)
3. Build results dashboard (score breakdown, issues, opportunities)
4. Build AI chat integration (pre-loaded with analysis context)
5. Add GSC upsell banner
6. Add landing page URL input (hero section)

### Sprint 3: Shareable Reports + Polish (2-3 days)
1. Create shareable report pages → `app/analyze/[slug]/page.tsx`
2. Add meta tags per report (OG image with score)
3. Add PDF export
4. Rate limiting (3/day free, 10 logged in, unlimited pro)
5. Mobile responsive polish

### Sprint 4: GSC Upgrade Flow (2-3 days)
1. "Connect GSC" flow from results page
2. Merge URL analysis + GSC data into full dashboard
3. Show before/after: "Without GSC" vs "With GSC"
4. Unlock additional features on GSC connection

**Total: ~2-3 weeks to ship the full URL-first experience.**

---

## Why This Wins

| Metric | Current SSC | After URL-First |
|--------|------------|-----------------|
| Time to first value | 5+ minutes (OAuth) | 30 seconds |
| Signup barrier | Google account required | None |
| Shareable | No | Every report = shareable URL |
| SEO value | 0 indexable analysis pages | Unlimited (each analyzed site = page) |
| Viral potential | None | "Check your SEO score" sharing loop |
| Free tool competition | Competes with Ahrefs/SEMrush dashboards | Competes with free audit tools (larger market) |
| GSC conversion | Cold ask | Warm ask after showing value |
| Keyword Planner | Hidden behind login | Visible in results (unique feature) |

**This transforms seosearchconsole.com from a GSC dashboard into the most comprehensive free SEO analysis tool on the internet.**
