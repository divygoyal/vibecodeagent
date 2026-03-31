# 12 — Advanced Date Picker

## Current State
- Simple dropdown with preset ranges: Today, 7d, 14d, 28d, 90d, 6m, 12m
- Stored in analyticsFilterStore as `range` string
- No period navigation, no timezone, no custom range

## Target: Full Date Picker

### Quick Presets
```
┌─────────────────────────┐
│ Today          Yesterday │
│ Last 7 days    Last 14d  │
│ Last 30 days   Last 60d  │
│ Last 90 days   Last 6mo  │
│ This week      Last week │
│ This month     Last month│
│ This year      Last year │
│ All Time                 │
│─────────────────────────│
│ Custom Range...          │ → Opens calendar
│─────────────────────────│
│ Timezone: UTC-5 ▾        │ → Timezone selector
└─────────────────────────┘
```

### Period Navigation Arrows
```
[◀]  Last 30 days (Mar 1 — Mar 30)  [▶]
```
- Left arrow: go to previous period (Feb 1 — Mar 1)
- Right arrow: go to next period (disabled if at present)
- Works with all presets except "All Time"
- Disabled in realtime mode

### Custom Date Range
- Calendar popup with start/end date pickers
- Shows selected range in header: "Mar 15 — Mar 30"
- Visual indicator of selected range on calendar

### Timezone Support
- Dropdown with major timezones
- Affects what "today" and "this week" mean
- Persisted in localStorage
- Default: browser timezone

### Implementation

**Extend analyticsFilterStore:**
```ts
interface DateState {
  mode: 'preset' | 'custom';
  preset: string;          // 'today', '7d', '30d', etc.
  customStart?: string;    // '2026-03-15'
  customEnd?: string;      // '2026-03-30'
  timezone: string;        // 'America/New_York'
  periodOffset: number;    // 0 = current, -1 = previous, -2 = two back
}
```

**GA4 API mapping:**
| Preset | startDate | endDate |
|--------|-----------|---------|
| today | today | today |
| yesterday | yesterday | yesterday |
| 7d | 7daysAgo | today |
| 30d | 30daysAgo | today |
| this_week | (computed Monday) | today |
| last_week | (prev Monday) | (prev Sunday) |
| custom | customStart | customEnd |

**Period offset:**
- For "Last 30 days" with offset -1: startDate = 60daysAgo, endDate = 31daysAgo
- For "This month" with offset -1: startDate = first of last month, endDate = last of last month

**New component:** `web/src/components/analytics/DatePicker.tsx`
- Replace the current range dropdown in analytics layout
- Use Radix Popover for the dropdown
- Calendar component for custom range (can use react-day-picker)
