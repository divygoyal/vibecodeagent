# 08 - Enhanced Events Page + New Error Tracking

## Overview

Two improvements: (1) upgrade the existing Events page from a basic table to a rich event log with time-series visualization and property inspection, and (2) add a new Error Tracking page that surfaces JavaScript errors and crashes from GA4 exception data.

---

## Part 1: Enhanced Events Page

### Current State
- Basic event table with type badges
- No time-series visualization
- No event property inspection
- No filtering or search

### Target State
- Time-series chart showing event volume over time
- Searchable, filterable event list
- Click-to-inspect event properties
- Event stacking by name with counts

---

### Events Time-Series Chart

#### Chart Specification
- **Type**: Line chart (using Recharts, consistent with existing charts)
- **X-axis**: Time (granularity auto-adjusts: hourly for 1-day range, daily for 7-30 day range, weekly for 90+ day range)
- **Y-axis**: Event count
- **Lines**: One line per selected event type (up to 5 simultaneously)
- **Default view**: Total events (single aggregated line)
- **Interaction**: Click on legend items to toggle individual event lines

#### Chart Controls
- Event type selector: multi-select dropdown listing all event types with counts
  - Shows top 10 events by default
  - Search within the dropdown to find specific events
  - Select up to 5 events to compare on the chart
  - "All Events" option shows the aggregate line
- Granularity override: Auto / Hourly / Daily / Weekly buttons
- Chart height: 250px (fixed, not resizable)

#### Chart Colors
- Use the same 8-color palette as the Sankey diagram for consistency
- Colors assigned by event rank (most frequent event gets first color)
- Total/aggregate line uses emerald-500

#### Chart Data Shape
```typescript
interface EventTimeSeriesPoint {
  timestamp: string;        // ISO date or datetime
  counts: Record<string, number>;  // eventName -> count
  total: number;
}
```

---

### Event List

Below the chart, show the event log as a combined stacked summary + detailed list.

#### Stacked View (Default)

Shows events grouped by name with aggregate counts:

```
+------------------------------------------------------------------+
| Event Name              | Count    | % of Total | Trend          |
|-------------------------|----------|------------|----------------|
| page_view               | 12,456   | 45.2%      | [sparkline up] |
| click                   | 5,234    | 19.0%      | [sparkline ->] |
| scroll                  | 3,891    | 14.1%      | [sparkline up] |
| form_submit             | 1,234    |  4.5%      | [sparkline dn] |
| purchase                |   456    |  1.7%      | [sparkline up] |
| file_download           |   234    |  0.8%      | [sparkline ->] |
| ...                     |          |            |                |
+------------------------------------------------------------------+
```

**Columns:**
- Event Name: the event identifier
- Count: total occurrences in the selected date range
- % of Total: percentage of all events
- Trend: inline sparkline (last 7 data points) showing volume trend

**Interactions:**
- Click a row to expand and see individual event instances
- Hover on sparkline to see exact values
- Sort by any column (default: count descending)

#### Detailed View (Expanded Row or Toggle)

When an event type is expanded, show individual occurrences:

```
+------------------------------------------------------------------+
| Timestamp           | Page              | Properties              |
|---------------------|-------------------|-------------------------|
| Mar 30, 14:32:05    | /pricing          | {plan: "pro", ...}      |
| Mar 30, 14:31:22    | /signup           | {step: 2, ...}          |
| Mar 30, 14:30:58    | /pricing          | {plan: "starter", ...}  |
+------------------------------------------------------------------+
```

**Columns:**
- Timestamp: when the event fired
- Page: the page where the event occurred
- Properties: truncated JSON preview, click to expand

#### Event Property Viewer

Clicking the properties cell (or a dedicated "View" button) opens a slide-over panel or modal showing:

```
Event: form_submit
Timestamp: Mar 30, 2026 14:32:05
Page: /pricing

Properties:
+------------------+------------------+
| Key              | Value            |
|------------------|------------------|
| plan             | "pro"            |
| billing_cycle    | "annual"         |
| currency         | "USD"            |
| form_id          | "pricing-cta"    |
+------------------+------------------+
```

- Key-value table format
- Values are syntax-highlighted by type (strings in cyan, numbers in amber, booleans in emerald)
- Copy button to copy properties as JSON
- If no properties exist, show "No properties recorded for this event"

---

### Search and Filter

#### Search Bar
- Text input at the top of the event list
- Searches by event name (fuzzy match)
- Debounced at 200ms
- Results update in real time
- Clear button (X icon) to reset search

#### Filters
- **Page filter**: dropdown to filter events by the page they occurred on
- **Date range**: inherits from global analytics filter store
- **Min count**: numeric input to hide low-volume events (default: 0)

---

### API Requirements for Events

#### Time Series Endpoint
```
GET /api/analytics/events/timeseries?propertyId={id}&dateRange={range}&events={comma-separated}&granularity={auto|hourly|daily|weekly}
```

#### Response Shape
```typescript
interface EventTimeSeriesResponse {
  points: EventTimeSeriesPoint[];
  eventNames: string[];       // all available event names
  totalEvents: number;
}
```

#### Event List Endpoint
```
GET /api/analytics/events?propertyId={id}&dateRange={range}&page={n}&pageSize={50}&search={term}&sortBy={count|name}&sortOrder={asc|desc}
```

#### Response Shape
```typescript
interface EventListResponse {
  events: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface EventSummary {
  name: string;
  count: number;
  percentOfTotal: number;
  trend: number[];           // last 7 data points for sparkline
  topPages: string[];        // top 3 pages where this event fires
}
```

#### Event Detail Endpoint
```
GET /api/analytics/events/{eventName}?propertyId={id}&dateRange={range}&page={n}&pageSize={20}
```

#### Response Shape
```typescript
interface EventDetailResponse {
  instances: EventInstance[];
  total: number;
  page: number;
  pageSize: number;
}

interface EventInstance {
  timestamp: string;
  page: string;
  properties: Record<string, string | number | boolean>;
  sessionId?: string;
  userId?: string;
}
```

#### GA4 Query Strategy
- **Stacked summary**: Query GA4 with `eventName` dimension and `eventCount` metric. This is straightforward.
- **Time series**: Query GA4 with `eventName` + `date` (or `dateHour`) dimensions and `eventCount` metric.
- **Event properties**: GA4 exposes event parameters as custom dimensions. To show properties, query with `customEvent:parameter_name` dimensions. This requires knowing which parameters exist per event type. May need a discovery query first.
- **Individual instances**: GA4 Data API does not expose individual event-level rows. The detailed view will show aggregated data grouped by page + time bucket, not true individual events. If per-event granularity is needed, it would require BigQuery export or custom tracking.

---

## Part 2: New Error Tracking Page

### Purpose
Surface JavaScript errors and application crashes so users can identify and fix issues impacting their visitors. Since TrafficClaw uses GA4 (not its own tracking script), error tracking is built on GA4's exception tracking capabilities.

### Page Location
- Route: `/dashboard/analytics/errors`
- Nav item: "Errors" under the Analytics section (after Events)

---

### Error List

The main view is a table of errors grouped by error message.

#### Columns

| Column | Description | Sortable |
|--------|-------------|----------|
| Error | Error name/message (truncated to 100 chars) | No |
| Count | Number of occurrences | Yes |
| Trend | Sparkline showing occurrence trend | No |
| Browsers | Browser icons affected | No |
| Page | Primary page where error occurs | Yes |
| Last Seen | Most recent occurrence | Yes |
| Status | New / Ongoing / Resolved | Yes |

#### Error Row Design
```
+------------------------------------------------------------------------+
| TypeError: Cannot read properties of undefined ('map')                  |
|                                                                          |
| 234 occurrences  |  [sparkline up]  |  Chrome, Firefox  |  /dashboard   |
| Last seen: 2 hours ago              |  Status: Ongoing                   |
+------------------------------------------------------------------------+
```

#### Error Detail (Click to Expand)

Expanding an error row shows:

**Error Information**
- Full error message (untruncated)
- Error description/type if available
- First seen date
- Last seen date
- Total occurrences

**Occurrence Chart**
- Bar chart showing error count per day for the last 30 days
- Helps identify if the error is increasing, stable, or decreasing

**Affected Browsers**
- Table showing browser + version and occurrence count
- Sorted by count descending
- Helps identify browser-specific bugs

**Affected Pages**
- Table showing page path and occurrence count
- Sorted by count descending
- Click a page to navigate to that page's analytics

**Sample Stack Trace**
- If available via GA4 custom dimensions or BigQuery, show a code-formatted stack trace
- Syntax highlighted with monospace font
- Copy button
- Note: GA4's default exception tracking does not include stack traces. This section only appears if custom tracking sends the `exceptionDescription` with stack trace data.

---

### Error Metrics Summary

At the top of the Errors page, show aggregate metrics:

```
+------------------+------------------+------------------+------------------+
| Total Errors     | Unique Errors    | Error Rate       | Affected         |
| 1,234            | 23               | 0.8%             | Sessions: 456    |
+------------------+------------------+------------------+------------------+
```

- Total Errors: sum of all error occurrences
- Unique Errors: count of distinct error messages
- Error Rate: errors / total sessions as a percentage
- Affected Sessions: number of sessions that experienced at least one error

---

### Error Status Management

Users can manage error status:

- **New**: Error first appeared within the selected date range (auto-assigned)
- **Ongoing**: Error existed before the date range and still occurring (auto-assigned)
- **Resolved**: Manually marked by user (stored in admin API)

Status changes are stored in the admin API database (new `ErrorStatus` table):
```python
class ErrorStatus(Base):
    __tablename__ = "error_statuses"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    property_id = Column(String)
    error_hash = Column(String)       # hash of error message for deduplication
    status = Column(String)            # "new", "ongoing", "resolved"
    resolved_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
```

---

### Implementation Details

#### GA4 Exception Data

GA4 automatically tracks JavaScript errors via the `exception` event type:
- **Dimension**: `exceptionDescription` -- the error message
- **Metric**: `eventCount` -- number of occurrences
- **Metric**: `crashFreeUsersRate` -- percentage of users without crashes
- **Additional dimensions**: `browser`, `pagePath`, `date`, `deviceCategory`

#### Query Strategy
```
GA4 Data API Request:
  dimensions: ['exceptionDescription', 'browser', 'pagePath', 'date']
  metrics: ['eventCount']
  dimensionFilter: {
    filter: {
      fieldName: 'eventName',
      stringFilter: { value: 'exception' }
    }
  }
  dateRanges: [{ startDate, endDate }]
  orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }]
  limit: 100
```

#### When No Error Data Exists

If the GA4 property has no exception events, show an "Enable Error Tracking" prompt:

```
+------------------------------------------------------------------+
|  [Warning Icon]  No error data found                              |
|                                                                    |
|  Error tracking requires GA4 to capture exception events.          |
|  This happens automatically for uncaught JavaScript errors         |
|  when using gtag.js with the default configuration.                |
|                                                                    |
|  If you're using Google Tag Manager, ensure the "JavaScript        |
|  Error" trigger is configured to send exception events.            |
|                                                                    |
|  [Learn More]  [Check Again]                                       |
+------------------------------------------------------------------+
```

---

### API Requirements for Errors

#### Error List Endpoint
```
GET /api/analytics/errors?propertyId={id}&dateRange={range}&page={n}&pageSize={50}&sortBy={count|lastSeen}&sortOrder={asc|desc}
```

#### Response Shape
```typescript
interface ErrorListResponse {
  errors: ErrorSummary[];
  total: number;
  page: number;
  pageSize: number;
  metrics: {
    totalErrors: number;
    uniqueErrors: number;
    errorRate: number;
    affectedSessions: number;
  };
}

interface ErrorSummary {
  errorHash: string;         // SHA-256 of the error message (for dedup)
  message: string;           // exceptionDescription from GA4
  count: number;
  trend: number[];           // last 7 data points for sparkline
  browsers: string[];        // affected browsers
  primaryPage: string;       // page with most occurrences
  firstSeen: string;         // ISO date
  lastSeen: string;          // ISO date
  status: 'new' | 'ongoing' | 'resolved';
}
```

#### Error Detail Endpoint
```
GET /api/analytics/errors/{errorHash}?propertyId={id}&dateRange={range}
```

#### Response Shape
```typescript
interface ErrorDetailResponse {
  errorHash: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: 'new' | 'ongoing' | 'resolved';
  occurrencesByDate: { date: string; count: number }[];
  browsers: { name: string; version: string; count: number }[];
  pages: { path: string; count: number }[];
  stackTrace?: string;       // only if custom tracking provides it
  notes?: string;            // user-added notes from ErrorStatus table
}
```

#### Error Status Update Endpoint
```
PUT /api/analytics/errors/{errorHash}/status
Body: { status: 'resolved' | 'ongoing', notes?: string }
```

This endpoint updates the `ErrorStatus` record in the admin API.

---

## Component Structure

### Events Page
```
EventsPage
|-- EventsTimeSeries
|   |-- EventTypeSelector (multi-select dropdown)
|   |-- GranularityButtons (Auto / Hourly / Daily / Weekly)
|   |-- LineChart (Recharts)
|   |-- ChartLegend
|-- EventFilters
|   |-- SearchInput
|   |-- PageFilter
|   |-- MinCountInput
|-- EventStackedList
|   |-- EventRow (repeated)
|   |   |-- EventName
|   |   |-- EventCount
|   |   |-- EventPercentage
|   |   |-- EventSparkline
|   |   |-- EventDetailExpanded
|   |   |   |-- EventInstanceTable
|   |   |   |-- EventPropertyViewer (slide-over or inline)
|   |-- EmptyState
|-- Pagination
```

### Errors Page
```
ErrorsPage
|-- ErrorMetricsSummary (4 metric cards)
|-- ErrorFilters
|   |-- SearchInput (search by error message)
|   |-- BrowserFilter
|   |-- StatusFilter (New / Ongoing / Resolved / All)
|-- ErrorList
|   |-- ErrorRow (repeated)
|   |   |-- ErrorMessage (truncated)
|   |   |-- ErrorCount
|   |   |-- ErrorTrend (sparkline)
|   |   |-- AffectedBrowsers (icons)
|   |   |-- PrimaryPage
|   |   |-- LastSeen
|   |   |-- StatusBadge
|   |   |-- ErrorDetailExpanded
|   |   |   |-- OccurrenceChart (bar chart)
|   |   |   |-- BrowserBreakdown (table)
|   |   |   |-- PageBreakdown (table)
|   |   |   |-- StackTrace (code block, if available)
|   |   |   |-- StatusControls (resolve button, notes input)
|   |-- EmptyState / EnableTrackingPrompt
|-- Pagination
```

---

## Styling Notes

- Both pages follow the existing dark theme (zinc-950 background)
- Event sparklines: thin emerald lines (1px stroke, no fill)
- Error trend sparklines: rose-500 for increasing, emerald-500 for decreasing, zinc-400 for stable
- Status badges:
  - New: cyan-500 background, cyan-50 text
  - Ongoing: amber-500 background, amber-50 text
  - Resolved: zinc-600 background, zinc-300 text
- Event property values: syntax-colored (string=cyan-400, number=amber-400, boolean=emerald-400)
- Browser icons: use simple SVG icons or unicode symbols (Chrome, Firefox, Safari, Edge)
- Error messages displayed in monospace font (Geist Mono)
- Chart uses emerald grid lines and zinc-700 axis labels, consistent with existing analytics charts

---

## Performance Considerations

- **Events time series**: Cache for 5 minutes (events are append-only, stale data is acceptable)
- **Event list**: Cache for 2 minutes
- **Error list**: Cache for 2 minutes
- **Sparklines**: Rendered as inline SVG (not Recharts) for minimal overhead -- each is a simple polyline
- **Event property viewer**: Load properties lazily when user clicks to expand
- **Error detail**: Fetch occurrence chart data only when error row is expanded
- **Skeleton loading**: 6 skeleton rows for both events and errors lists

---

## Error States

### Events Page
- **No events**: "No events recorded for the selected date range."
- **Search no results**: "No events matching '{searchTerm}'. Try a different search."
- **API error**: Standard error card with retry button
- **Loading**: Skeleton chart (250px gray block) + skeleton rows

### Errors Page
- **No error data**: "Enable Error Tracking" prompt (see above)
- **No errors (good news!)**: "No errors detected in the selected date range." with a green checkmark icon
- **API error**: Standard error card with retry button
- **Loading**: Skeleton metric cards + skeleton rows
