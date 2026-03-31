# 03 — KPI Strip with Sparklines

## Overview

Replace the current KPI strip (6 cells with `AnimatedCounter` + `Change` arrows) with a refined strip that adds:
1. **NumberFlow** for smooth per-digit value transitions (replaces `AnimatedCounter`)
2. **Mini sparkline** (40px Recharts `AreaChart`) under each value
3. Click-to-select behavior: clicking a KPI selects it as the main chart's active stat

The strip remains a single `premium-card` row divided by `border-r`, not 6 separate cards.

---

## Visual Spec

```
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  Unique Users   │   Sessions     │  Page Views    │  Pages/Sess  │  Bounce Rate │  Avg Duration  │
 │  text-xs zinc-500│               │                │              │              │                │
 │  12,482          │   18,231       │  41,092        │   2.3        │  38.2%       │  3m 12s        │
 │  text-2xl white  │               │                │              │              │                │
 │  +12.3% arrow    │  -2.1% arrow   │  +8.4% arrow   │  --          │  -1.2% arrow │  --            │
 │  ┌────────────┐ │  ┌────────────┐│  ┌────────────┐│  (no spark)  │  ┌──────────┐│  (no spark)    │
 │  │ ~sparkline~│ │  │ ~sparkline~││  │ ~sparkline~││              │  │~sparkline~││                │
 │  └────────────┘ │  └────────────┘│  └────────────┘│              │  └──────────┘│                │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

### Dimensions
- Strip: single `premium-card` container, no internal padding gaps between cells
- Cell: `px-3 py-3 sm:px-4 sm:py-4 text-center` (matches current)
- Label: `text-[10px] text-zinc-500 mb-1 uppercase tracking-wider font-medium`
- Value: `text-lg sm:text-xl md:text-2xl font-bold text-white tabular-nums leading-tight`
- Change: existing `<Change />` component, `text-[10px]` with emerald/red coloring
- Sparkline: `h-[40px] mt-1` — only shown for metrics that have time-series data (Users, Sessions, Page Views, Bounce Rate)
- Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` with `divide-x divide-white/[0.04]`

### Click behavior
- Each KPI cell is a `<button>` with `cursor-pointer`
- Active cell has a subtle bottom border: `border-b-2 border-emerald-400`
- Clicking sets `chartStat` to the corresponding key
- Mapping: Unique Users -> `activeUsers`, Sessions -> `sessions`, Page Views -> `pageViews`, Bounce Rate -> `bounceRate`
- Pages/Session and Avg Duration are display-only (no chartStat mapping, no sparkline)

---

## Dependencies

### NumberFlow
```bash
cd web && npm install @number-flow/react
```

NumberFlow provides per-digit morphing transitions (like Stripe's pricing page). It replaces the current `AnimatedCounter` component which uses a cubic-eased `requestAnimationFrame` loop that interpolates the whole number.

Key differences:
- `AnimatedCounter`: animates from oldValue -> newValue as a single interpolated integer
- `NumberFlow`: each digit independently rolls/morphs to its new position

### Recharts (already installed)
Sparklines use the same `AreaChart` from recharts that the main chart uses.

---

## Data Source

Sparkline data comes from the existing `traffic` array returned by `useAnalyticsData('all', ...)`:

```typescript
// From analytics page.tsx line 246
const traffic: any[] = analyticsData?.traffic || [];

// Each item in traffic:
{
  date: "2026-03-15",
  activeUsers: 412,
  sessions: 523,
  pageViews: 1204,
  bounceRate: 38.2,
  avgSessionDuration: 192,
}
```

The `traffic` array is already sorted by date ascending. For the sparkline we use all data points (typically 30 for a 30d range, 7 for 7d, etc.). The sparkline does NOT aggregate by bucket — it always shows day-level granularity regardless of the main chart's bucket setting, since the sparkline is just a visual trend indicator.

When filters are active, use `chartTraffic` (the ratio-adjusted traffic) instead of raw `traffic`.

---

## Component Architecture

### File: `web/src/components/analytics/KPIStrip.tsx`

```typescript
'use client';

import { useMemo } from 'react';
import NumberFlow from '@number-flow/react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

// ─── Types ───

type ChartStat = 'activeUsers' | 'sessions' | 'pageViews' | 'bounceRate';

interface KPIMetric {
  key: string;
  label: string;
  value: number;
  change: number;
  format: 'number' | 'decimal' | 'percent' | 'duration';
  chartStatKey?: ChartStat;    // If defined, this KPI is clickable and maps to a chart stat
  sparklineDataKey?: string;   // Key in traffic[] to plot (e.g. 'activeUsers')
  color?: string;              // Sparkline stroke color
}

interface KPIStripProps {
  metrics: KPIMetric[];
  traffic: any[];              // Time-series data for sparklines
  activeChartStat: ChartStat;
  onSelectStat: (stat: ChartStat) => void;
}

// ─── Mini Sparkline ───

function MiniSparkline({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  if (!data || data.length < 2) return null;

  return (
    <div className="h-[40px] mt-1 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${dataKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Change Badge ───

function Change({ value, suffix = '%' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-[9px] text-zinc-600">--</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
      up ? 'text-emerald-400' : 'text-red-400'
    }`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? '+' : ''}{value}{suffix}
    </span>
  );
}

// ─── Format Helpers ───

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function fmtDuration(s: number): string {
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

// ─── KPI Cell ───

function KPICell({
  metric,
  traffic,
  isActive,
  onClick,
}: {
  metric: KPIMetric;
  traffic: any[];
  isActive: boolean;
  onClick?: () => void;
}) {
  const isClickable = !!metric.chartStatKey;

  const formattedValue = useMemo(() => {
    switch (metric.format) {
      case 'duration': return fmtDuration(metric.value);
      case 'percent': return undefined; // NumberFlow handles this
      case 'decimal': return undefined; // NumberFlow handles this
      default: return undefined;        // NumberFlow handles this
    }
  }, [metric.format, metric.value]);

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      className={`px-3 py-3 sm:px-4 sm:py-4 text-center transition-colors relative ${
        isClickable ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'
      } ${isActive ? 'bg-white/[0.02]' : ''}`}
      disabled={!isClickable}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-emerald-400" />
      )}

      {/* Label */}
      <p className="text-[10px] text-zinc-500 mb-1 truncate uppercase tracking-wider font-medium">
        {metric.label}
      </p>

      {/* Value — NumberFlow for animated digits, fallback for duration */}
      <div className="text-lg sm:text-xl md:text-2xl font-bold text-white tabular-nums leading-tight mb-0.5">
        {metric.format === 'duration' ? (
          <span>{formattedValue}</span>
        ) : metric.format === 'percent' ? (
          <NumberFlow
            value={metric.value}
            format={{ style: 'percent', maximumFractionDigits: 1 }}
            transformTiming={{ duration: 600, easing: 'ease-out' }}
          />
        ) : metric.format === 'decimal' ? (
          <NumberFlow
            value={metric.value}
            format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
            transformTiming={{ duration: 600, easing: 'ease-out' }}
          />
        ) : (
          <NumberFlow
            value={metric.value}
            format={{ notation: metric.value >= 100_000 ? 'compact' : 'standard' }}
            transformTiming={{ duration: 600, easing: 'ease-out' }}
          />
        )}
      </div>

      {/* Change */}
      <Change value={metric.change} />

      {/* Sparkline */}
      {metric.sparklineDataKey && metric.color && (
        <MiniSparkline
          data={traffic}
          dataKey={metric.sparklineDataKey}
          color={metric.color}
        />
      )}
    </button>
  );
}

// ─── Main Component ───

export default function KPIStrip({ metrics, traffic, activeChartStat, onSelectStat }: KPIStripProps) {
  return (
    <div className="premium-card stat-card-hover overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-white/[0.04]">
        {metrics.map((metric) => (
          <KPICell
            key={metric.key}
            metric={metric}
            traffic={traffic}
            isActive={metric.chartStatKey === activeChartStat}
            onClick={() => metric.chartStatKey && onSelectStat(metric.chartStatKey)}
          />
        ))}
      </div>
    </div>
  );
}
```

### Usage in `analytics/page.tsx`

Replace the current KPI strip section (lines ~352-382) with:

```typescript
import KPIStrip from '@/components/analytics/KPIStrip';

// Inside AnalyticsPage component, replace KPI section:

const kpiMetrics: KPIMetric[] = useMemo(() => [
  {
    key: 'users',
    label: 'Unique Users',
    value: displayKpis?.totalUsers ?? kpis.totalUsers,
    change: kpis.changeUsers,
    format: 'number',
    chartStatKey: 'activeUsers',
    sparklineDataKey: 'activeUsers',
    color: '#34d399',  // emerald-400
  },
  {
    key: 'sessions',
    label: 'Sessions',
    value: displayKpis?.totalSessions ?? kpis.totalSessions,
    change: kpis.changeSessions,
    format: 'number',
    chartStatKey: 'sessions',
    sparklineDataKey: 'sessions',
    color: '#22d3ee',  // cyan-400
  },
  {
    key: 'pageviews',
    label: 'Page Views',
    value: displayKpis?.totalPageViews ?? kpis.totalPageViews,
    change: kpis.changePageViews,
    format: 'number',
    chartStatKey: 'pageViews',
    sparklineDataKey: 'pageViews',
    color: '#a78bfa',  // violet-400
  },
  {
    key: 'pps',
    label: 'Pages / Session',
    value: kpis.pagesPerSession || 0,
    change: 0,
    format: 'decimal',
    // No chartStatKey — not clickable, no sparkline
  },
  {
    key: 'bounce',
    label: 'Bounce Rate',
    value: displayKpis?.avgBounceRate ?? kpis.avgBounceRate,
    change: kpis.changeBounceRate,
    format: 'percent',
    chartStatKey: 'bounceRate',
    sparklineDataKey: 'bounceRate',
    color: '#f472b6',  // pink-400
  },
  {
    key: 'duration',
    label: 'Avg Duration',
    value: kpis.avgSessionDuration || 0,
    change: 0,
    format: 'duration',
    // No chartStatKey — not clickable, no sparkline
  },
], [displayKpis, kpis]);

// In JSX, replace the KPI motion.div with:
{kpis && (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <KPIStrip
      metrics={kpiMetrics}
      traffic={chartTraffic}
      activeChartStat={chartStat}
      onSelectStat={setChartStat}
    />
  </motion.div>
)}
```

---

## Sparkline Gradient IDs

Each sparkline uses a unique gradient ID based on its `dataKey` (e.g., `spark-activeUsers`, `spark-sessions`). This prevents SVG gradient collisions when multiple sparklines render simultaneously. If two sparklines shared the same gradient ID, only the first definition would be used and all sparklines would have the same color.

---

## NumberFlow Configuration

### Percent format gotcha
NumberFlow's `style: 'percent'` expects a decimal (0.382 = 38.2%). Since our API returns bounce rate as a whole number (38.2), we need to divide by 100 before passing to NumberFlow:

```typescript
// For percent format, convert from 38.2 to 0.382
<NumberFlow
  value={metric.value / 100}
  format={{ style: 'percent', maximumFractionDigits: 1 }}
/>
```

### Animation timing
- `transformTiming.duration: 600` — fast enough to feel snappy, slow enough to notice the digit morphing
- `transformTiming.easing: 'ease-out'` — decelerating for a natural feel
- NumberFlow handles layout shifts internally (digits have fixed width via `tabular-nums`)

### Compact notation
For large numbers (100k+), use `notation: 'compact'` to show "125K" instead of "125,000". This keeps the KPI strip from overflowing on smaller screens.

---

## Responsive Behavior

| Breakpoint | Grid | Notes |
|-----------|------|-------|
| `< md` (mobile) | `grid-cols-2` | 3 rows of 2, sparklines hidden on very small screens via `hidden sm:block` |
| `md` (tablet) | `grid-cols-3` | 2 rows of 3 |
| `lg` (desktop) | `grid-cols-6` | Single row |

On mobile (`grid-cols-2`), the `divide-x` utility will apply borders between columns. To handle the visual break at row boundaries, add `divide-y divide-white/[0.04]` to the grid as well, or wrap in a custom layout. The cleanest approach:

```typescript
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-white/[0.04]
  [&>*:nth-child(2n+1)]:border-l-0    /* Remove left border on first col */
  [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-white/[0.04]  /* Top border on row 2+ (mobile) */
  md:[&>*:nth-child(n+3)]:border-t-0  /* Remove on md+ */
  md:[&>*:nth-child(n+4)]:border-t md:[&>*:nth-child(n+4)]:border-white/[0.04]  /* Row 2+ on md */
  lg:[&>*]:border-t-0                 /* All single row on lg */
">
```

Alternatively, keep it simple and only use `divide-x`. The row break on mobile is acceptable since the card background is continuous.

---

## Migration Steps

1. `npm install @number-flow/react` in `web/`
2. Create `web/src/components/analytics/KPIStrip.tsx` with the component above
3. In `analytics/page.tsx`:
   - Add `import KPIStrip from '@/components/analytics/KPIStrip'`
   - Build the `kpiMetrics` array in the component body (using `useMemo`)
   - Replace the `{kpis && (<motion.div>...grid-cols-3 sm:grid-cols-6...</motion.div>)}` block with the new `<KPIStrip>` usage
4. Optionally remove or deprecate `web/src/components/analytics/AnimatedCounter.tsx` if no other component uses it (check imports first)
5. Test at all breakpoints: mobile (375px), tablet (768px), desktop (1280px+)
6. Verify sparklines render with correct colors and don't flicker on data refresh (SWR `keepPreviousData: true` handles this)

---

## Edge Cases

- **No traffic data**: When `traffic.length === 0` (loading or error), sparklines return `null` — the KPI cells just show values without sparklines
- **Single data point**: When `traffic.length === 1`, sparklines return `null` (need at least 2 points for a line)
- **Filtered state**: Use `chartTraffic` (ratio-adjusted) for sparklines so the visual matches filtered KPI values
- **Zero values**: NumberFlow handles `0` gracefully; the Change component shows `--` for zero change
- **Very large numbers**: `notation: 'compact'` kicks in at 100k+ to prevent overflow
- **Duration format**: Duration stays as a plain `<span>` since NumberFlow can't format `3m 12s`; this is acceptable since duration doesn't change frequently enough to need digit morphing

---

## Performance Notes

- Sparklines use `isAnimationActive={false}` to avoid Recharts' default mount animation (which causes a visible "draw-in" on every SWR revalidation)
- Each sparkline is a small `AreaChart` with ~30 data points — minimal overhead
- NumberFlow is ~4KB gzipped and uses CSS transforms (no JavaScript animation loop), so it's GPU-accelerated
- The `useMemo` on `kpiMetrics` prevents unnecessary re-renders when unrelated state changes
