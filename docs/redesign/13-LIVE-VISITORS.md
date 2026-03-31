# 13 — Live Visitor Count Upgrade

## Current State
- Green dot + count in dashboard header
- Links to the Realtime page (full globe view)
- Realtime page has activity feed, country/device breakdowns

## Target: Click Opens Drawer

### Header Display (keep existing)
- Green pulsing dot + active user count
- NumberFlow animation for count changes
- Auto-refresh every 15 seconds

### New: Side Drawer on Click
Instead of navigating to /analytics/realtime, clicking the green dot opens a slide-out drawer:

```
┌──────────────────────────────────┐
│ Live Visitors          12 online │
│ ────────────────────────────────│
│                                  │
│ 🇺🇸 / (Homepage)         3m ago │
│    Chrome · Desktop · New York   │
│                                  │
│ 🇩🇪 /pricing              1m ago │
│    Firefox · Desktop · Berlin    │
│                                  │
│ 🇬🇧 /docs/getting-started 30s   │
│    Safari · Mobile · London      │
│                                  │
│ 🇮🇳 /blog/seo-tips        5m ago │
│    Chrome · Mobile · Mumbai      │
│                                  │
│ ────────────────────────────────│
│ [Open Full Realtime View →]      │
└──────────────────────────────────┘
```

### Drawer Contents
- List of active sessions (last 5 minutes)
- Each shows: country flag, current page, time ago, browser + device + city
- Auto-refresh every 10 seconds
- Max 20 sessions in drawer
- "Open Full Realtime View" link at bottom → navigates to /analytics/realtime

### Implementation
- Create `LiveVisitorDrawer` component
- Use Framer Motion for slide-in animation (from right)
- Fetch from existing `/api/analytics/realtime` endpoint
- Transform realtime data into session list format
- Add drawer state to analytics layout
- Keep existing green dot + count, just change onClick behavior
