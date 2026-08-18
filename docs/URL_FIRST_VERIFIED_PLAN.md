# URL-First Implementation: Verified Plan

> Every service verified against actual source code. Every issue flagged.
> Generated: 2026-03-20

---

## Verification Summary

I read every file referenced in the original plan. Here's what's **actually true** vs what was assumed.

### Service Verification Matrix

| # | Service | File Exists? | Works Without GSC? | Works Server-Side? | Issues Found |
|---|---------|-------------|-------------------|-------------------|--------------|
| 1 | Technical SEO Audit | `technicalSeoService.ts` | **YES** | **NO** — calls `/api/fetch-html-headers` (relative URL) | Must run client-side OR refactor fetch calls |
| 2 | Content Quality | `contentQualityService.ts` | **YES** | **YES** — `analyzeContentQuality(html, url)` is pure sync | Pass pre-fetched HTML |
| 3 | GEO / AI Readiness | `geoInsightsService.ts` | **YES** | **YES** — `analyzeGeoInsights(url, html)` is pure sync | Pass pre-fetched HTML |
| 4 | Image Audit | `imageAuditService.ts` | **YES** | **YES** — `analyzeImages(url, html)` is pure sync | Pass pre-fetched HTML |
| 5 | Readability | `readabilityService.ts` | **YES** | **YES** — `analyzeReadability(text, isHtml)` is pure sync | Pass HTML with `isHtml=true` |
| 6 | E-E-A-T | `eeatScoringService.ts` | **YES** | **YES** — `analyzeEeat(url, html)` is pure sync | Pass pre-fetched HTML |
| 7 | Schema Detection | `schemaDetectorService.ts` | **YES** | **NO** — `analyzePageSchema(url)` calls `/api/fetch-html` internally | Must extract parsing logic OR pass HTML differently |
| 8 | Robots.txt | `robotsTxtService.ts` | **YES** | **NO** — calls `/api/fetch-html-headers` internally | Must fetch robots.txt ourselves, pass result |
| 9 | Keyword Planner | `googleAdsService.ts` | **YES** | **YES** — `getKeywordIdeas(creds, opts)` is standalone | Needs env vars from SSC's `.env.local` |
| 10 | Keyword Intent | `keywordIntentClassifier.ts` | **YES** | **YES** — `classifyIntent(query)` is pure sync | Zero dependencies |
| 11 | Keyword Difficulty | `keywordDifficultyService.ts` | **NO — needs GSC** | N/A | Requires GSC `KeywordOpportunity` type |
| 12 | Internal Link Crawler | `internalLinkCrawlerService.ts` | **YES** | **NO** — uses `DOMParser` (browser-only) | Client-side only, uses Supabase for persistence |
| 13 | Sitemap Parser | `sitemapParser.ts` | **YES** | **NO** — uses `DOMParser` (browser-only) | Client-side only |
| 14 | pseo.site Crawler | `lib/crawler.ts` | **YES** | **YES** — but needs Crawlee (`@crawlee/cheerio`) | Heavy dependency, may not install in SSC project |
| 15 | URL Pattern Analysis | `lib/analyze-urls.ts` | **YES** | **YES** — pure computation, zero deps | Fully portable |
| 16 | On-Page SEO Aggregate | `lib/onpage-seo.ts` | **YES** | **YES** — pure computation, zero deps | Fully portable |
| 17 | PSEO Score | `lib/pseo-score.ts` | **PARTIAL** | **YES** — but needs `Startup` type (TrustMRR revenue) | Revenue fields will be null, score still computes |

---

## Critical Issues Found

### Issue 1: Three Services Call Relative API Routes

`technicalSeoService.ts`, `schemaDetectorService.ts`, and `robotsTxtService.ts` call `/api/fetch-html` or `/api/fetch-html-headers` as relative URLs. They work in the browser (Next.js client-side) but **fail in server-side API routes** unless we use absolute URLs.

**Fix:** In the new server-side API route, fetch HTML ourselves using direct `fetch()`, then pass the raw HTML to the pure analysis functions. We don't call these services directly — we call their underlying logic.

**What actually works server-side (verified):**

```typescript
// These are PURE functions — pass HTML, get results
analyzeContentQuality(html, url)     // ✅ sync, pure
analyzeGeoInsights(url, html)        // ✅ sync, pure
analyzeImages(url, html)             // ✅ sync, pure
analyzeReadability(html, true)       // ✅ sync, pure
analyzeEeat(url, html)               // ✅ sync, pure

// These FETCH internally — cannot call server-side as-is
runTechnicalSeoAudit(url)            // ❌ calls /api/fetch-html-headers
analyzePageSchema(url)               // ❌ calls /api/fetch-html
analyzeRobotsTxt(siteUrl)            // ❌ calls /api/fetch-html-headers
```

### Issue 2: Technical SEO Audit Has 6 Internal Fetches

`runTechnicalSeoAudit(url)` makes **6 separate HTTP requests** for one audit:
1. `/api/fetch-html-headers` (main page HTML + headers)
2. `/api/fetch-html` (on-page analysis — duplicate fetch)
3. `/api/fetch-html` (schema detection — another duplicate)
4. `/api/fetch-html-headers` (robots.txt)
5. `/api/fetch-html-headers` (redirect chain — duplicate of #1)
6. `/api/pagespeed` (Google PageSpeed API)

**Fix:** Fetch HTML + headers ONCE in our pipeline, then pass to each analysis function. This reduces 6 requests to 2 (main page + robots.txt). Skip PageSpeed initially (adds latency, requires separate API).

### Issue 3: pseo.site Crawler Uses Crawlee (Heavy Dependency)

`@crawlee/cheerio` is ~50MB+ with dependencies. Installing it in the SSC project may cause:
- Build size bloat
- Vercel deployment issues (serverless function size limits)
- Dependency conflicts

**Fix:** Don't use Crawlee. Build a lightweight crawler using `cheerio` + `fetch` + concurrency control. The SEO extraction selectors from pseo.site's crawler are portable — they just need a Cheerio `$` root object.

### Issue 4: Sitemap Parser and Internal Link Crawler Are Client-Side Only

Both use `DOMParser` which doesn't exist in Node.js.

**Fix:** For sitemaps, use regex-based XML parsing (pseo.site's `fetchSitemapUrls` already does this with regex, no DOMParser needed). For internal links, use Cheerio on the server.

### Issue 5: Schema Detection Fetches HTML Internally

`analyzePageSchema(url)` calls `/api/fetch-html` instead of accepting HTML as input.

**Fix:** Extract the schema parsing logic (JSON-LD extraction, Microdata extraction, validation) and call it directly with pre-fetched HTML. The parsing is pure regex — it just needs the HTML string.

---

## Corrected Architecture

### What We'll Build (Server-Side API Route)

```
POST /api/site-analyze
  Input: { url: string }
  Output: SSE stream

  Pipeline:
  1. Fetch homepage HTML + headers (1 request)
  2. Fetch robots.txt (1 request)
  3. Discover sitemap URLs from robots.txt (1-3 requests)
  4. Crawl top 15-20 pages with Cheerio (15-20 requests, concurrent)
  5. Run ALL pure analysis functions on pre-fetched HTML (0 requests, pure computation)
  6. Extract keywords from content, get Planner volume (1 API request)
  7. AI synthesis with Gemini (1 API request)
  8. Stream results via SSE

  Total external requests: ~25 (vs 120+ if we called each service separately)
```

### The Corrected Service Call Map

```
Our API route fetches HTML ONCE per page
         │
         ├─→ analyzeContentQuality(html, url)     ✅ Pure, pass HTML
         ├─→ analyzeGeoInsights(url, html)         ✅ Pure, pass HTML
         ├─→ analyzeImages(url, html)              ✅ Pure, pass HTML
         ├─→ analyzeReadability(html, true)        ✅ Pure, pass HTML
         ├─→ analyzeEeat(url, html)                ✅ Pure, pass HTML
         ├─→ extractSchemas(html)                  ✅ Extract JSON-LD/Microdata ourselves
         ├─→ analyzeUrls(domain, allUrls, stats)   ✅ Pure, from pseo.site
         ├─→ aggregateOnPageSeo(seoDataArray)      ✅ Pure, from pseo.site
         ├─→ classifyIntent(keyword)               ✅ Pure, per keyword
         ├─→ getKeywordIdeas(creds, keywords)      ✅ Direct API call
         └─→ Gemini AI synthesis                   ✅ Direct API call

NOT calling (will reimplement):
         ✗ runTechnicalSeoAudit()    → Reimplement with pre-fetched data
         ✗ analyzePageSchema()       → Extract parsing, pass HTML
         ✗ analyzeRobotsTxt()        → Fetch robots.txt ourselves, parse
         ✗ internalLinkCrawlerService → Build lightweight Cheerio crawler
         ✗ sitemapParser              → Use regex-based parsing from pseo.site
```

---

## Verified Feature List (What Actually Works)

### Tier 1: Pure Functions (Zero Risk, Pass HTML)

| Feature | Function | Verified Input | Verified Output |
|---------|----------|---------------|-----------------|
| Content Quality | `analyzeContentQuality(html, url)` | Raw HTML + URL string | `{ wordCount, contentToCodeRatio, thinContent, qualityScore, qualityTier, issues[], h1Count, h2Count, imageCount, imagesWithAlt, internalLinkCount, externalLinkCount }` |
| AI Search Readiness | `analyzeGeoInsights(url, html)` | Raw HTML + URL string | `{ overallScore, dimensions[5], platformScores: { googleAI, chatGPT, perplexity }, recommendations[], rating }` |
| Image SEO | `analyzeImages(url, html)` | Raw HTML + URL string | `{ images[]: { src, alt, hasAlt, altQuality, format, hasDimensions, hasLazyLoading }, summary: { totalImages, missingAlt, score }, cdnDetected, recommendations[] }` |
| Readability | `analyzeReadability(html, true)` | Raw HTML (isHtml=true) | `{ fleschReadingEase, fleschKincaidGrade, totalWords, totalSentences, longSentences, passiveVoicePercentage, readabilityRating, recommendations[] }` |
| E-E-A-T Signals | `analyzeEeat(url, html)` | Raw HTML + URL string | `{ overallScore, dimensions: { experience, expertise, authoritativeness, trustworthiness }, each with signals[] and score, recommendations[] }` |
| Keyword Intent | `classifyIntent(query)` | Keyword string | `'informational' \| 'transactional' \| 'navigational' \| 'commercial'` |
| URL Patterns | `analyzeUrls(domain, urls, stats)` | Domain + URL array + crawl stats | `{ patterns[], scores: { structural, scalability, internalLinking, contentCoverage, overall }, issues[], opportunities[], depthDistribution[] }` |
| On-Page Aggregate | `aggregateOnPageSeo(pages)` | `PageSeoData[]` from crawler | `{ avgWordCount, titleTemplates[], h1Templates[], schemaTypes, pagesWithMeta, imgAltRate, technicalSeo, linkingQuality }` |

### Tier 2: API Calls (Need Credentials, Verified Working)

| Feature | Function | Verified Input | Verified Output | Dependency |
|---------|----------|---------------|-----------------|------------|
| Keyword Volume | `getKeywordIdeas(creds, opts)` | `{ keywords: string[], country: '2840' }` | `KeywordIdea[]: { keyword, avgMonthlySearches, competition, competitionIndex, monthlySearchVolumes }` | Google Ads env vars |
| AI Synthesis | Gemini `generateContent()` | Analysis JSON as prompt context | Structured summary, scores, issues, opportunities | `GEMINI_API_KEY` |

### Tier 3: Must Reimplement (Services Don't Work Server-Side)

| Feature | Original Service | Problem | Our Implementation |
|---------|-----------------|---------|-------------------|
| Technical SEO (9 categories) | `runTechnicalSeoAudit()` | Calls `/api/fetch-html-headers` | Build from pre-fetched HTML + headers. Reimplement the 9 category scoring logic. |
| Schema Detection | `analyzePageSchema()` | Calls `/api/fetch-html` | Extract JSON-LD with regex from pre-fetched HTML. Validate schemas ourselves. |
| Robots.txt Analysis | `analyzeRobotsTxt()` | Calls `/api/fetch-html-headers` | Fetch robots.txt directly, parse directives and AI crawler rules ourselves. |
| Page Crawling | `internalLinkCrawlerService` | Browser-only (DOMParser) | Build Cheerio-based server-side crawler with `fetch` + concurrency. |
| Sitemap Parsing | `sitemapParser.ts` | Browser-only (DOMParser) | Use regex-based parsing (already exists in pseo.site's `fetchSitemapUrls`). |

---

## Detailed Implementation: What to Build

### File 1: `services/siteCrawler.ts` (NEW — Lightweight Server-Side Crawler)

**What it replaces:** pseo.site's Crawlee-based crawler + SSC's browser-only internal link crawler

**Dependencies:** `cheerio` (already in SSC's package.json? If not, `npm install cheerio`)

```
Functions to implement:

fetchPage(url: string): Promise<{html, headers, statusCode, responseTime}>
  - Direct fetch() with 5s timeout, custom User-Agent
  - Return raw HTML + response headers + status code
  - SSRF protection (block private IPs)

discoverSitemap(domain: string): Promise<string[]>
  - Fetch /robots.txt → extract Sitemap: directives
  - Fetch sitemap URLs → extract <loc> tags with regex
  - Return array of discovered URLs
  - Port from pseo.site's discoverSitemapLocations + fetchSitemapUrls (regex-based, no DOMParser)

crawlPages(urls: string[], maxPages: number, onProgress): Promise<PageData[]>
  - Concurrent fetching (5 at a time using p-limit or manual Promise.all batching)
  - Per page: load into cheerio, extract:
    - title: $('title').text()
    - metaDescription: $('meta[name="description"]').attr('content')
    - h1: $('h1').first().text()
    - h2s: $('h2').map((_, el) => $(el).text()).get().slice(0, 10)
    - wordCount: $('body').text().replace(/\s+/g, ' ').split(' ').length
    - canonical: $('link[rel="canonical"]').attr('href')
    - schemaTypes: extract from script[type="application/ld+json"]
    - images: $('img').length, with alt count
    - internalLinks: $('a[href]') filtered to same domain
    - externalLinks: $('a[href]') filtered to other domains
    - viewport: !!$('meta[name="viewport"]').length
    - ogTitle: !!$('meta[property="og:title"]').length
    - ogImage: !!$('meta[property="og:image"]').length
    - hreflang: $('link[rel="alternate"][hreflang]').length
    - robotsMeta: $('meta[name="robots"]').attr('content')
  - Port selectors from pseo.site's crawler.ts lines 177-257

extractKeywordsFromPages(pages: PageData[]): string[]
  - Extract unique terms from H1s, titles, H2s
  - Deduplicate, lowercase, remove stop words, remove brand terms
  - Return top 20 keywords for Planner lookup
```

### File 2: `services/technicalSeoBuilder.ts` (NEW — Server-Side Technical Audit)

**What it replaces:** `runTechnicalSeoAudit()` which can't run server-side

```
Functions to implement:

buildTechnicalAudit(pageData: {html, headers, statusCode, url, robotsTxt, redirectChain}): TechnicalAuditResult
  - Input: Pre-fetched data (no internal fetches)
  - Reimplement the 9 category scoring from technicalSeoService.ts:

  Category 1: Crawlability (weight 0.15)
    - robots.txt exists (check robotsTxt string)
    - Sitemap referenced in robots.txt
    - Not blocking all crawlers (parse User-agent/Disallow)
    - AI crawler access (check GPTBot, ClaudeBot, PerplexityBot rules)

  Category 2: Indexability (weight 0.20)
    - Canonical tag present (from pageData)
    - Meta robots check (noindex?)
    - Title tag present + length (30-60 chars optimal)
    - Meta description present
    - H1 count (exactly 1 is ideal)
    - Word count >= 300

  Category 3: Security (weight 0.10)
    - HTTPS check
    - Headers: strict-transport-security, content-security-policy,
      x-frame-options, x-content-type-options, referrer-policy,
      permissions-policy, x-xss-protection

  Category 4: URL Structure (weight 0.10)
    - Redirect chain length (from pre-computed)
    - URL length < 100
    - Clean URLs (no query params)
    - HTTPS enforced

  Category 5: Mobile (weight 0.10)
    - Viewport meta tag
    - Responsive CSS (@media, flexbox, grid in HTML)
    - Font size check (< 12px)

  Category 6: Core Web Vitals (weight 0.15)
    - SKIP initially (requires PageSpeed API call, adds 2-3s latency)
    - Default score: 50 with info message "Connect for CWV data"
    - Phase 2: Add optional PageSpeed call

  Category 7: Structured Data (weight 0.10)
    - Parse JSON-LD from HTML (regex: /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
    - Check for deprecated schemas (HowTo, FAQPage, etc.)
    - Recommend missing schemas (Organization, WebSite, BreadcrumbList)

  Category 8: JS Rendering (weight 0.05)
    - Detect framework (React, Next.js, Vue, etc. from HTML markers)
    - SSR check (word count > 50 in initial HTML)
    - Render-blocking scripts count

  Category 9: IndexNow (weight 0.05)
    - Check for IndexNow in HTML
    - Always floor score at 70

  Overall: weighted average across categories
  Rating: >= 80 excellent, >= 60 good, >= 40 needs-work, < 40 poor
```

### File 3: `services/siteAnalysisPipeline.ts` (NEW — Orchestrator)

```
async function analyzeSite(url: string, onEvent: SSECallback): Promise<SiteAnalysis>

  Phase 1: Discovery (2-3s)
    const { html, headers, statusCode } = await fetchPage(url)
    const robotsTxtContent = await fetchPage(domain + '/robots.txt')
    const sitemapUrls = await discoverSitemap(domain)
    → emit: phase("discovery"), progress

  Phase 2: Smart Crawl (5-10s)
    // Pick pages to crawl:
    // - Homepage (already fetched)
    // - Top nav links (extract from homepage HTML with cheerio)
    // - 2-3 samples per URL pattern from sitemap
    // - Cap at 20 pages (free) / 100 (pro)
    const pages = await crawlPages(selectedUrls, 20, onProgress)
    → emit: phase("crawling"), progress per page

  Phase 3: Analysis (1-2s, all parallel, all PURE functions)
    const [content, geo, images, readability, eeat] = await Promise.allSettled([
      analyzeContentQuality(homepageHtml, url),
      analyzeGeoInsights(url, homepageHtml),
      analyzeImages(url, homepageHtml),
      analyzeReadability(homepageHtml, true),
      analyzeEeat(url, homepageHtml),
    ])

    const technical = buildTechnicalAudit({
      html: homepageHtml,
      headers,
      statusCode,
      url,
      robotsTxt: robotsTxtContent,
    })

    const patterns = analyzeUrls(domain, allDiscoveredUrls, crawlStats)
    const onPageAgg = aggregateOnPageSeo(pages.map(p => p.seoData))

    // Schema extraction (inline, no service call)
    const schemas = extractJsonLdSchemas(homepageHtml)

    → emit: phase("analyzing"), results per section

  Phase 4: Keyword Intelligence (1-2s)
    const keywords = extractKeywordsFromPages(pages)
    const creds = getGoogleAdsCredentialsFromEnv()
    let keywordData = null
    if (creds && keywords.length > 0) {
      keywordData = await getKeywordIdeas(creds, { keywords: keywords.slice(0, 20) })
    }
    const intents = keywords.map(k => ({ keyword: k, intent: classifyIntent(k) }))
    → emit: result("keywords")

  Phase 5: AI Synthesis (2-3s)
    const aiSummary = await generateWithGemini(allResults)
    → emit: result("ai_summary")

  → emit: done
```

### File 4: `app/api/site-analyze/route.ts` (NEW — SSE Endpoint)

```
SSE Event Protocol (verified from pseo.site pattern):

event: phase
data: {"phase":"discovery","message":"Discovering sitemap & robots.txt..."}

event: progress
data: {"crawled":5,"total":20,"percent":25}

event: result
data: {"section":"technical","data":{...TechnicalAuditResult}}

event: result
data: {"section":"content","data":{...ContentQualitySignals}}

event: result
data: {"section":"geo","data":{...GeoInsightsResult}}

event: result
data: {"section":"images","data":{...ImageAuditResult}}

event: result
data: {"section":"readability","data":{...ReadabilityResult}}

event: result
data: {"section":"eeat","data":{...EeatScoreResult}}

event: result
data: {"section":"structure","data":{...AnalysisResult}}

event: result
data: {"section":"schemas","data":{...detected schemas}}

event: result
data: {"section":"keywords","data":{...KeywordIdea[]}}

event: result
data: {"section":"ai_summary","data":{...GeminiSummary}}

event: done
data: {"success":true}

Rate limiting:
  - Anonymous: 3 analyses/day (by IP)
  - Free user: 10/day
  - Pro user: unlimited
```

### File 5: `app/analyze/page.tsx` (NEW — UI)

Three states: Input → Streaming → Results (as designed in original plan, no changes needed)

---

## Dependency Checklist

### SSC Project Already Has

| Package | Status | Used For |
|---------|--------|----------|
| `@google/generative-ai` | Installed | Gemini AI synthesis |
| `next` 16 | Installed | SSE streaming, API routes |
| `react` 19 | Installed | UI |
| `recharts` | Installed | Score visualization |
| `lucide-react` | Installed | Icons |
| `framer-motion` | Installed | Animations |

### SSC Project Needs

| Package | Why | Install Command |
|---------|-----|----------------|
| `cheerio` | Server-side HTML parsing for crawler | `npm install cheerio` |

**Check if cheerio is already installed:**
```bash
cd /Users/devanshu/Desktop/Projects/seokeywordtool/seositemap-nextjs
grep cheerio package.json
```

### From pseo.site — Code to Copy (NOT Packages)

| Code | Source File | What to Copy |
|------|-----------|-------------|
| Sitemap discovery (regex-based) | `lib/crawler.ts` lines 30-120 | `discoverSitemapLocations()`, `fetchSitemapUrls()` |
| URL normalization | `lib/crawler.ts` lines 122-170 | `normalizeAndFilter()` |
| SEO extraction selectors | `lib/crawler.ts` lines 177-257 | Cheerio `$()` selectors for title, meta, h1, schema, links |
| URL pattern analysis | `lib/analyze-urls.ts` (entire file) | `analyzeUrls()` and all helpers |
| On-page aggregation | `lib/onpage-seo.ts` (entire file) | `aggregateOnPageSeo()` and all helpers |
| SSE streaming pattern | `app/api/analyze/route.ts` lines 1-30 | `sseEvent()` helper + `ReadableStream` pattern |

### From SSC — Services to Import Directly

| Service | Import Path | Function | Verified Server-Safe? |
|---------|-------------|----------|----------------------|
| Content Quality | `@/services/contentQualityService` | `analyzeContentQuality(html, url)` | **YES** |
| GEO Insights | `@/services/geoInsightsService` | `analyzeGeoInsights(url, html)` | **YES** |
| Image Audit | `@/services/imageAuditService` | `analyzeImages(url, html)` | **YES** |
| Readability | `@/services/readabilityService` | `analyzeReadability(html, true)` | **YES** |
| E-E-A-T | `@/services/eeatScoringService` | `analyzeEeat(url, html)` | **YES** |
| Keyword Intent | `@/services/keywordIntentClassifier` | `classifyIntent(query)` | **YES** |
| Keyword Planner | `@/services/googleAdsService` | `getKeywordIdeas(creds, opts)` | **YES** |

### From SSC — Services That Need Wrappers (NOT Direct Import)

| Service | Problem | Solution |
|---------|---------|----------|
| `technicalSeoService` | Fetches via relative API routes | Reimplement scoring logic with pre-fetched data |
| `schemaDetectorService` | Fetches via `/api/fetch-html` | Extract JSON-LD regex, validate ourselves |
| `robotsTxtService` | Fetches via `/api/fetch-html-headers` | Fetch robots.txt ourselves, parse directives |
| `securityHeadersService` | Works fine — `analyzeSecurityHeaders(headers)` is pure | **Can import directly** if we pass headers |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Google Ads API credentials expired | Medium | Keyword data unavailable | Graceful fallback — show "Connect for keyword data" instead |
| Cheerio not installed in SSC | Low | Build fails | Check & install before starting |
| Target site blocks our crawler | Medium | Partial data | Use custom User-Agent, respect robots.txt, show "X pages crawled of Y" |
| Gemini rate limits | Low | AI summary fails | Cache results, retry once, show "AI summary generating..." |
| SSE connection drops | Medium | Partial results | Client reconnects, API returns cached partial result |
| Large sites (10K+ pages) | Medium | Timeout | Cap sitemap discovery at 500 URLs, crawl max 20 |
| SSRF via user-supplied URL | High (security) | Server compromise | Port SSRF protection from `/api/fetch-html` |

---

## Estimated Build Time (Verified)

| Sprint | Task | Effort | Risk |
|--------|------|--------|------|
| **1a** | `siteCrawler.ts` — fetch, sitemap, cheerio crawl | 2 days | Medium (cheerio selectors) |
| **1b** | `technicalSeoBuilder.ts` — 9 category audit from pre-fetched data | 1.5 days | Low (logic copied from existing) |
| **1c** | `siteAnalysisPipeline.ts` — orchestrator + keyword extraction | 1 day | Low |
| **1d** | `app/api/site-analyze/route.ts` — SSE endpoint + rate limiting | 1 day | Low (pattern copied from pseo.site) |
| **1e** | Gemini AI synthesis prompt + response parsing | 0.5 day | Low |
| **2a** | `app/analyze/page.tsx` — URL input + SSE consumer + results UI | 3 days | Medium (lots of UI) |
| **2b** | Score breakdown visualization (Recharts) | 1 day | Low |
| **2c** | AI chat integration with analysis context | 1 day | Low |
| **3a** | Shareable reports `app/analyze/[slug]/page.tsx` | 1 day | Low |
| **3b** | Meta tags, OG images, PDF export | 1 day | Low |
| **3c** | Rate limiting, SSRF protection, error handling | 0.5 day | Low |
| | **Total** | **~13.5 days** | |

---

## Pre-Implementation Checklist

Before writing any code, verify these:

- [ ] `cheerio` is installed in SSC project (or install it)
- [ ] Google Ads API credentials still work (`GET /api/test-ads-api`)
- [ ] Gemini API key works in SSC project
- [ ] SSC dev server runs without errors
- [ ] Copy `lib/analyze-urls.ts` and `lib/onpage-seo.ts` from pseo.site to SSC
- [ ] Copy `lib/analyze.ts` types from pseo.site to SSC
- [ ] Test that `analyzeContentQuality()`, `analyzeGeoInsights()`, etc. can be imported in a new file
