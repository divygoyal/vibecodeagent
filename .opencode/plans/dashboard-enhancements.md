# Dashboard Enhancement Plan — 10 Items

## Status: READY FOR IMPLEMENTATION

---

## Overview

Implement 10 enhancements to the dashboard overview page across `OverviewCommandCenter.tsx`, `page.tsx`, `globals.css`, and a new API route. All changes must pass strict ESLint (React 19 rules) and `tsc --noEmit`.

---

## Enhancement 1: Interactive Sparklines

**Problem:** `HardEdgeSparkline` (OverviewCommandCenter.tsx:155-202) renders raw SVG polylines — no hover, no tooltips, no axis labels. Used in Mission Control hero chart (line 646), Traffic Trend chart (line 958), and MetricCard (line 375).

**Solution:** Create an `InteractiveChart` component using Recharts (`AreaChart`, `Area`, `Tooltip`, `XAxis`, `YAxis`, `ResponsiveContainer`) already installed and used in KPICard.tsx. Keep `HardEdgeSparkline` for the small MetricCard sparklines (good fit there), but replace Mission Control and Traffic Trend charts with the new interactive version.

**Changes:**
1. Add Recharts imports: `AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine`
2. Add new `InteractiveChart` component after `HardEdgeSparkline`:
   - Props: `primaryData: number[]`, `secondaryData?: number[]`, `primaryLabel: string`, `secondaryLabel?: string`, `primaryColor: string`, `secondaryColor?: string`, `height?: number`
   - Transforms data arrays into `{ idx: number, primary: number, secondary?: number }[]`
   - Uses `<ResponsiveContainer>` → `<AreaChart>` with gradient fills
   - Custom dark tooltip with `contentStyle={{ background: '#0c0c14', border: '1px solid rgba(255,255,255,0.1)' }}`
   - X-axis shows day indices (Day 1, Day 2, ...) in zinc-500
   - Y-axis shows compact values in zinc-500
   - Two `<Area>` elements for primary/secondary with gradient defs
3. Replace Mission Control hero chart (lines 640-660) with `InteractiveChart`
4. Replace Traffic Trend chart (lines 956-967) with `InteractiveChart`
5. Add legend dots below each chart: `● {primaryLabel}  ● {secondaryLabel}`

**Files:** `OverviewCommandCenter.tsx`

---

## Enhancement 2: Rich Hover Tooltips on MetricCard

**Problem:** MetricCard (lines 328-383) only has `hover:border-white/[0.16]`. KPICard has a rich tooltip (lines 161-229).

**Solution:** Add a `group`-based hover tooltip to MetricCard, modeled on KPICard pattern.

**Changes:**
1. Wrap MetricCard content in a `<div className="relative group">` instead of just `<Link>`
2. Move `<Link>` inside the wrapper div
3. Add conditional tooltip div (only when `value` exists) with:
   - Position: `absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full`
   - Transition: `opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-300`
   - Pointer events: `pointer-events-none z-50`
   - Content: Previous period value (computed from midpoint of values array), min-max range, trend percentage, contextual AI tip based on label, quick action link
4. Compute `prev` value: `values.length >= 2 ? Math.round(values.slice(0, Math.floor(values.length / 2)).reduce((s, v) => s + v, 0) / Math.floor(values.length / 2)) : undefined`
5. Add boost tips per metric:
   - Total Users: "Boost organic traffic through striking-distance keywords"
   - Page Views: "Improve engagement by optimizing top landing pages"
   - Search Clicks: "Title tag optimization can lift CTR by 20-35%"
   - Avg. Position: "Target page-2 keywords for fastest ranking gains"

**Files:** `OverviewCommandCenter.tsx`

---

## Enhancement 3: Smarter Primary CTA

**Problem:** First queue item is always CTR-related ("Fix titles") when CTR problems exist. User wants analytics-aware actions.

**Solution:** Reorder priority queue construction to check for critical analytics alerts first.

**Changes:**
1. In the queue construction (lines 457-513), reorder:
   - First: check `biggestRisk` with `severity === 'critical'` AND `category === 'traffic'` → P1 (analytics alert)
   - Second: CTR problems → rename actionLabel from "Fix titles" to "Optimize CTR"
   - Third: striking distance (keep as-is)
   - Fourth: remaining risks or internal linking
2. Rename "Fix titles" → "Optimize CTR" in the CTR queue item (line 467)
3. Rename "View top pages" → "Boost authority" in the internal linking item (line 505)

**Files:** `OverviewCommandCenter.tsx` (lines 457-513)

---

## Enhancement 4: Live Pulse Section Polish

**Problem:** The Live Pulse panel (lines 664-714) has flat visual hierarchy.

**Solution:** Add pulse animation, icon labels, better health gauge, and improved spacing.

**Changes:**
1. Add pulse animation to active users count: `className="... animate-pulse"` only when `activeUsers > 0` — actually use a custom subtle pulse, not Tailwind's aggressive animate-pulse. Add CSS keyframe `@keyframes live-pulse` in globals.css.
2. Add icons to status chips:
   - Bot status: already has `<Bot>` ✓
   - Risks: add `<AlertTriangle>` icon before text
   - Open live view: add `<Activity>` icon before text
3. Below health score number, change "health" text to include "/ 100" visual: keep "health" but make the number display `{score}<span class="text-sm opacity-40">/100</span>`
4. Add color glow to health ring using CSS filter: `style={{ filter: 'drop-shadow(0 0 8px {color}40)' }}`
5. Improve spacing: add `gap-6` between user count section and status chips

**Files:** `OverviewCommandCenter.tsx` (lines 664-714), `globals.css` (new keyframe)

---

## Enhancement 5: Top Movers Enhancement

**Problem:** Top Movers (lines 906-933) is text-only with label, detail, delta.

**Solution:** Add trend icons, colored left accent border, and improved card structure.

**Changes:**
1. Add left border accent: `border-l-[3px]` with emerald for positive, amber for watch
2. Add trend icon: `<TrendingUp>` for positive, `<TrendingDown>` for watch, positioned next to delta
3. Restructure card layout:
   - Left: colored dot indicator
   - Center: label (font-medium text-white) + detail (text-zinc-400)
   - Right: delta value + trend icon, stacked vertically
4. Add hover effect: `hover:border-white/[0.12] hover:bg-[#0a0f14] transition-all duration-200`

**Files:** `OverviewCommandCenter.tsx` (lines 906-933)

---

## Enhancement 6: Top Pages "Load More"

**Problem:** Top Pages (line 980) hard-capped at `.slice(0, 3)`.

**Solution:** Add expandable view with state toggle.

**Changes:**
1. Add `useState` for `showAllPages` (boolean, default false) at the top of the main component
2. Change `.slice(0, 3)` to `.slice(0, showAllPages ? 10 : 3)` at line 980
3. Also change `topPages` computation to `.slice(0, 10)` instead of `.slice(0, 4)` at line 408
4. After the pages list, add a "Show more" / "Show less" button:
   ```tsx
   {overviewData.topPages.length > 3 && (
     <button onClick={() => setShowAllPages(v => !v)} className="...">
       {showAllPages ? <ChevronUp /> : <ChevronDown />}
       {showAllPages ? 'Show less' : `Show ${overviewData.topPages.length - 3} more`}
     </button>
   )}
   ```
5. Wrap the pages container in `overflow-hidden transition-all duration-300`

**Files:** `OverviewCommandCenter.tsx` (lines 408, 973-1006)

---

## Enhancement 7: Export Report Upgrade

**Problem:** `buildSeoReport()` generates bare Markdown. Full PDF pipeline exists at `/api/report/generate` but requires superadmin token.

**Solution:** Create a user-facing report API route and property selector modal.

**Changes:**
1. Create new file: `web/src/app/api/report/user-generate/route.ts`
   - Uses `getServerSession(authOptions)` for auth instead of superadmin token
   - Reuses `fetchReportData`, `analyzeReportData`, `synthesizeWithGemini`, `generateReportPdf`
   - Body: `{ period: 'weekly' | 'monthly', propertyId?, siteUrl? }`
   - Returns PDF as `application/pdf`
2. In `page.tsx`:
   - Add `showReportModal` state
   - Add `ReportExportModal` component: dropdowns for GA4 property and GSC site (from RegistrationContext), period toggle (weekly/monthly), generate button
   - Replace `handleExportReport` to open the modal instead of downloading markdown
   - On generate: POST to `/api/report/user-generate`, show loading spinner, download PDF blob
3. Pass modal opener through `onExportReport` prop to `OverviewCommandCenter`

**Files:** New `web/src/app/api/report/user-generate/route.ts`, modified `page.tsx`

---

## Enhancement 8: Typography Improvement

**Problem:** Headlines use standard Geist weights. Could be more impactful.

**Solution:** Use font-extrabold (weight 800) on headlines with tighter tracking.

**Changes:**
1. Mission Control headline (line 597): Change `font-semibold` → `font-extrabold`, add `tracking-[-0.03em]`, add `leading-[1.08]`
2. Priority Queue headline (line 791): Same treatment
3. Add subtle gradient text effect on the Mission Control headline using background-clip:
   ```
   bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent
   ```
   (Actually, this might be too much — just the weight/tracking changes for clean professional look)

**Files:** `OverviewCommandCenter.tsx` (lines 597, 791)

---

## Enhancement 9: Agent-Suggested Enhancements

**Changes:**
1. **Metric card stagger animation:** Add CSS classes `metric-card-enter` with `animation: fadeSlideUp 0.4s ease-out both` and `animation-delay` via style prop (0ms, 60ms, 120ms, 180ms) on the 4 metric card wrappers
2. **Chart legend dots:** Add colored circle + label below both interactive charts:
   ```tsx
   <div className="flex items-center gap-4 text-[11px] text-zinc-500">
     <span className="flex items-center gap-1.5">
       <span className="w-2 h-2 rounded-full bg-[#29E1A3]" /> Search clicks
     </span>
     <span className="flex items-center gap-1.5">
       <span className="w-2 h-2 rounded-full bg-[#1FC2FF]" /> Impressions
     </span>
   </div>
   ```
3. **Section fade-in:** Add `IntersectionObserver`-based fade-in for the 3 major sections using a `useFadeIn` hook + CSS class
4. **Subtle hover scale on cards:** Add `hover:translate-y-[-1px]` to MetricCard and mover cards for micro lift effect

**Files:** `OverviewCommandCenter.tsx`, `globals.css`

---

## Enhancement 10: Validation

1. Run `npx eslint src/components/dashboard/OverviewCommandCenter.tsx`
2. Run `npx eslint src/app/(dashboard)/dashboard/page.tsx`
3. Run `npx tsc --noEmit`
4. Fix any errors

---

## Implementation Order

1. Enhancements 1 + 2 + 3 (all in OverviewCommandCenter.tsx, can be done together)
2. Enhancement 4 (Live Pulse, same file + globals.css)
3. Enhancement 5 (Top Movers, same file)
4. Enhancement 6 (Top Pages, same file)
5. Enhancement 8 (Typography, same file)
6. Enhancement 9 (Animations, same file + globals.css)
7. Enhancement 7 (Export, new API route + page.tsx)
8. Enhancement 10 (Validation)

---

## Key Constraints

- React 19 lint rules: no `setState` in effects, no ref access during render
- Tailwind CSS v4 (CSS-first config, no tailwind.config.ts)
- All UI hand-built (no shadcn/radix)
- Preserve existing dark aesthetic (zinc/emerald/cyan palette)
- Recharts is installed (`recharts@^2.15.3`)
- `@react-pdf/renderer` is installed for PDF generation
- Must match local file style (single quotes, 2-space indent, semicolons)