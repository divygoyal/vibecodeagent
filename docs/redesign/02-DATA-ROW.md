# 02 — DataRow Component (Rybbit-Style Rows)

## The Gap

Rybbit's rows have a colored **percentage bar behind the text** with the count on the right. Percentage text is hidden by default and **reveals on hover**. An external link icon also appears on hover. This is the single biggest visual difference between our analytics and Rybbit's.

**Current TrafficClaw:** Separate text column + separate bar column in AnalyticsTable. More spread out, less data-dense.

**Target (Rybbit):**
```
┌──────────────────────────────────────────────────────────┐
│ ██████████████████  google.com ↗           32%      261  │  ← bar behind text
│ ████████  github.com ↗                              52   │  ← % hidden until hover
│ ████  bing.com ↗                                    13   │
│ ███  reddit.com ↗                                   11   │
└──────────────────────────────────────────────────────────┘
```

## Component Spec

### File: `web/src/components/analytics/DataRow.tsx`

```tsx
'use client';

interface DataRowProps {
  label: string;
  value: number;
  maxValue: number;           // largest value in the list (for bar width calculation)
  icon?: React.ReactNode;     // favicon, flag, browser icon, etc.
  percentage?: number;        // e.g. 32 for 32%
  href?: string;              // external link URL
  onClick?: () => void;       // filter on click
  active?: boolean;           // currently filtered
  expandable?: boolean;       // has sub-rows
  expanded?: boolean;
  onExpand?: () => void;
  depth?: number;             // 0 = top-level, 1 = sub-row
}
```

### Visual Structure

```
┌─ Row Container (h-7, relative, group, cursor-pointer) ──────────┐
│                                                                   │
│  ┌─ Bar (absolute, left-0, top-0, h-full, bg-emerald-500/15) ┐  │
│  │  width = (value / maxValue) * 100%                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Content (relative z-10, flex, items-center, justify-between)┐│
│  │  [▶] [icon] [label] [↗]              [32%]          [261]   ││
│  │  expand  favicon  text  external-link  pct(hover)    count   ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### CSS Classes

```
Row:      relative flex items-center h-7 px-2 rounded cursor-pointer
          hover:bg-white/[0.03] transition-colors duration-150 group
Bar:      absolute left-0 top-0 h-full bg-emerald-500/15 rounded
Content:  relative z-10 flex items-center justify-between w-full
Label:    text-xs truncate
Pct:      text-xs text-neutral-500 opacity-0 group-hover:opacity-100
          transition-opacity duration-150 tabular-nums
Count:    text-xs font-medium tabular-nums
ExtLink:  w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100
SubRow:   pl-5 (indented for depth=1)
Active:   border-l-2 border-emerald-500 bg-emerald-500/5
```

### Interaction States

| State | Visual |
|-------|--------|
| Default | Bar + label + count visible. Percentage and link hidden. |
| Hover | Background lightens. Percentage and external link icon fade in. |
| Active (filtered) | Left emerald border. Subtle emerald background. |
| Expanded | Arrow rotates 90deg. Sub-rows appear below with pl-5. |

### Usage — Replace AnalyticsTable in Panels

**Before (current):**
```tsx
<AnalyticsTable data={referrers} columns={referrerColumns} maxRows={10} />
```

**After:**
```tsx
<ScrollArea className="h-[340px]">
  <div className="px-1 space-y-0.5">
    {referrers.map(ref => (
      <DataRow
        key={ref.source}
        label={ref.source}
        value={ref.sessions}
        maxValue={referrers[0]?.sessions || 1}
        icon={<ReferrerIcon source={ref.source} />}
        percentage={Math.round((ref.sessions / totalSessions) * 100)}
        href={`https://${ref.source}`}
        onClick={() => toggleFilter('referrer', ref.source)}
        active={filters.referrer.includes(ref.source)}
      />
    ))}
  </div>
</ScrollArea>
```

### Panel Container Pattern

Each breakdown panel should be:
```tsx
<div className="premium-card overflow-hidden" style={{ height: 405 }}>
  {/* Tab header */}
  <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
    <div className="flex gap-3">
      {tabs.map(tab => (
        <button key={tab} className={`text-xs font-medium pb-1 border-b-2 transition-colors
          ${active === tab ? 'text-white border-white' : 'text-neutral-500 border-transparent hover:text-neutral-300'}`}>
          {tab}
        </button>
      ))}
    </div>
    <button className="text-neutral-600 hover:text-white"><Maximize2 className="w-3.5 h-3.5" /></button>
  </div>

  {/* Column header */}
  <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-neutral-500 uppercase tracking-wider">
    <span>{activeTab}</span>
    <span>Sessions</span>
  </div>

  {/* Rows */}
  <ScrollArea className="h-[calc(405px-72px)]">
    <div className="px-1 space-y-0.5">
      {data.map(item => <DataRow key={item.id} {...item} />)}
    </div>
  </ScrollArea>
</div>
```

### Fixed Section Heights

All breakdown panels should be exactly **405px**. This creates visual consistency across the 2-column grid. The header takes ~72px, leaving ~333px for scrollable content (~12 rows visible at h-7 each).
