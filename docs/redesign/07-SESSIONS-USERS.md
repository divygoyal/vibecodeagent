# 07 - Enhanced Sessions Page + New Users Page

## Overview

The current Sessions page shows a basic session table. This document covers two upgrades: (1) transforming the Sessions page into a filterable, detailed session list and (2) adding a brand-new Users page for visitor-level analytics.

---

## Part 1: Enhanced Sessions Page

### Current State
- Basic session table with minimal columns
- No filtering capabilities
- No pagination
- Limited session detail

### Target State
- Rich, filterable session list matching modern analytics tools
- Session cards with device, location, page flow, and timing details
- Advanced filters for slicing sessions
- Paginated at 100 sessions per page

---

### Filter Bar

The filter bar sits above the session list as a horizontal row of controls.

#### Identified Only Toggle
- Toggle switch labeled "Identified Only"
- When enabled, shows only sessions that have a user ID associated (via GA4 `userId` dimension or custom tracking)
- Default: off (show all sessions)
- Visual: pill toggle with emerald accent when active

#### Min Pageviews Filter
- Numeric input with stepper buttons
- Label: "Min Pageviews"
- Range: 1-100
- Default: 1 (no filter)
- Filters out sessions with fewer pageviews than the specified value

#### Min Events Filter
- Numeric input with stepper buttons
- Label: "Min Events"
- Range: 0-500
- Default: 0 (no filter)
- Filters out sessions with fewer total events

#### Min Duration Filter
- Numeric input (seconds) with stepper buttons
- Label: "Min Duration"
- Range: 0-3600 (1 hour max)
- Default: 0 (no filter)
- Input shows formatted time (e.g., "2m 30s") but accepts seconds
- Filters out sessions shorter than the specified duration

#### Filter Behavior
- Filters are AND-combined (all must match)
- Filters apply client-side for the current page of results
- Server-side filtering for large datasets via query parameters
- Clear All button resets all filters to defaults
- Filter state persisted in URL search params for shareability

---

### Session Card Design

Each session is displayed as a card (not a table row) for richer information density.

#### Card Layout
```
+------------------------------------------------------------------+
| [Browser Icon] [OS Icon]  Session abc123...  |  2 min ago (14:32) |
|                                                                    |
| [US Flag] San Francisco, CA    |  5 pages  |  3m 42s  |  Desktop |
|                                                                    |
| /landing-page  -->  /pricing  -->  /signup  -->  /thank-you       |
|                                                                    |
| [Entry: /landing-page]                      [Exit: /thank-you]    |
+------------------------------------------------------------------+
```

#### Card Fields

**Header Row**
- Browser icon (Chrome, Firefox, Safari, Edge, etc.) -- use Lucide icons or simple SVG badges
- OS icon (Windows, macOS, Linux, iOS, Android)
- Session ID (truncated to 8 chars, full ID in tooltip)
- Timestamp: relative time ("2 min ago") with absolute time in parentheses ("14:32:05")

**Detail Row**
- Country flag emoji + city + region (e.g., "San Francisco, CA")
- Pages visited count (e.g., "5 pages")
- Session duration formatted (e.g., "3m 42s")
- Device type label (Desktop / Mobile / Tablet)

**Page Flow Row**
- Horizontal sequence of page paths separated by arrows
- Maximum 5 pages shown inline, "+N more" for longer sessions
- Click on a page to navigate to that page's analytics

**Footer Row**
- Entry page (first page of the session)
- Exit page (last page of the session)
- Bounce indicator: red dot with "Bounce" label if session had only 1 pageview

#### Card Interactions
- Hover: subtle elevation increase (shadow change)
- Click: expands to show full session detail (all pages, all events, timing between pages)
- Expanded view shows a vertical timeline of all page hits with timestamps

---

### Session Detail (Expanded View)

When a session card is clicked, it expands inline (or opens a slide-over drawer) showing:

#### Page Timeline
```
14:32:05  [Entry] /landing-page         (12.4s on page)
14:32:17           /pricing              (45.2s on page)
14:33:03           /pricing/enterprise   (8.1s on page)
14:33:11           /signup               (67.3s on page)
14:34:18  [Exit]  /thank-you            (3.0s on page)
```

#### Event Log
- All events fired during the session, in chronological order
- Event name, timestamp, and properties (key-value pairs)
- Events interspersed with page views in the timeline

#### Session Metadata
- Full session ID
- UTM parameters (source, medium, campaign) if present
- Referrer URL
- Screen resolution
- Language
- New vs returning visitor

---

### Pagination

- 100 sessions per page (configurable: 50 / 100 / 200)
- Previous / Next buttons at the bottom
- Current page indicator: "Page 3 of 47"
- Jump to first / last page buttons
- Total session count displayed: "4,672 sessions"
- Keyboard shortcuts: Left arrow = previous, Right arrow = next

---

### API Requirements for Sessions

#### Endpoint
```
GET /api/analytics/sessions?propertyId={id}&dateRange={range}&page={n}&pageSize={100}&filters={...}
```

#### Response Shape
```typescript
interface SessionsResponse {
  sessions: Session[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Session {
  sessionId: string;
  userId?: string;           // null for anonymous
  startTime: string;         // ISO timestamp
  endTime: string;           // ISO timestamp
  duration: number;          // seconds
  pageviews: number;
  events: number;
  isBounce: boolean;
  device: {
    browser: string;
    os: string;
    type: 'desktop' | 'mobile' | 'tablet';
    screenResolution?: string;
  };
  location: {
    country: string;
    countryCode: string;
    city?: string;
    region?: string;
  };
  pages: SessionPage[];
  entryPage: string;
  exitPage: string;
  referrer?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  language?: string;
  isNewVisitor: boolean;
}

interface SessionPage {
  path: string;
  timestamp: string;
  timeOnPage: number;       // seconds
  events: SessionEvent[];
}

interface SessionEvent {
  name: string;
  timestamp: string;
  properties: Record<string, string | number | boolean>;
}
```

#### GA4 Query Strategy
- Use GA4 Data API with `sessionId` as a dimension
- Dimensions: `sessionId`, `pagePath`, `dateHour`, `city`, `country`, `browser`, `operatingSystem`, `deviceCategory`, `newVsReturning`, `sessionSource`, `sessionMedium`, `sessionCampaign`
- Metrics: `screenPageViews`, `eventCount`, `userEngagementDuration`
- Group by sessionId server-side to build session objects
- Note: GA4 may not expose per-session event-level detail via the Data API; the session list may need to approximate from aggregated dimensions

---

## Part 2: New Users Page

### Purpose
Provide visitor-level analytics so users can understand who their visitors are, how often they return, and what they do across sessions.

### Page Location
- Route: `/dashboard/analytics/users`
- Nav item: "Users" under the Analytics section (after Sessions)

---

### User List

The main view is a sortable, filterable table of visitors.

#### Columns

| Column | Description | Sortable |
|--------|-------------|----------|
| Visitor ID | Anonymous hash or identified user ID | No |
| Sessions | Total number of sessions | Yes |
| Pageviews | Total pageviews across all sessions | Yes |
| First Seen | Date of first visit | Yes |
| Last Seen | Date of most recent visit | Yes |
| Country | Country flag + name | Yes |
| Device | Primary device type (most used) | Yes |
| Status | "New" or "Returning" badge | Yes |

#### Default Sort
- Sorted by "Last Seen" descending (most recent visitors first)

#### Filters
- Date range (inherits from global analytics filter)
- Country filter (dropdown with search)
- Device type filter (Desktop / Mobile / Tablet / All)
- Status filter (New / Returning / All)
- Search by visitor ID (text input)

#### Pagination
- 50 users per page
- Same pagination controls as Sessions page

---

### User Detail (Click to Expand)

Clicking a user row expands it inline (or opens a right-side drawer) showing detailed visitor information.

#### Session History
```
Session 1 - Mar 28, 2026 - 3 pages - 2m 15s - Desktop - San Francisco
Session 2 - Mar 25, 2026 - 7 pages - 8m 42s - Mobile - San Francisco
Session 3 - Mar 20, 2026 - 1 page  - 0m 12s - Desktop - San Francisco (Bounce)
```
- Each session is a mini-card showing date, page count, duration, device, location
- Click on a session to navigate to the session detail view

#### Pages Visited (Aggregated)
- Top pages this visitor has viewed across all sessions
- Columns: Page Path, Views, Avg Time on Page
- Sorted by views descending
- Top 20 pages shown, "Show all" expands

#### Events Fired (Aggregated)
- Event types this visitor has triggered
- Columns: Event Name, Count, Last Fired
- Sorted by count descending

#### Device and Location Info
- All devices used (with session count per device)
- All locations seen (with session count per location)
- Browser breakdown
- OS breakdown

---

### User Metrics Summary

At the top of the Users page, show aggregate metrics:

```
+------------------+------------------+------------------+------------------+
| Total Visitors   | New Visitors     | Returning        | Avg Sessions/    |
| 12,456           | 8,234 (66%)      | 4,222 (34%)      | Visitor: 2.3     |
+------------------+------------------+------------------+------------------+
```

- Total Visitors: unique visitor count for the selected date range
- New Visitors: visitors whose first session is within the date range
- Returning Visitors: visitors who had a session before the date range
- Avg Sessions per Visitor: total sessions / total visitors

---

### API Requirements for Users

#### Endpoint
```
GET /api/analytics/users?propertyId={id}&dateRange={range}&page={n}&pageSize={50}&filters={...}
```

#### Response Shape
```typescript
interface UsersResponse {
  users: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  metrics: {
    totalVisitors: number;
    newVisitors: number;
    returningVisitors: number;
    avgSessionsPerVisitor: number;
  };
}

interface UserSummary {
  visitorId: string;
  isIdentified: boolean;
  sessionCount: number;
  totalPageviews: number;
  firstSeen: string;         // ISO date
  lastSeen: string;          // ISO date
  country: string;
  countryCode: string;
  primaryDevice: 'desktop' | 'mobile' | 'tablet';
  isNew: boolean;
}
```

#### User Detail Endpoint
```
GET /api/analytics/users/{visitorId}?propertyId={id}
```

#### Response Shape
```typescript
interface UserDetail {
  visitorId: string;
  isIdentified: boolean;
  sessions: UserSession[];
  topPages: { path: string; views: number; avgTimeOnPage: number }[];
  events: { name: string; count: number; lastFired: string }[];
  devices: { browser: string; os: string; type: string; sessionCount: number }[];
  locations: { country: string; city: string; sessionCount: number }[];
}

interface UserSession {
  sessionId: string;
  date: string;
  pageviews: number;
  duration: number;
  device: string;
  location: string;
  isBounce: boolean;
}
```

#### GA4 Query Strategy
- GA4 does not expose individual user profiles via the Data API
- **Approach A**: Use GA4 `newVsReturning` dimension with aggregate metrics to build the summary cards. Individual user rows would require custom tracking (sending a client ID to a custom dimension)
- **Approach B**: If the admin API stores session/user data independently, query that directly
- **Approach C**: Approximate by querying GA4 with dimensions like `firstSessionDate`, `country`, `deviceCategory` and metrics like `sessions`, `screenPageViews` grouped by date cohorts

---

## Component Structure

### Sessions Page
```
SessionsPage
|-- FilterBar
|   |-- IdentifiedOnlyToggle
|   |-- MinPageviewsInput
|   |-- MinEventsInput
|   |-- MinDurationInput
|   |-- ClearFiltersButton
|-- SessionMetrics (total sessions, avg duration, bounce rate)
|-- SessionList
|   |-- SessionCard (repeated)
|   |   |-- SessionHeader (browser/OS icons, ID, timestamp)
|   |   |-- SessionDetails (location, pages, duration, device)
|   |   |-- SessionPageFlow (entry -> ... -> exit)
|   |   |-- SessionExpandedView (timeline, events, metadata)
|   |-- EmptyState
|-- Pagination
```

### Users Page
```
UsersPage
|-- UserMetricsSummary (4 metric cards)
|-- UserFilters
|   |-- CountryFilter
|   |-- DeviceFilter
|   |-- StatusFilter
|   |-- SearchInput
|-- UserTable
|   |-- UserRow (repeated)
|   |   |-- UserExpandedDetail
|   |   |   |-- SessionHistory
|   |   |   |-- TopPages
|   |   |   |-- EventsSummary
|   |   |   |-- DeviceLocationInfo
|   |-- EmptyState
|-- Pagination
```

---

## Styling Notes

- Both pages follow the existing dark theme (zinc-950 background, zinc-800/900 borders)
- Session cards: zinc-900 background, zinc-800 border, hover:zinc-800/80 background
- User table rows: alternating zinc-950 and zinc-900/50
- Active filters show with emerald accent badges
- Bounce indicators use rose-500 color
- New visitor badges use cyan-500, returning badges use zinc-500
- All icons from Lucide React (Globe, Monitor, Smartphone, Tablet, Clock, MapPin, User, etc.)
- Responsive: cards stack vertically on mobile, table becomes card-based below 768px

---

## Performance Considerations

- **Lazy load session details**: Only fetch full session timeline when card is expanded
- **Virtual scrolling**: Consider `react-window` for the session list if performance degrades with 100+ cards
- **SWR caching**: Cache session list for 2 minutes, user list for 5 minutes
- **Debounce filters**: 300ms debounce on numeric inputs, instant on toggles
- **Skeleton loading**: Show skeleton cards/rows while data loads (8 skeleton items)

---

## Error States

- **No sessions**: "No sessions found for the selected date range and filters."
- **No users**: "No visitor data available. Visitor tracking requires GA4 with user identification enabled."
- **API error**: Standard error card with retry button
- **Loading**: Skeleton cards (sessions) or skeleton table rows (users)
- **Filter produces no results**: "No sessions match your filters. Try adjusting or clearing filters." with Clear Filters button
