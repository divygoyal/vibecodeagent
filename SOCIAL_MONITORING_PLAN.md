# Social Mention Monitoring — Free Implementation Plan

> How to replicate DataFast's Reddit/X mention tracking using **only free APIs**.
> Generated: 2026-03-19

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Reddit Monitoring (FREE)](#2-reddit-monitoring-free)
3. [Twitter/X Monitoring (FREE — with tradeoffs)](#3-twitterx-monitoring-free--with-tradeoffs)
4. [Bonus Platforms (All FREE)](#4-bonus-platforms-all-free)
5. [Architecture & Implementation Plan](#5-architecture--implementation-plan)
6. [API Reference Cheat Sheet](#6-api-reference-cheat-sheet)
7. [Build Order & Timeline](#7-build-order--timeline)

---

## 1. Executive Summary

**The good news:** Reddit monitoring is 100% free and reliable. Hacker News, Bluesky, Mastodon, GitHub, DEV.to, and Stack Overflow are all free. Google News RSS is free.

**The bad news:** Twitter/X has no usable free API tier (it's write-only). The only free options for X are either legally risky (scraping libraries) or indirect (Google search of indexed tweets).

**Recommended strategy:**
| Platform | Method | Cost | Reliability | Real-time? |
|----------|--------|------|-------------|------------|
| **Reddit** | `.json` endpoints + RSS | $0 | High | Yes (polling) |
| **Reddit (comments)** | PullPush.io API | $0 | Medium | Delayed (hours) |
| **Hacker News** | Algolia API (official) | $0 | Very High | Yes |
| **Bluesky** | AT Protocol API | $0 | Very High | Yes |
| **Mastodon** | Fediverse API | $0 | Very High | Yes |
| **GitHub** | REST API v3 | $0 | Very High | Yes |
| **Google News** | RSS feeds | $0 | High | Near real-time |
| **DEV.to** | Forem API | $0 | High | Yes |
| **Stack Overflow** | Stack Exchange API | $0 | Very High | Yes |
| **Product Hunt** | GraphQL API | $0 | High | Yes |
| **Twitter/X** | Google Custom Search | $0 (100/day) | Medium | Delayed |
| **Twitter/X** | twscrape (Python) | $0 | Medium | Yes, but risky |

**Total cost: $0/month** for 10+ platforms.

---

## 2. Reddit Monitoring (FREE)

Reddit is the easiest platform to monitor for free. Multiple approaches work simultaneously.

### 2.1 Reddit JSON Endpoints (PRIMARY — No Auth)

Append `.json` to any Reddit URL. No API key, no OAuth, no approval needed.

**Endpoints:**

```
# Search all of Reddit for a keyword
GET https://www.reddit.com/search.json?q="your+brand"&sort=new&limit=100

# Find all posts linking to your domain
GET https://www.reddit.com/domain/yourdomain.com/new.json

# Search within a specific subreddit
GET https://www.reddit.com/r/SEO/search.json?q="your+keyword"&restrict_sr=on&sort=new

# Search post titles only
GET https://www.reddit.com/search.json?q=title:"your+brand"&sort=new

# Search post body text only
GET https://www.reddit.com/search.json?q=selftext:"your+brand"&sort=new
```

**Rate limits:** ~10 requests/minute (unauthenticated). Must set a custom `User-Agent` header.

**Data returned per post:**
- `title` — post title
- `selftext` — body text
- `author` — username
- `subreddit` — subreddit name
- `score` — upvotes minus downvotes
- `num_comments` — comment count
- `url` — linked URL
- `permalink` — link to the Reddit post
- `created_utc` — Unix timestamp
- `upvote_ratio` — % upvoted
- `thumbnail` — thumbnail URL
- `domain` — domain of linked URL

**Pagination:** Use `after` parameter with the fullname of the last post (e.g., `after=t3_abc123`). Max ~1000 results total.

**Example Node.js code:**
```ts
async function searchReddit(query: string, limit = 25) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TrafficClaw/1.0 (mention-monitor)' }
  });
  const data = await res.json();
  return data.data.children.map((child: any) => ({
    title: child.data.title,
    subreddit: child.data.subreddit,
    author: child.data.author,
    score: child.data.score,
    comments: child.data.num_comments,
    url: child.data.url,
    permalink: `https://reddit.com${child.data.permalink}`,
    created: new Date(child.data.created_utc * 1000),
    body: child.data.selftext?.slice(0, 200),
  }));
}

// Search for domain mentions
async function searchRedditDomain(domain: string) {
  const url = `https://www.reddit.com/domain/${domain}/new.json?limit=100`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TrafficClaw/1.0 (mention-monitor)' }
  });
  const data = await res.json();
  return data.data.children.map((child: any) => ({ /* same mapping */ }));
}
```

### 2.2 Reddit RSS Feeds (BACKUP — No Auth)

Same as JSON but returns XML. Useful as a fallback if JSON endpoints get restricted.

```
# RSS for keyword search
https://www.reddit.com/search.rss?q="your+brand"&sort=new

# RSS for domain mentions
https://www.reddit.com/domain/yourdomain.com/new.rss
```

Parse with `rss-parser` npm package. Returns ~25 items per poll. Less data than JSON (no scores/comments).

### 2.3 PullPush.io (COMMENT SEARCH — No Auth)

Reddit's own search cannot search comments. PullPush.io can.

**Endpoints:**
```
# Search posts
GET https://api.pullpush.io/reddit/search/submission/?q=your+brand&size=100&sort=desc

# Search comments (UNIQUE — Reddit can't do this)
GET https://api.pullpush.io/reddit/search/comment/?q=your+brand&size=100&sort=desc

# Filter by subreddit
GET https://api.pullpush.io/reddit/search/submission/?q=your+brand&subreddit=SEO

# Filter by date
GET https://api.pullpush.io/reddit/search/submission/?q=your+brand&after=2026-01-01&before=2026-03-19
```

**Rate limits:** 15 req/min (soft), 30 req/min (hard), 1,000 req/hour.

**Caveats:** Volunteer-run, has had downtime. Data lag of hours. Use as supplement to real-time JSON endpoints.

### 2.4 Arctic Shift (HISTORICAL DEEP SEARCH — No Auth)

Best for historical analysis. Data from 2005 to ~1 month ago.

```
# Search posts
GET https://arctic-shift.photon-reddit.com/api/posts/search?q=your+brand&after=2025-01-01&limit=100

# Search comments
GET https://arctic-shift.photon-reddit.com/api/comments/search?q=your+brand&after=2025-01-01&limit=100
```

**Rate limits:** ~2,000 req/min. Very generous. No auth needed.

### 2.5 Reddit Official API (OPTIONAL — Requires OAuth Approval)

If you want official API access:
1. Go to https://www.reddit.com/prefs/apps
2. Create a "script" type application
3. Note: Since November 2025, Reddit requires **manual pre-approval** (~7 days)
4. Free for non-commercial use, 100 queries/minute

**Worth applying for** as a backup if the JSON endpoints get restricted, but not needed to start.

### 2.6 Recommended Reddit Strategy

```
Cron schedule (every 15 minutes):
├── Fetch /search.json?q="brand+name"&sort=new     → new keyword mentions
├── Fetch /domain/yourdomain.com/new.json           → new link mentions
└── Fetch /search.json?q=site:yourdomain.com&sort=new → broader link mentions

Cron schedule (every 2 hours):
├── Fetch PullPush comment search                   → comment mentions
└── Deduplicate against stored mentions

Store in DB:
├── reddit_mentions table
│   ├── id, title, subreddit, author, score, comments
│   ├── url, permalink, body_preview, created_at
│   ├── mention_type (keyword | domain | comment)
│   └── site_url (which tracked site this mention is for)
```

---

## 3. Twitter/X Monitoring (FREE — With Tradeoffs)

Twitter/X is the hardest platform to monitor for free. Here are all viable options, ranked.

### 3.1 The Problem

- **X API Free Tier** = write-only (can post tweets, cannot read/search). Useless.
- **X API Basic** = was $200/month, now pay-as-you-go. 7-day search only. Expensive.
- **X API Pro** = $5,000/month. Full archive search. Way too expensive.

### 3.2 Option A: Google Custom Search (BEST Legal Free Option)

Search Google's index of tweets. 100 free queries/day.

**Setup:**
1. Go to https://programmablesearchengine.google.com/
2. Create a new search engine
3. Under "Sites to search" add: `x.com/*`, `twitter.com/*`
4. Get your Search Engine ID (`cx`)
5. Get a Google API key from Cloud Console

**Query:**
```
GET https://www.googleapis.com/customsearch/v1?key=API_KEY&cx=SEARCH_ENGINE_ID&q="your+brand"&sort=date
```

**What you get:** Tweet URLs, snippet text (truncated), author handle, date indexed.

**What you DON'T get:** Full tweet text, likes, retweets, replies, media.

**Limits:** 100 queries/day free. $5/1,000 after that.

**Budget:** 100 queries/day = monitor ~10 keywords × 10 checks/day. Enough for small-scale monitoring.

**Warning:** This API is sunsetting for new customers. Existing users have until January 1, 2027.

**Example:**
```ts
async function searchTwitterViaGoogle(query: string, apiKey: string, cx: string) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&sort=date&num=10`;
  const res = await fetch(url);
  const data = await res.json();
  return data.items?.map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link,
    // Extract handle from URL: https://x.com/username/status/123
    author: item.link.match(/x\.com\/(\w+)\//)?.[1] || 'unknown',
    date: item.snippet, // Date is embedded in snippet
  })) || [];
}
```

### 3.3 Option B: Bluesky as X Alternative (BEST Free Real-Time Option)

Many X users cross-post to Bluesky. Bluesky has a **fully free, open API** with generous limits.

**Auth:** Free Bluesky account → get JWT token.

```
# Get auth token
POST https://bsky.social/xrpc/com.atproto.server.createSession
Body: { "identifier": "your.handle", "password": "your-password" }
→ Returns: { "accessJwt": "...", "did": "..." }

# Search posts
GET https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q="your+brand"&limit=25&sort=latest
Header: Authorization: Bearer YOUR_JWT
```

**Rate limits:** 3,000 requests per 5 minutes. Extremely generous.

**Data returned:** Full post text, author, timestamps, embeds, reply count, like count, repost count.

**Why this matters:** Bluesky has 30M+ users and growing. Many tech/startup users cross-post from X. Monitoring Bluesky gives you significant X-like coverage for free.

**Example:**
```ts
async function searchBluesky(query: string, token: string) {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=25&sort=latest`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.posts?.map((post: any) => ({
    text: post.record.text,
    author: post.author.handle,
    displayName: post.author.displayName,
    likes: post.likeCount,
    reposts: post.repostCount,
    replies: post.replyCount,
    created: post.record.createdAt,
    uri: post.uri,
    url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
  })) || [];
}
```

### 3.4 Option C: twscrape / twikit (FREE but Risky)

Python libraries that use X's internal GraphQL API. Works without paying for API access.

**twscrape:**
```python
from twscrape import API, gather

api = API()
await api.pool.add_account("username", "password", "email", "email_password")
await api.pool.login_all()

tweets = await gather(api.search('"your brand"', limit=50))
for tweet in tweets:
    print(tweet.rawContent, tweet.likeCount, tweet.retweetCount)
```

**Risks:**
- Violates X Terms of Service (ToS has $15K liquidated damages clause for scraping >1M posts/day)
- Requires throwaway X accounts (can get banned)
- Breaks every 2-4 weeks when X changes internal API
- Python-only (would need a Python microservice alongside your Node.js app)

**Verdict:** Use only if you absolutely need real-time X data. Run as a separate Python service. Accept the maintenance burden.

### 3.5 Option D: Google Alerts for X Mentions (Zero Maintenance)

Set up a Google Alert for `site:x.com "your brand"` with RSS delivery.

- Poll the RSS feed URL on a cron schedule
- Zero maintenance, zero API keys
- Delayed (hours to days), limited to what Google indexes
- Good as a supplementary passive source

### 3.6 Recommended X/Twitter Strategy

```
Tier 1 (Do immediately):
├── Bluesky API search (free, real-time, open)     → PRIMARY social signal
├── Google Alerts RSS for site:x.com               → passive X monitoring
└── Google Custom Search (100/day) for X            → daily X mention discovery

Tier 2 (If X data is critical):
├── twscrape Python microservice                   → real-time X scraping
└── Accept maintenance + legal risk

Tier 3 (Future — if budget allows):
└── X API pay-as-you-go ($$ per credit)            → official, reliable
```

---

## 4. Bonus Platforms (All FREE)

These platforms all have free APIs and can massively expand the mention monitoring feature beyond what DataFast offers.

### 4.1 Hacker News (Algolia API)

**Cost:** $0. No auth. 10,000 requests/hour.

```
# Search by keyword (newest first)
GET http://hn.algolia.com/api/v1/search_by_date?query="your+brand"&tags=story

# Search comments too
GET http://hn.algolia.com/api/v1/search_by_date?query="your+brand"&tags=comment

# Only high-scoring stories
GET http://hn.algolia.com/api/v1/search?query="your+brand"&tags=story&numericFilters=points>10

# Since a specific timestamp (for polling)
GET http://hn.algolia.com/api/v1/search_by_date?query="your+brand"&numericFilters=created_at_i>1710800000
```

**Data:** Title, URL, author, points, num_comments, created_at, story_text.

**Why it matters:** HN is where tech products get discovered. A front-page HN post can drive 10K+ visits in hours. This is arguably more valuable than X monitoring for a tech/SaaS product.

### 4.2 Mastodon / Fediverse

**Cost:** $0. No auth for public endpoints. 300 requests per 5 minutes.

```
# Search posts (public)
GET https://mastodon.social/api/v2/search?q="your+brand"&type=statuses&resolve=true

# Search by hashtag (no auth needed)
GET https://mastodon.social/api/v1/timelines/tag/yourbrand?limit=40

# Search across multiple instances for broader coverage:
# mastodon.social, mastodon.online, fosstodon.org, hachyderm.io
```

**Data:** Post text, author, timestamps, media, boosts (reposts), favourites (likes).

### 4.3 GitHub

**Cost:** $0 with Personal Access Token (PAT). 5,000 requests/hour. 30 search queries/minute.

```
# Search issues + PRs mentioning your brand
GET https://api.github.com/search/issues?q="your+brand"&sort=created&order=desc

# Search code for your domain
GET https://api.github.com/search/code?q="yourdomain.com"

# Search repositories
GET https://api.github.com/search/repositories?q="your+brand"

# Get commits for connected repo (for chart overlay feature)
GET https://api.github.com/repos/OWNER/REPO/commits?since=2026-01-01T00:00:00Z
```

**Bonus:** You already have GitHub OAuth — just need to fetch commits for the chart annotation feature.

### 4.4 Stack Overflow / Stack Exchange

**Cost:** $0 with free API key (register at stackapps.com). 10,000 requests/day.

```
# Search questions mentioning your brand
GET https://api.stackexchange.com/2.3/search/advanced?q="your+brand"&site=stackoverflow&sort=creation&order=desc&key=API_KEY

# Search across all Stack Exchange sites
GET https://api.stackexchange.com/2.3/search/advanced?q="your+brand"&site=webmasters&sort=creation&order=desc
```

**Data:** Question title, body, tags, score, answers, author, created_at.

**Why it matters:** Stack Overflow mentions often indicate developers integrating or troubleshooting your product.

### 4.5 DEV.to

**Cost:** $0. No auth for reading. No documented rate limits.

```
# Search articles by tag
GET https://dev.to/api/articles?tag=yourbrand&per_page=30

# Get latest articles (search via Google for full-text)
GET https://dev.to/api/articles/latest?per_page=30
```

For full-text search, use Google News RSS with `site:dev.to "your brand"`.

### 4.6 Product Hunt

**Cost:** $0 for read-only access. OAuth2 required.

```graphql
# GraphQL query
query {
  posts(order: NEWEST, topic: "your-topic") {
    edges {
      node {
        name
        tagline
        votesCount
        commentsCount
        url
        createdAt
      }
    }
  }
}
```

Register app at producthunt.com/v2/oauth/applications.

### 4.7 Google News RSS

**Cost:** $0. No auth. No documented rate limits.

```
# Search news articles mentioning your brand
GET https://news.google.com/rss/search?q="your+brand"&hl=en-US&gl=US&ceid=US:en

# Last 24 hours only
GET https://news.google.com/rss/search?q="your+brand"+when:1d&hl=en-US&gl=US&ceid=US:en

# Last 7 days
GET https://news.google.com/rss/search?q="your+brand"+when:7d&hl=en-US&gl=US&ceid=US:en
```

**Data:** Article title, source, URL, published date, description snippet.

**Why it matters:** Catches blog posts, news articles, and press mentions that reference your brand.

### 4.8 Lemmy (Reddit Alternative)

**Cost:** $0. No auth for search. Growing user base.

```
# Search posts
GET https://lemmy.world/api/v3/search?q="your+brand"&type_=Posts&sort=New&limit=50

# Search comments
GET https://lemmy.world/api/v3/search?q="your+brand"&type_=Comments&sort=New&limit=50
```

Query multiple instances: `lemmy.world`, `lemmy.ml`, `programming.dev`.

---

## 5. Architecture & Implementation Plan

### 5.1 Database Schema

Add to admin API (`admin/models.py`):

```python
class SocialMention(Base):
    __tablename__ = "social_mentions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    site_url = Column(String, nullable=False)          # Which tracked site this mention is for

    platform = Column(String, nullable=False)           # reddit, hackernews, bluesky, mastodon, github, news, etc.
    mention_type = Column(String, nullable=False)        # keyword, domain, comment, article, post, issue
    external_id = Column(String, nullable=False)         # Platform-specific ID for dedup

    title = Column(String)
    body_preview = Column(String)                        # First 300 chars
    author = Column(String)
    url = Column(String, nullable=False)                 # Link to the mention

    score = Column(Integer, default=0)                   # Upvotes, likes, points
    comments = Column(Integer, default=0)

    # Platform-specific metadata
    subreddit = Column(String)                           # Reddit only
    community = Column(String)                           # Lemmy only
    instance = Column(String)                            # Mastodon/Lemmy instance

    mentioned_at = Column(DateTime, nullable=False)      # When the mention was created
    discovered_at = Column(DateTime, default=func.now()) # When we found it

    # For chart annotations
    is_pinned = Column(Boolean, default=False)
    sentiment = Column(String)                           # positive, negative, neutral (AI-analyzed)

class MentionKeyword(Base):
    __tablename__ = "mention_keywords"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    site_url = Column(String, nullable=False)
    keyword = Column(String, nullable=False)             # Brand name, domain, product name
    is_active = Column(Boolean, default=True)
```

### 5.2 New API Routes (Next.js)

```
web/src/app/api/
├── social/
│   ├── mentions/route.ts       # GET: list mentions, POST: trigger manual refresh
│   ├── keywords/route.ts       # CRUD for tracked keywords
│   └── stats/route.ts          # Aggregated mention stats over time
├── cron/
│   └── social-monitor/route.ts # Cron job: poll all platforms
```

### 5.3 Cron Schedule

```
Every 15 minutes:
├── Reddit JSON search (keyword + domain)
├── Hacker News Algolia search
├── Bluesky search
└── Mastodon search (top 3 instances)

Every 1 hour:
├── GitHub search (issues + code)
├── Stack Overflow search
├── DEV.to search
├── Lemmy search
└── PullPush.io (Reddit comments)

Every 6 hours:
├── Google News RSS
├── Google Alerts RSS
├── Google Custom Search for X (uses daily quota wisely)
└── Product Hunt (if enabled)
```

### 5.4 Dashboard Components

```
web/src/components/
├── SocialMentions/
│   ├── MentionsFeed.tsx         # Real-time feed of all mentions
│   ├── MentionCard.tsx          # Individual mention card (platform icon, title, score, link)
│   ├── MentionsByPlatform.tsx   # Breakdown chart by platform
│   ├── MentionsTrend.tsx        # Mentions over time chart
│   ├── MentionAnnotations.tsx   # Chart overlay markers for traffic correlation
│   ├── KeywordManager.tsx       # Add/remove tracked keywords
│   └── PlatformToggles.tsx      # Enable/disable platforms
```

### 5.5 Chart Annotation System

The mention data feeds into a generic annotation system on traffic charts:

```ts
type ChartAnnotation = {
  date: Date;
  type: 'reddit' | 'hackernews' | 'bluesky' | 'mastodon' | 'github' | 'news' | 'note' | 'deploy';
  title: string;
  url?: string;
  score?: number;      // For social: upvotes/likes. For HN: points.
  icon: string;        // Platform icon
  color: string;       // Platform color
};

// Render as Recharts ReferenceDot or custom markers on x-axis
```

### 5.6 AI Integration

Feed mention data into the AI chatbot context:

```
"Recent social mentions for {site}:
- Reddit: {count} mentions this week (top: "{title}" in r/{subreddit}, {score} upvotes)
- Hacker News: {count} mentions (top: "{title}", {points} points)
- Bluesky: {count} posts mentioning your brand
- Sentiment: {positive}% positive, {negative}% negative

Notable spikes: Traffic increased 40% on March 15 — same day as HN front page mention."
```

This lets the AI chatbot answer questions like:
- "Why did my traffic spike yesterday?"
- "What are people saying about my site on Reddit?"
- "Which social platforms drive the most traffic?"

---

## 6. API Reference Cheat Sheet

### All Free Endpoints at a Glance

| Platform | Endpoint | Auth | Rate Limit | Data |
|----------|----------|------|------------|------|
| **Reddit** (search) | `reddit.com/search.json?q=X` | User-Agent only | ~10/min | Posts: title, score, comments, body |
| **Reddit** (domain) | `reddit.com/domain/X/new.json` | User-Agent only | ~10/min | All posts linking to domain |
| **Reddit** (RSS) | `reddit.com/search.rss?q=X` | None | ~10/min | Posts: title, link, date |
| **PullPush** (posts) | `api.pullpush.io/reddit/search/submission/?q=X` | None | 15/min | Posts with full metadata |
| **PullPush** (comments) | `api.pullpush.io/reddit/search/comment/?q=X` | None | 15/min | Comments (unique!) |
| **Arctic Shift** | `arctic-shift.photon-reddit.com/api/posts/search?q=X` | None | ~2000/min | Historical posts + comments |
| **Hacker News** | `hn.algolia.com/api/v1/search_by_date?query=X` | None | 10,000/hr | Stories + comments with points |
| **Bluesky** | `public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=X` | JWT (free account) | 3,000/5min | Full posts with engagement |
| **Mastodon** | `mastodon.social/api/v2/search?q=X` | Optional | 300/5min | Posts, accounts, hashtags |
| **GitHub** | `api.github.com/search/issues?q=X` | PAT (free) | 30/min | Issues, PRs, discussions |
| **Stack Overflow** | `api.stackexchange.com/2.3/search/advanced?q=X` | Key (free) | 10,000/day | Questions with answers |
| **DEV.to** | `dev.to/api/articles?tag=X` | None | Generous | Articles with reactions |
| **Google News** | `news.google.com/rss/search?q=X` | None | Undocumented | News articles RSS |
| **Google CSE** (for X) | `googleapis.com/customsearch/v1?q=X` | API Key | 100/day free | Tweet URLs + snippets |
| **Lemmy** | `lemmy.world/api/v3/search?q=X` | None | Generous | Posts + comments |
| **Product Hunt** | `api.producthunt.com/v2/api/graphql` | OAuth (free) | 450/15min | Products, comments |

---

## 7. Build Order & Timeline

### Phase 1: Reddit + Hacker News (Start Here)

**Why first:** Highest value, lowest complexity, most reliable free APIs.

**Tasks:**
1. Create `social_mentions` + `mention_keywords` tables in admin DB
2. Build `/api/social/mentions` route (GET with filters)
3. Build `/api/social/keywords` route (CRUD)
4. Build Reddit monitor (JSON endpoints — keyword + domain search)
5. Build HN monitor (Algolia API)
6. Build `/api/cron/social-monitor` cron route
7. Build `MentionsFeed` component (list of mention cards)
8. Build `KeywordManager` component (add/remove keywords)
9. Add "Social Mentions" section to Overview dashboard
10. Add basic mention count badge to sidebar nav

### Phase 2: Bluesky + Mastodon + Chart Annotations

**Why second:** Bluesky fills the "X alternative" gap. Chart annotations make mentions actionable.

**Tasks:**
1. Build Bluesky monitor (AT Protocol search)
2. Build Mastodon monitor (multi-instance search)
3. Build chart annotation system (Recharts reference dots/lines)
4. Overlay mention markers on traffic trend charts
5. Build `MentionsByPlatform` breakdown chart
6. Build `MentionsTrend` time-series chart
7. Add mention annotations to Analytics page charts

### Phase 3: GitHub + Developer Platforms

**Why third:** Leverages existing GitHub OAuth. Covers developer ecosystems.

**Tasks:**
1. Build GitHub commit overlay (fetch commits → chart annotations)
2. Build GitHub issue/discussion mention monitor
3. Build Stack Overflow monitor
4. Build DEV.to monitor
5. Build Lemmy monitor
6. Add deploy markers to chart annotation system

### Phase 4: News + X + AI Integration

**Why last:** X monitoring is the most complex/fragile. AI integration needs data from all sources.

**Tasks:**
1. Build Google News RSS monitor
2. Set up Google Custom Search for X monitoring
3. (Optional) Set up Google Alerts RSS polling
4. Feed mention data into AI chatbot system prompt
5. Add "social context" to `aiChatTools.ts` tool responses
6. Build "Why did my traffic spike?" AI analysis using mention correlation
7. (Optional) twscrape Python microservice for real-time X data

### Phase 5: Polish & Power Features

**Tasks:**
1. Sentiment analysis on mentions (use Gemini API — you already have it)
2. Mention alerts (Telegram bot notification when high-score mention found)
3. "Respond" quick-actions (deep link to Reddit/HN to reply)
4. Mention-to-traffic correlation scoring
5. Public mention feed widget (embeddable)
6. Notes system (manual annotations — deploys, campaigns, Google updates)

---

## Appendix: What DataFast Charges For That You'll Get Free

| DataFast Feature | DataFast Price | Your Cost |
|------------------|---------------|-----------|
| Twitter/X mention tracking | Included in $9-19/mo | $0 (Bluesky + Google CSE) |
| Reddit mention tracking | Included in $9-19/mo | $0 (Reddit JSON API) |
| GitHub commit overlay | Included in $9-19/mo | $0 (GitHub API) |
| Chart annotations | Included in $9-19/mo | $0 (custom build) |
| Social-to-traffic correlation | Included in $9-19/mo | $0 (custom build) |
| **10 platforms monitored** | N/A (DataFast only does Reddit + X) | $0 (Reddit, HN, Bluesky, Mastodon, GitHub, SO, DEV.to, Lemmy, Google News, Product Hunt) |

**You'll monitor 10+ platforms for free vs DataFast's 2 paid platforms.** That's a competitive advantage.
