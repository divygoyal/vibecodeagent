# 06 - Sankey Diagram for Journeys (Replacing Current Step Boxes)

## Overview

Replace the current step-box journey visualization with a custom D3-based Sankey diagram. This is the biggest visual gap between TrafficClaw and competitors like Rybbit, and closing it will give users an immediately intuitive understanding of how visitors flow through their site.

---

## What the Sankey Diagram Shows

### Columns (Steps)
- Each column represents a step in the user journey (step 1 = entry, step 2 = second page, etc.)
- Configurable from 2 to 6 steps via a slider control
- Columns are evenly spaced across the diagram width

### Nodes (Pages)
- Each node is a rectangle representing a specific page at a given step
- Node height is proportional to the traffic volume passing through that page at that step
- Label shows the page path (truncated with tooltip for full path)
- Minimum node height of 4px to keep low-traffic pages visible

### Links (Flows)
- Curved paths connecting nodes between adjacent columns
- Link width is proportional to the number of sessions flowing between those two pages
- Opacity set to 0.4 by default, 0.8 on hover for contrast
- Colors are determined by the first path segment of the source page (e.g., `/blog/*` gets one color, `/docs/*` gets another)

### Interactions
- **Hover on a link**: Highlights the entire forward and backward path across all steps, dims everything else
- **Hover on a node**: Highlights all links entering and leaving that node
- **Click on a node**: Filters the diagram to only show journeys passing through that page
- **Tooltip**: Shows page path, session count, and percentage of total traffic

---

## Controls and Filters

### Step Slider
- Range: 2-6 steps
- Default: 4 steps
- Updates the diagram in real time (with a debounce of 300ms to avoid excessive re-renders)

### Journeys Slider
- Range: 10-200 journeys
- Default: 50 journeys
- Controls how many unique journey paths are included in the visualization
- Lower values show only the most common paths (cleaner diagram)
- Higher values show more detail (busier diagram)

### Step Path Filters
- One text input per step column, displayed above the diagram
- Autocomplete dropdown populated from known pages
- Supports wildcard patterns:
  - `*` matches any single path segment (e.g., `/blog/*` matches `/blog/hello` but not `/blog/2024/hello`)
  - `**` matches any number of path segments (e.g., `/blog/**` matches `/blog/hello` and `/blog/2024/hello`)
- Clearing a filter removes the constraint for that step
- Filters are AND-combined across steps

### View Toggle
- Toggle between "Sankey Diagram" and "Table View" (fallback for accessibility and data export)

---

## Implementation Plan

### Package Selection
- Use `d3-sankey` npm package (v0.12+) for layout computation
- Use `d3-shape` for link path generation (`sankeyLinkHorizontal`)
- Use `d3-scale` for color scales
- Render with SVG (not Canvas) for accessibility and interaction handling
- Do NOT build Sankey layout from scratch

### Color Palette
- 8 distinct colors for the top 8 first-path-segments
- Gray (#6b7280) for all remaining paths
- Colors assigned deterministically based on path segment name (consistent across renders)
- Palette: emerald, cyan, amber, rose, violet, blue, orange, pink (aligns with TrafficClaw's existing accent colors)

### Layout Algorithm
```
1. Fetch journey data from API
2. Parse into source-target pairs with weights
3. Feed into d3-sankey layout engine
4. Position nodes in columns with padding
5. Generate curved link paths
6. Render SVG with transitions
```

### Responsive Behavior
- Diagram fills available container width
- Minimum height: 400px
- Maximum height: 700px
- Node labels hidden below 768px viewport width (show on hover only)
- Horizontal scroll enabled if steps exceed viewport on mobile

---

## Component Structure

```
JourneysPage
|-- JourneysControls
|   |-- StepsSlider (range input: 2-6)
|   |-- JourneysSlider (range input: 10-200)
|   |-- ViewToggle (Sankey / Table)
|-- StepFilters
|   |-- StepFilterInput (one per step, with autocomplete)
|   |-- WildcardHelpTooltip
|-- SankeyDiagram
|   |-- SankeyNode (SVG rect + label)
|   |-- SankeyLink (SVG path with gradient fill)
|   |-- SankeyTooltip (positioned absolutely on hover)
|   |-- SankeyLegend (color key for top path segments)
|-- JourneysList (fallback table view)
|   |-- JourneyRow (path sequence + count + percentage)
|   |-- Pagination
|-- EmptyState (shown when no journey data available)
```

### Key Component Details

**SankeyDiagram**
- Uses `useRef` for the SVG container
- Layout computed via `useMemo` when data or controls change
- Animated transitions via CSS transitions on `opacity` and `d` attributes (not Framer Motion, to avoid D3 conflicts)
- Resize observer to recompute layout on container resize

**SankeyNode**
- `<rect>` element with rounded corners (rx=3)
- `<text>` label positioned to the right of the node (left side for last column)
- Click handler dispatches a filter action to the parent

**SankeyLink**
- `<path>` element using `sankeyLinkHorizontal()` generator
- Fill uses a `<linearGradient>` from source color to target color
- Stroke: none (fill-only for the curved band)

**SankeyTooltip**
- Absolutely positioned `<div>` outside the SVG (portaled to body)
- Shows: source page, target page, session count, percentage
- Follows mouse with `requestAnimationFrame` for smooth tracking

---

## Data Requirements

### API Endpoint
- Existing: `/api/analytics/journeys`
- The endpoint should return journey path data in this shape:

```typescript
interface JourneyData {
  journeys: JourneyPath[];
  totalSessions: number;
  pages: string[]; // all unique pages for autocomplete
}

interface JourneyPath {
  path: string[];       // ordered list of page paths
  count: number;        // number of sessions following this path
  percentage: number;   // count / totalSessions
}
```

### GA4 Data Considerations
- GA4 Data API does not natively support session-level page sequences as a single query
- **Approach A (Preferred)**: Query GA4 for `pagePath` with `sessionId` dimension, then reconstruct sequences server-side by grouping page hits by session and ordering by timestamp
- **Approach B (Approximate)**: Query top landing pages, then for each landing page query the most common second pages, then third pages, etc. This creates a tree approximation rather than true sequences
- **Approach C (If session data exists in admin DB)**: Use existing session tracking data from the admin API if available

### Query Parameters
```
GET /api/analytics/journeys?propertyId={id}&dateRange={range}&steps={2-6}&limit={10-200}&filters={stepFilters}
```

### Caching Strategy
- Cache journey data for 5 minutes (journeys change slowly)
- Use SWR with `revalidateOnFocus: false`
- Step/journey count changes should re-fetch (new SWR key)
- Step filter changes should re-fetch (new SWR key)

---

## Performance Considerations

- **Large datasets**: Cap at 200 unique journey paths maximum to keep SVG node count manageable
- **Debounce slider changes**: 300ms debounce on slider inputs before triggering re-fetch
- **Memoize layout**: `useMemo` on the d3-sankey computation (most expensive operation)
- **Virtual nodes**: If a step has more than 15 pages, group the smallest into an "Other" node
- **SVG optimization**: Use `will-change: opacity` on links for GPU-accelerated hover transitions

---

## Accessibility

- Sankey diagram wrapped in `role="img"` with `aria-label` describing the visualization
- Table view available as a fully accessible alternative
- Tooltips triggered on both hover and focus (keyboard navigation)
- Color choices pass WCAG AA contrast against dark background
- High contrast mode: links rendered with 1px stroke in addition to fill

---

## Error States

- **No data**: "No journey data available for the selected date range. Journeys require at least 2 pageviews per session."
- **API error**: "Failed to load journey data. Please try again." with retry button
- **Loading**: Skeleton with animated placeholder columns and links
- **Insufficient sessions**: "Not enough sessions to build meaningful journeys. Try expanding the date range."

---

## Migration Plan

1. Build `SankeyDiagram` component in isolation (can develop with mock data)
2. Wire up to existing `/api/analytics/journeys` endpoint
3. Add controls and filters
4. Replace current step-box visualization on the journeys page
5. Keep table view as a toggle option for users who prefer it
6. Remove old step-box components after validation
