# 04 — Main Chart Improvements

## Overview

Upgrade the existing Recharts `AreaChart` in `analytics/page.tsx` with:
1. **Previous period overlay** — a second `Area` with gray stroke + lower opacity
2. **Glass-effect tooltip** — `backdrop-blur` with current + previous values side by side
3. **Refined grid and axis styling** — ultra-subtle grid lines, neutral axis text
4. **Responsive height** — `h-[200px] md:h-[290px]` (down from `h-[220px] sm:h-[300px]`)

We keep Recharts. Switching to Nivo or D3 is not worth the migration cost for the incremental visual improvement.

---

## Current State

File: `web/src/app/(dashboard)/dashboard/analytics/page.tsx` (lines ~384-468)

Current chart configuration:
- Single `AreaChart` with one `Area` for the selected stat
- `CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"`
- `XAxis` / `YAxis` with `fontSize: 10, fill: '#3f3f46'` (zinc-700)
- Custom `ChartTooltip` with solid dark background
- Height: `h-[220px] sm:h-[300px]`
- Data: `bucketedTraffic` (aggregated by day/week/month)
- Gradient fill under the area line
- Stat switcher buttons + time bucket dropdown (keep both as-is)

---

## Previous Period Data

### Where it comes from

The previous period data is **already fetched** by `fetchAnalyticsDashboard()` in `googleApi.ts` (line 267):

```typescript
runGAReport(token, pid, ['date'], [
  'activeUsers', 'sessions', 'screenPageViews', 'bounceRate'
], prevStartDate, prevEndDate, 1000),
```

This `prevTotals` report is currently used only for KPI change% calculations. We need to:
1. Parse the previous period's daily data into the same `traffic` array shape
2. Return it alongside the existing `traffic` array
3. Merge it with current data for the chart overlay

### API-level change: `googleApi.ts`

In `fetchAnalyticsDashboard()`, the previous period rows are currently only aggregated into totals for change% calculations. We need to also return them as a time-series.

Add to `fetchAnalyticsDashboard()` result building (after the existing traffic processing, around line 340):

```typescript
// ─── Previous period traffic (for chart overlay) ───
const prevTraffic: any[] = [];
if (prevTotals?.rows) {
  for (const row of prevTotals.rows) {
    const date = row.dimensionValues[0].value;        // "20260301"
    const formatted = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
    prevTraffic.push({
      date: formatted,
      activeUsers: parseInt(row.metricValues[0]?.value) || 0,
      sessions: parseInt(row.metricValues[1]?.value) || 0,
      pageViews: parseInt(row.metricValues[2]?.value) || 0,
      bounceRate: parseFloat(row.metricValues[3]?.value) || 0,
    });
  }
  prevTraffic.sort((a, b) => a.date.localeCompare(b.date));
}

result.prevTraffic = prevTraffic;
```

Update the result type declaration at the top of the function:

```typescript
const result: any = {
  kpis: null, traffic: [], prevTraffic: [], sources: [], pages: [], ...
};
```

### No extra API call needed

This is important: we do NOT need an additional GA4 API call. The `prevTotals` report already fetches per-day data for the previous period. We are just exposing the raw rows that are currently discarded after aggregation.

---

## Merging Current + Previous for the Chart

The chart needs a single data array where each item has both current and previous values aligned by position (not by date). This is because the previous period has different dates but should overlay at the same x-position.

### Alignment strategy

Align by **ordinal position**, not by date. If the current period is Mar 1-30 and the previous period is Jan 31 - Mar 1, day 1 of each period lines up:

```typescript
// In analytics/page.tsx, after bucketing:

const prevTraffic: any[] = analyticsData?.prevTraffic || [];

// Bucket the previous period data with the same aggregation
const bucketedPrevTraffic = useMemo(
  () => aggregateByBucket(prevTraffic, bucket),
  [prevTraffic, bucket]
);

// Merge: align by position index
const mergedChartData = useMemo(() => {
  return bucketedTraffic.map((current, i) => ({
    ...current,
    // Previous period values prefixed with "prev_"
    prev_activeUsers: bucketedPrevTraffic[i]?.activeUsers ?? null,
    prev_sessions: bucketedPrevTraffic[i]?.sessions ?? null,
    prev_pageViews: bucketedPrevTraffic[i]?.pageViews ?? null,
    prev_bounceRate: bucketedPrevTraffic[i]?.bounceRate ?? null,
  }));
}, [bucketedTraffic, bucketedPrevTraffic]);
```

---

## Chart Component Changes

### Updated AreaChart in `analytics/page.tsx`

Replace the chart section (lines ~431-467) with:

```typescript
{/* Area chart */}
<div className="h-[200px] md:h-[290px] overflow-hidden">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={mergedChartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
      <defs>
        {/* Current period gradient */}
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={activeStat.color} stopOpacity={0.2} />
          <stop offset="95%" stopColor={activeStat.color} stopOpacity={0} />
        </linearGradient>
        {/* Previous period gradient (very subtle) */}
        <linearGradient id="chartGradPrev" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#71717a" stopOpacity={0.08} />
          <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
        </linearGradient>
      </defs>

      <CartesianGrid
        strokeDasharray="3 3"
        stroke="rgba(255,255,255,0.03)"
        vertical={false}
      />

      <XAxis
        dataKey="date"
        tick={{ fontSize: 10, fill: '#737373' }}
        tickFormatter={(v: string) => {
          if (bucket === 'week' || bucket === 'month') return v;
          const d = new Date(v);
          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }}
        axisLine={false}
        tickLine={false}
      />

      <YAxis
        tick={{ fontSize: 10, fill: '#737373' }}
        axisLine={false}
        tickLine={false}
        width={45}
      />

      <Tooltip content={<GlassTooltip activeStat={activeStat} />} />

      {/* Previous period area (rendered first = behind) */}
      {compareMode && (
        <Area
          type="monotone"
          dataKey={`prev_${chartStat}`}
          name={`Previous ${activeStat.label}`}
          stroke="#71717a"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          fill="url(#chartGradPrev)"
          dot={false}
          connectNulls
        />
      )}

      {/* Current period area (rendered second = in front) */}
      <Area
        type="monotone"
        dataKey={chartStat}
        name={activeStat.label}
        stroke={activeStat.color}
        fill="url(#chartGrad)"
        strokeWidth={2}
        dot={false}
        activeDot={{
          r: 4,
          fill: activeStat.color,
          stroke: '#000',
          strokeWidth: 2,
        }}
      />
    </AreaChart>
  </ResponsiveContainer>
</div>
```

### Key changes from current:
1. `vertical={false}` on CartesianGrid — removes vertical grid lines (cleaner look)
2. Axis fill changed from `#3f3f46` (zinc-700) to `#737373` (neutral-500) for better readability
3. `YAxis width={45}` — prevents label clipping on large numbers
4. Previous period `Area` with dashed stroke, zinc-500 color, very low opacity gradient
5. `activeDot` on current period for clear hover indicator
6. `connectNulls` on previous period to handle length mismatches gracefully
7. Height reduced to `h-[200px] md:h-[290px]`
8. Previous period area only renders when `compareMode` is true (toggled via the existing Compare button in the layout header)

---

## Glass-Effect Tooltip

Replace the current `ChartTooltip` component with a new `GlassTooltip`:

```typescript
interface GlassTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  activeStat: { key: string; label: string; color: string };
}

function GlassTooltip({ active, payload, label, activeStat }: GlassTooltipProps) {
  if (!active || !payload?.length) return null;

  const current = payload.find((p: any) => p.dataKey === activeStat.key);
  const previous = payload.find((p: any) => p.dataKey === `prev_${activeStat.key}`);

  // Calculate change between current and previous
  const currentVal = current?.value ?? 0;
  const previousVal = previous?.value ?? 0;
  const changePercent = previousVal > 0
    ? Math.round(((currentVal - previousVal) / previousVal) * 1000) / 10
    : 0;

  return (
    <div className="relative rounded-xl px-4 py-3 shadow-2xl min-w-[200px] border border-white/[0.1]"
         style={{
           background: 'rgba(10, 10, 15, 0.8)',
           backdropFilter: 'blur(16px)',
           WebkitBackdropFilter: 'blur(16px)',
         }}>
      {/* Date label */}
      <p className="text-[11px] font-semibold text-white/70 mb-2.5">{label}</p>

      {/* Current value */}
      <div className="flex items-center justify-between gap-6 mb-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: activeStat.color }} />
          <span className="text-[11px] text-zinc-400">Current</span>
        </div>
        <span className="text-sm font-bold text-white tabular-nums">
          {activeStat.key === 'bounceRate'
            ? `${currentVal}%`
            : currentVal?.toLocaleString()}
        </span>
      </div>

      {/* Previous value (if compare mode is on and data exists) */}
      {previous && previousVal != null && (
        <>
          <div className="flex items-center justify-between gap-6 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-zinc-500" />
              <span className="text-[11px] text-zinc-500">Previous</span>
            </div>
            <span className="text-sm font-medium text-zinc-400 tabular-nums">
              {activeStat.key === 'bounceRate'
                ? `${previousVal}%`
                : previousVal?.toLocaleString()}
            </span>
          </div>

          {/* Change indicator */}
          {changePercent !== 0 && (
            <div className={`flex items-center justify-end gap-1 pt-1.5 border-t border-white/[0.06] text-[11px] font-semibold ${
              changePercent > 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {changePercent > 0 ? '+' : ''}{changePercent}%
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

### Tooltip visual spec:
- Background: `rgba(10, 10, 15, 0.8)` — near-black with transparency
- `backdrop-filter: blur(16px)` — the glass effect; underlying chart content blurs through
- Border: `border-white/[0.1]` — subtle white outline
- Shadow: `shadow-2xl` — depth perception
- Width: `min-w-[200px]` — enough for labels + values
- Current value: large, white, bold
- Previous value: smaller, zinc-400, medium weight
- Change%: bottom row with green/red coloring, separated by a subtle border-top

---

## Compare Mode Integration

The `compareMode` state already exists in `analyticsFilterStore.ts` and is toggled via the Compare button in `layout.tsx` (line 162). The previous period overlay only renders when `compareMode` is true.

When `compareMode` is false:
- Only one `Area` renders (current period)
- Tooltip shows only the current value (no "Previous" row)
- No dashed line visible

When `compareMode` is true:
- Two `Area` components render
- Tooltip shows both current + previous + change%
- The Compare button in the header shows blue active state (already implemented)

---

## Styling Constants

For reference, the exact style values used:

```
Grid lines:        rgba(255, 255, 255, 0.03)     # Nearly invisible
Axis text:         #737373                         # neutral-500
Previous stroke:   #71717a                         # zinc-500
Previous dash:     4 4                             # Short dashes
Previous fill:     rgba(113, 113, 122, 0.08)       # Barely visible gray
Current fill:      20% opacity gradient of stat color
Tooltip bg:        rgba(10, 10, 15, 0.8)           # Near-black glass
Tooltip blur:      16px
Tooltip border:    rgba(255, 255, 255, 0.1)
```

---

## Implementation Steps

### Step 1: Expose previous period traffic from API

In `web/src/lib/googleApi.ts`, inside `fetchAnalyticsDashboard()`:

1. Add `prevTraffic: []` to the initial `result` object (line ~233)
2. After the existing previous period aggregation code (around line ~340, where `prevUsers`, `prevSessions` etc. are calculated), add the `prevTraffic` array construction shown above
3. No changes needed to the API route (`api/analytics/route.ts`) since it passes through the entire result object

### Step 2: Update the analytics page

In `web/src/app/(dashboard)/dashboard/analytics/page.tsx`:

1. Extract `prevTraffic` from `analyticsData`:
   ```typescript
   const prevTraffic: any[] = analyticsData?.prevTraffic || [];
   ```

2. Add the `bucketedPrevTraffic` and `mergedChartData` memos (shown above)

3. Read `compareMode` from the filter store (already imported):
   ```typescript
   const { filters, toggleFilter, compareMode } = useFilterStore();
   ```
   Note: `compareMode` is already destructured on line 206 of `layout.tsx` but NOT in `page.tsx`. Add it to the page's store destructuring.

4. Replace `ChartTooltip` with `GlassTooltip`

5. Replace the chart `<div>` with the updated version (shown above)

6. Update the chart data source from `bucketedTraffic` to `mergedChartData`

### Step 3: Clean up

1. Remove the old `ChartTooltip` component (lines 59-77 of page.tsx)
2. Update the chart height from `h-[220px] sm:h-[300px]` to `h-[200px] md:h-[290px]`

---

## Edge Cases

- **Previous period shorter than current**: If the previous period has fewer data points (e.g., current = 30 days, previous = 28 days due to February), the last few `prev_*` values will be `null`. `connectNulls` on the Area handles this by drawing through gaps.
- **No previous data**: If `prevTraffic` is empty (first-time user, new property), no previous Area renders and the tooltip only shows current values.
- **Compare mode off**: Previous Area is conditionally rendered with `{compareMode && <Area ... />}`. The tooltip checks for the presence of the `previous` payload entry.
- **Bucket aggregation**: Previous period is bucketed with the same `aggregateByBucket()` function, so week/month views align correctly.
- **Filtered data**: When filters are active, `chartTraffic` already applies the ratio. The `prevTraffic` should also have the same ratio applied. Add:
  ```typescript
  const adjustedPrevTraffic = useMemo(() => {
    if (!anyFilterActive || !filteredKpis) return prevTraffic;
    const r = filteredKpis._ratio;
    return prevTraffic.map((d: any) => ({
      ...d,
      activeUsers: Math.round((d.activeUsers || 0) * r),
      sessions: Math.round((d.sessions || 0) * r),
      pageViews: Math.round((d.pageViews || 0) * r),
    }));
  }, [prevTraffic, anyFilterActive, filteredKpis]);
  ```
  Then use `adjustedPrevTraffic` instead of `prevTraffic` when building `bucketedPrevTraffic`.

---

## Performance Notes

- The previous period data is already fetched in the same `Promise.all` batch — no additional latency
- The merged chart array is memoized, so it only recalculates when traffic data or bucket changes
- Recharts handles two `Area` components efficiently since they share the same coordinate system
- `backdropFilter: blur(16px)` is GPU-accelerated on all modern browsers; it has no measurable performance impact on chart interactions
- `connectNulls` does not cause Recharts to re-render — it just tells the SVG path generator to skip null points
