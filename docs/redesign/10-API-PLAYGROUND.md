# 10 — API Playground

## What It Is
An interactive API testing page where developers can explore TrafficClaw's analytics endpoints, build queries, and see live results.

## Page Layout
```
┌─────────────────────────────────────────────────────────┐
│ API Playground                              [API Key: •••] │
├───────────────────────┬─────────────────────────────────┤
│ Endpoint Selector     │ Response                         │
│ ┌───────────────────┐ │ ┌─────────────────────────────┐ │
│ │ GET /api/analytics│ │ │ Status: 200 OK              │ │
│ │ GET /api/seo      │ │ │                             │ │
│ │ GET /api/alerts   │ │ │ {                           │ │
│ │ GET /api/insights │ │ │   "kpis": {                 │ │
│ │ ...               │ │ │     "totalUsers": 23997,    │ │
│ └───────────────────┘ │ │     ...                     │ │
│                       │ │   }                         │ │
│ Parameters            │ │ }                           │ │
│ ┌───────────────────┐ │ └─────────────────────────────┘ │
│ │ propertyId: [   ] │ │                                 │
│ │ range:      [30d] │ │ Code Snippets                   │
│ │ section:    [all] │ │ [cURL] [JavaScript] [Python]    │
│ └───────────────────┘ │ ┌─────────────────────────────┐ │
│                       │ │ curl -X GET \               │ │
│ [Send Request]        │ │   'https://trafficclaw...'  │ │
│                       │ │   -H 'Authorization: ...'   │ │
│                       │ └─────────────────────────────┘ │
└───────────────────────┴─────────────────────────────────┘
```

## Endpoints to Include
- `/api/analytics` — GA4 data (traffic, sources, pages, devices, countries)
- `/api/analytics/realtime` — Real-time visitors
- `/api/analytics/performance` — Core Web Vitals
- `/api/analytics/retention` — Cohort retention
- `/api/analytics/goals` — Conversion goals
- `/api/analytics/funnels` — Funnel analysis
- `/api/analytics/journeys` — User journeys
- `/api/seo` — Search Console data
- `/api/alerts` — Active alerts
- `/api/insights` — AI-generated insights
- `/api/audit` — Site audit

## Code Generator
Generate ready-to-copy code in:
- **cURL** — Shell command
- **JavaScript** — fetch() with headers
- **Python** — requests library

## Implementation
- New page: `web/src/app/(dashboard)/dashboard/analytics/api-playground/page.tsx`
- Add to sidebar under analytics tabs
- Uses actual API calls (authenticated via session)
- Response is syntax-highlighted JSON
- Copy button on code snippets
