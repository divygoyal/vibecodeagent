# 01 — Design Token Specification

## Overview

This document defines every color, font size, spacing value, border, and card style used in the TrafficClaw analytics redesign. The goal is to replace the current opacity-based glassmorphism system (`rgba(255,255,255,0.06)` everywhere) with a solid, predictable neutral scale that renders identically across browsers and GPUs.

All values target the **dark theme** (default). Light theme overrides via `[data-theme='light']` follow the same token names but invert the scale.

---

## 1. Color Scale

### 1.1 Neutral Scale (Dark Theme)

A custom 13-step zinc-based neutral scale. These are the **only** background and border grays used anywhere in the analytics section.

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-0` | `#000000` | Page background, sidebar background |
| `neutral-25` | `#050508` | Page background alternative (current body bg) |
| `neutral-50` | `#0a0a0f` | Card background, dropdown background |
| `neutral-75` | `#0f0f14` | Elevated card background, modal background |
| `neutral-100` | `#18181b` | Card borders, table header background |
| `neutral-150` | `#1e1e23` | Separator lines, divider borders |
| `neutral-200` | `#27272a` | Active/selected row background, input borders |
| `neutral-300` | `#3f3f46` | Hover borders, secondary borders |
| `neutral-400` | `#52525b` | Disabled text, placeholder text |
| `neutral-500` | `#71717a` | Muted text (labels, timestamps, captions) |
| `neutral-600` | `#a1a1aa` | Secondary text (descriptions, subtitles) |
| `neutral-700` | `#d4d4d8` | Primary text (body copy, values) |
| `neutral-800` | `#e4e4e7` | Emphasized text |
| `neutral-900` | `#f4f4f5` | High-contrast text (headings, KPI values) |
| `neutral-950` | `#fafafa` | Maximum contrast text (rarely used) |

### 1.2 Semantic Color Tokens

These map neutral scale values to semantic roles. Every component references semantic tokens, never raw hex values.

```css
:root {
  /* Backgrounds */
  --bg-page:            #000000;    /* neutral-0 — full page background */
  --bg-page-alt:        #050508;    /* neutral-25 — alternative page bg */
  --bg-card:            #0a0a0f;    /* neutral-50 — card surfaces */
  --bg-card-elevated:   #0f0f14;    /* neutral-75 — modals, popovers */
  --bg-row-hover:       #18181b;    /* neutral-100 — table row hover */
  --bg-row-active:      #27272a;    /* neutral-200 — selected/active rows */
  --bg-input:           #0a0a0f;    /* neutral-50 — form inputs */
  --bg-badge:           #18181b;    /* neutral-100 — badge backgrounds */

  /* Borders */
  --border-default:     #18181b;    /* neutral-100 — card borders, panel borders */
  --border-subtle:      #1e1e23;    /* neutral-150 — dividers, separators */
  --border-hover:       #3f3f46;    /* neutral-300 — hover state borders */
  --border-input:       #27272a;    /* neutral-200 — form input borders */
  --border-focus:       #34d399;    /* emerald-400 — focus rings */

  /* Text */
  --text-primary:       #f4f4f5;    /* neutral-900 — headings, KPI values */
  --text-secondary:     #a1a1aa;    /* neutral-600 — body text, descriptions */
  --text-muted:         #71717a;    /* neutral-500 — labels, captions, timestamps */
  --text-disabled:      #52525b;    /* neutral-400 — disabled states */
  --text-placeholder:   #52525b;    /* neutral-400 — input placeholders */

  /* Surfaces */
  --header-bg:          #000000;    /* neutral-0 — solid, no transparency */
  --sidebar-bg:         #000000;    /* neutral-0 — solid, no transparency */
  --dropdown-bg:        #0a0a0f;    /* neutral-50 */
  --tooltip-bg:         #0f0f14;    /* neutral-75 */
}
```

### 1.3 Accent Colors

Primary accent pair used across the product. Emerald is the primary action color; cyan is the secondary/data color.

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `accent-emerald-50` | `#ecfdf5` | `emerald-50` | Faint tint background |
| `accent-emerald-100` | `#d1fae5` | `emerald-100` | Light badge bg (light theme) |
| `accent-emerald-200` | `#a7f3d0` | `emerald-200` | — |
| `accent-emerald-300` | `#6ee7b7` | `emerald-300` | Sparkline fill, gradient endpoint |
| `accent-emerald-400` | `#34d399` | `emerald-400` | **Primary accent** — buttons, links, focus rings, active states |
| `accent-emerald-500` | `#10b981` | `emerald-500` | Chart lines, percentage bars (`bg-emerald-500/15` for bar fill) |
| `accent-emerald-600` | `#059669` | `emerald-600` | Pressed button state |
| `accent-emerald-700` | `#047857` | `emerald-700` | — |
| `accent-emerald-800` | `#065f46` | `emerald-800` | — |
| `accent-emerald-900` | `#064e3b` | `emerald-900` | Subtle accent bg (badge bg in dark) |

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `accent-cyan-300` | `#67e8f9` | `cyan-300` | — |
| `accent-cyan-400` | `#22d3ee` | `cyan-400` | Secondary accent — compare lines, secondary data |
| `accent-cyan-500` | `#06b6d4` | `cyan-500` | Chart secondary line |

### 1.4 Status Colors

Used for alerts, badges, and inline indicators. Each has a background tint and a foreground text color.

| Status | Foreground Hex | Tailwind | Background Tint | Usage |
|--------|---------------|----------|-----------------|-------|
| Success | `#34d399` | `emerald-400` | `emerald-500/10` | Positive change, upward trend, healthy |
| Warning | `#fbbf24` | `amber-400` | `amber-500/10` | Caution, degraded, needs attention |
| Destructive | `#f87171` | `red-400` | `red-500/10` | Error, negative trend, critical |
| Info | `#60a5fa` | `blue-400` | `blue-500/10` | Informational, neutral notice |

**Usage in change indicators:**

```tsx
// Positive change (green up arrow)
<span className="text-emerald-400">+12.3%</span>

// Negative change (red down arrow)
<span className="text-red-400">-5.2%</span>

// Neutral / no change
<span className="text-zinc-500">0.0%</span>
```

### 1.5 Data Visualization Palette

For charts, heatmaps, and multi-series data. Ordered by visual distinctness; first two are the accent pair.

| Index | Name | Hex | Tailwind | Usage |
|-------|------|-----|----------|-------|
| 0 | Emerald | `#34d399` | `emerald-400` | Primary series, current period |
| 1 | Cyan | `#22d3ee` | `cyan-400` | Secondary series, comparison period |
| 2 | Violet | `#a78bfa` | `violet-400` | Third series |
| 3 | Amber | `#fbbf24` | `amber-400` | Fourth series |
| 4 | Rose | `#fb7185` | `rose-400` | Fifth series |
| 5 | Sky | `#38bdf8` | `sky-400` | Sixth series |
| 6 | Lime | `#a3e635` | `lime-400` | Seventh series |
| 7 | Fuchsia | `#e879f9` | `fuchsia-400` | Eighth series |

**Previous period overlay:** Use the same series color at `0.2` opacity with a dashed stroke.

```tsx
// Recharts example
<Line dataKey="current" stroke="#34d399" strokeWidth={2} dot={false} />
<Line dataKey="previous" stroke="#34d399" strokeOpacity={0.2} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
```

**Heatmap scale (retention cohort):**

| Level | Color | Opacity Pattern |
|-------|-------|-----------------|
| 0% | `#0a0a0f` | Base card bg |
| 1-20% | `emerald-500/15` | Faint |
| 21-40% | `emerald-500/25` | Light |
| 41-60% | `emerald-500/40` | Medium |
| 61-80% | `emerald-500/60` | Strong |
| 81-100% | `emerald-500/80` | Intense |

---

## 2. Typography

### 2.1 Font Stack

Keep Geist Sans (loaded via `next/font/local` as `--font-geist-sans`) for all UI text and Geist Mono (`--font-geist-mono`) for code and numeric tabular data.

```css
--font-sans: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
--font-mono: var(--font-geist-mono), ui-monospace, 'SF Mono', 'Cascadia Mono', monospace;
```

### 2.2 Size Scale

The type scale uses Tailwind's default sizes. Here is the mapping to our component system:

| Tailwind Class | Size | Line Height | Usage |
|---------------|------|-------------|-------|
| `text-[10px]` | 10px | 14px | Table column headers (uppercase, tracking-wider) |
| `text-xs` | 12px | 16px | **Primary body text** — table cells, data row labels, tab labels, badge text, KPI labels, filter chips |
| `text-sm` | 14px | 20px | Section titles, drawer headings, button text, input text |
| `text-base` | 16px | 24px | Page titles, modal headings |
| `text-lg` | 18px | 28px | Rarely used |
| `text-xl` | 20px | 28px | KPI values (main) |
| `text-2xl` | 24px | 32px | **KPI hero values** on overview |
| `text-3xl` | 30px | 36px | Page hero number (e.g., total visitors at top) |

### 2.3 Weight Scale

| Tailwind Class | Weight | Usage |
|---------------|--------|-------|
| `font-normal` | 400 | Body text, table cells, descriptions |
| `font-medium` | 500 | **Most common** — KPI labels, KPI values, tab labels, data row labels, badge text, button text |
| `font-semibold` | 600 | Section headings, table column headers, emphasized values |
| `font-bold` | 700 | Page titles only (sparingly) |

### 2.4 Specific Component Typography

```
KPI Label:          text-xs font-medium text-zinc-500      ("Sessions", "Bounce Rate")
KPI Value:          text-2xl font-medium text-zinc-100      ("12,847")
KPI Change:         text-xs font-medium text-emerald-400    ("+12.3%")

Table Header:       text-[10px] font-semibold text-zinc-500 uppercase tracking-wider
Table Cell:         text-xs text-zinc-300                    ("blog/my-post")
Table Cell Numeric: text-xs font-medium text-zinc-200 tabular-nums  ("1,234")

Tab Label:          text-xs font-medium                      ("Referrers", "Pages")
Tab Active:         text-xs font-medium text-white
Tab Inactive:       text-xs font-medium text-zinc-500

Data Row Label:     text-xs font-medium text-zinc-300        ("google.com")
Data Row Value:     text-xs font-medium text-zinc-400 tabular-nums ("2,341")
Data Row Percent:   text-xs text-zinc-500 tabular-nums       ("32.1%")

Badge:              text-[10px] font-medium                  ("Desktop", "Chrome")
Button Primary:     text-sm font-medium
Button Small:       text-xs font-medium

Section Title:      text-sm font-semibold text-zinc-200
Page Title:         text-base font-semibold text-zinc-100
```

### 2.5 Letter Spacing

| Usage | Class | Value |
|-------|-------|-------|
| Table column headers | `tracking-wider` | 0.05em |
| Badge text | `tracking-wide` | 0.025em |
| Everything else | default | 0 |

### 2.6 Line Height

Use Tailwind defaults (they match Geist's metrics). Override only for KPI values where tighter line-height looks better:

```
KPI Values: leading-none (line-height: 1)
Everything else: Tailwind defaults
```

### 2.7 Tabular Numbers

All numeric values in tables, KPIs, and data rows MUST use `tabular-nums` to prevent layout shift when digits change:

```tsx
<span className="tabular-nums">12,847</span>
```

---

## 3. Spacing

### 3.1 Card Padding

The current design uses `p-4 md:p-6` (16px / 24px) which creates excessive whitespace. The redesign uses tighter padding:

| Context | Old | New | Tailwind |
|---------|-----|-----|----------|
| Card padding (mobile) | `p-4` (16px) | `p-2` (8px) | `p-2` |
| Card padding (desktop) | `p-6` (24px) | `p-3` (12px) | `md:p-3` |
| Card header area | `pb-4` | `pb-2` | `pb-2` |
| Section inner padding | `p-4` | `p-2` | `p-2` |

**Standard card padding class:** `p-2 md:p-3`

### 3.2 Gap Scale

| Context | Old | New | Tailwind |
|---------|-----|-----|----------|
| Between cards in a grid | `gap-4` or `gap-6` | `gap-2` | `gap-2` |
| Between sections vertically | `space-y-6` | `space-y-2` | `space-y-2` |
| Between KPIs in strip | `gap-4` | `gap-0` (use dividers) | `gap-0 divide-x divide-neutral-100` |
| Between items in a list | `gap-3` | `gap-1` | `gap-1` |
| Between label and value | `gap-2` | `gap-1` | `gap-1` |

### 3.3 Row Heights

| Element | Height | Tailwind |
|---------|--------|----------|
| Data row (breakdown panel) | 28px | `h-7` |
| Table header row | 32px | `h-8` |
| Table body row | 28px | `h-7` |
| Tab bar | 32px | `h-8` |
| Filter chip | 24px | `h-6` |
| Small button | 28px | `h-7` |
| Default button | 32px | `h-8` |
| Input field | 32px | `h-8` |

### 3.4 Section Heights

Fixed heights create visual consistency across the 2x3 or 3x2 panel grid:

| Section | Height | CSS |
|---------|--------|-----|
| Breakdown panel (Referrers, Pages, etc.) | 405px | `h-[405px]` |
| Main chart area | 300px | `h-[300px]` |
| KPI strip | auto (content) | — |

Panels use `overflow-y-auto` internally so content scrolls within the fixed height:

```tsx
<div className="h-[405px] overflow-y-auto">
  {rows.map(row => <DataRow key={row.label} {...row} />)}
</div>
```

### 3.5 Grid Layouts

```tsx
// Breakdown panels: 2 columns on desktop, 1 on mobile
<div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
  <BreakdownPanel title="Referrers" ... />
  <BreakdownPanel title="Pages" ... />
  <BreakdownPanel title="Browsers" ... />
  <BreakdownPanel title="Countries" ... />
  <BreakdownPanel title="Devices" ... />
  <BreakdownPanel title="OS" ... />
</div>

// KPI strip: horizontal with dividers
<div className="flex items-stretch divide-x divide-[#18181b]">
  <KPICell label="Visitors" value={...} />
  <KPICell label="Sessions" value={...} />
  ...
</div>
```

---

## 4. Borders & Radius

### 4.1 Border Colors

| Context | Old | New | Tailwind |
|---------|-----|-----|----------|
| Card border | `rgba(255,255,255,0.06)` | `#18181b` | `border-[#18181b]` or `border-zinc-800` |
| Table row separator | `rgba(255,255,255,0.03)` | `#1e1e23` | `border-[#1e1e23]` |
| Input border | `rgba(255,255,255,0.05)` | `#27272a` | `border-zinc-800` |
| Input focus border | `emerald-500/30` | `#34d399` | `focus:border-emerald-400` |
| Divider (KPI strip) | `rgba(255,255,255,0.06)` | `#18181b` | `divide-[#18181b]` |
| Hover border | `rgba(255,255,255,0.12)` | `#3f3f46` | `hover:border-zinc-700` |

**The key change:** Replace ALL `rgba(255,255,255,0.0X)` borders with solid hex values from the neutral scale. Opacity-based borders render differently on different GPUs and vary with backdrop content. Solid borders are deterministic.

### 4.2 Border Radius

| Element | Old | New | Tailwind |
|---------|-----|-----|----------|
| Cards | `rounded-2xl` (16px) | `rounded-lg` (8px) | `rounded-lg` |
| Buttons | `rounded-lg` | `rounded-md` (6px) | `rounded-md` |
| Badges | `rounded-full` | `rounded-md` (6px) | `rounded-md` |
| Inputs | `rounded-lg` | `rounded-md` (6px) | `rounded-md` |
| Tabs container | `rounded-lg` | `rounded-md` (6px) | `rounded-md` |
| Tooltips | `rounded-lg` | `rounded-md` (6px) | `rounded-md` |
| Dropdown menus | `rounded-xl` | `rounded-lg` (8px) | `rounded-lg` |
| Modal/dialog | `rounded-2xl` | `rounded-lg` (8px) | `rounded-lg` |

**Rule of thumb:** Cards get `rounded-lg`. Everything inside cards gets `rounded-md`. Nothing uses `rounded-2xl` or `rounded-full` (except avatar circles).

### 4.3 Border Width

All borders are `1px` (Tailwind `border`). No `border-2` anywhere in the analytics section.

---

## 5. Cards

### 5.1 Current Card System (What We're Replacing)

The current codebase has three card classes that all use glassmorphism:

**`.glass-card`** (globals.css line 186):
```css
.glass-card {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.02);
}
```

**`.premium-card`** (globals.css line 902):
```css
.premium-card {
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(24px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  /* ::before pseudo-element with animated conic-gradient border on hover */
  /* hover: translateY(-2px) + emerald glow shadow */
}
```

**`<GlassCard>` component** (`components/analytics/GlassCard.tsx`):
```tsx
// Uses framer-motion whileHover, var(--card-bg) = rgba(255,255,255,0.025), backdrop-blur
```

### 5.2 New Card System

Replace all three with a single, clean card style. No glassmorphism, no backdrop-filter, no animated gradient borders, no translateY hover.

**New `.card` class:**

```css
.card {
  background: #0a0a0f;
  border: 1px solid #18181b;
  border-radius: 8px;    /* rounded-lg */
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: #27272a;
}
```

**Equivalent Tailwind (for inline use):**

```tsx
<div className="bg-[#0a0a0f] border border-[#18181b] rounded-lg hover:border-zinc-800 transition-colors">
  {children}
</div>
```

**What's removed:**
- `backdrop-filter: blur(...)` — removed entirely; no performance cost from blur
- `rgba()` backgrounds — replaced with solid `#0a0a0f`
- `rgba()` borders — replaced with solid `#18181b`
- `box-shadow` on default state — no shadow
- `translateY` on hover — cards stay flat
- `::before` animated gradient border — removed
- `scale(1.002)` on hover — removed
- `inset` box shadows — removed

**What's kept:**
- Border color change on hover (subtle, `#18181b` → `#27272a`)
- `transition-colors` for smooth hover

### 5.3 Card Variants

| Variant | Background | Border | Usage |
|---------|-----------|--------|-------|
| Default | `#0a0a0f` | `#18181b` | Breakdown panels, settings cards |
| Elevated | `#0f0f14` | `#18181b` | Modals, dropdowns, popovers |
| Flush | `transparent` | `none` | Cards inside other cards (nested content) |
| Interactive | `#0a0a0f` | `#18181b` → `#3f3f46` on hover | Clickable cards |

### 5.4 Active/Selected Card

For cards that represent a selected state (e.g., active tab panel, selected filter):

```tsx
<div className={cn(
  "bg-[#0a0a0f] border rounded-lg",
  active
    ? "border-emerald-500/30 bg-emerald-500/[0.03]"
    : "border-[#18181b] hover:border-zinc-800"
)}>
```

---

## 6. Implementation — globals.css Changes

### 6.1 CSS Custom Properties to Update

Replace the current `:root` block (globals.css lines 29-48):

```css
/* BEFORE */
:root {
  --background: #000000;
  --foreground: #f0f0f0;
  --emerald: #34d399;
  --cyan: #22d3ee;
  --card-bg: rgba(255, 255, 255, 0.025);
  --card-border: rgba(255, 255, 255, 0.08);
  --card-hover: rgba(255, 255, 255, 0.12);
  --sidebar-bg: #000000;
  --header-bg: rgba(0, 0, 0, 0.92);
  --text-primary: #f5f5f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --input-bg: rgba(255, 255, 255, 0.025);
  --input-border: rgba(255, 255, 255, 0.05);
  --dropdown-bg: #0a0a0f;
  --table-row-hover: rgba(255, 255, 255, 0.02);
  --divider: rgba(255, 255, 255, 0.05);
  --accent-glow: rgba(52, 211, 153, 0.08);
}
```

```css
/* AFTER */
:root {
  --background: #000000;
  --foreground: #f4f4f5;
  --emerald: #34d399;
  --cyan: #22d3ee;
  --card-bg: #0a0a0f;
  --card-border: #18181b;
  --card-hover: #27272a;
  --sidebar-bg: #000000;
  --header-bg: #000000;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --input-bg: #0a0a0f;
  --input-border: #27272a;
  --dropdown-bg: #0a0a0f;
  --table-row-hover: #18181b;
  --divider: #1e1e23;
  --accent-glow: none;
}
```

### 6.2 Card Classes to Replace

**Remove** the `.glass-card`, `.glass-card-static`, and `.premium-card` classes and their hover/before pseudo-element rules. Replace with:

```css
/* ========== Cards ========== */
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: var(--card-hover);
}

.card-elevated {
  background: #0f0f14;
  border: 1px solid var(--card-border);
  border-radius: 8px;
}
```

### 6.3 Remove Backdrop Filter Usage

Search and remove all `backdrop-filter` and `-webkit-backdrop-filter` from globals.css. These cause rendering inconsistencies and GPU overhead. The solid background colors make blur unnecessary.

Lines to remove or update:
- `.glass-card` block (lines 186-199): replace entirely
- `.glass-card-static` block (lines 201-208): replace entirely
- `.premium-card` block (lines 902-936): replace entirely
- `--header-bg: rgba(0, 0, 0, 0.92)` → `--header-bg: #000000`

### 6.4 Tailwind Classes to Avoid

Do NOT use these Tailwind classes in the analytics section:

| Avoid | Use Instead | Reason |
|-------|-------------|--------|
| `bg-white/[0.03]` | `bg-[#0a0a0f]` | Opacity backgrounds render inconsistently |
| `border-white/[0.06]` | `border-[#18181b]` | Opacity borders are not predictable |
| `backdrop-blur-*` | (remove) | GPU overhead, no visual benefit with solid bg |
| `rounded-2xl` | `rounded-lg` | Too rounded for data-dense UI |
| `rounded-full` on badges | `rounded-md` | Pill badges waste horizontal space |
| `shadow-lg`, `shadow-xl` | (remove) | Clean flat design, no drop shadows on cards |
| `p-4 md:p-6` on cards | `p-2 md:p-3` | Tighter spacing for data-dense layout |
| `gap-4`, `gap-6` between cards | `gap-2` | Tighter grid |
| `text-sm` for table cells | `text-xs` | Smaller text for data density |
| `hover:bg-white/[0.02]` | `hover:bg-[#18181b]` | Solid hover backgrounds |

### 6.5 Tailwind Classes to Use

| Context | Class |
|---------|-------|
| Card | `bg-[#0a0a0f] border border-[#18181b] rounded-lg` |
| Card padding | `p-2 md:p-3` |
| Card hover | `hover:border-zinc-800 transition-colors` |
| Table header | `text-[10px] font-semibold text-zinc-500 uppercase tracking-wider` |
| Table cell | `text-xs text-zinc-300` |
| Table numeric cell | `text-xs font-medium text-zinc-200 tabular-nums` |
| Data row | `h-7 px-2 flex items-center text-xs` |
| KPI label | `text-xs font-medium text-zinc-500` |
| KPI value | `text-2xl font-medium text-zinc-100 tabular-nums` |
| Section gap | `gap-2` |
| Page padding | `p-2 md:p-3` |

---

## 7. Migration Checklist

### Phase 1: globals.css

- [ ] Update `:root` custom properties to solid hex values
- [ ] Replace `.glass-card` with `.card`
- [ ] Replace `.glass-card-static` with `.card`
- [ ] Replace `.premium-card` with `.card` (remove `::before` animation)
- [ ] Remove all `backdrop-filter` declarations
- [ ] Remove `.glow-emerald`, `.glow-cyan`, `.glow-violet` classes
- [ ] Update `[data-theme='light']` overrides to match new token names

### Phase 2: Components

- [ ] Update `GlassCard.tsx` → remove framer-motion hover, use `.card` class
- [ ] Search all `bg-white/` classes in analytics section → replace with solid colors
- [ ] Search all `border-white/` classes → replace with solid hex
- [ ] Search all `backdrop-blur` classes → remove
- [ ] Update all `rounded-2xl` → `rounded-lg`
- [ ] Update all `p-4 md:p-6` on cards → `p-2 md:p-3`
- [ ] Update all `gap-4` / `gap-6` in analytics grids → `gap-2`
- [ ] Update all `text-sm` in table cells → `text-xs`
- [ ] Verify `tabular-nums` on all numeric displays

### Phase 3: Verify

- [ ] Check all card backgrounds are solid (no transparency)
- [ ] Check all borders are solid (no opacity)
- [ ] Check no `backdrop-filter` remains in analytics routes
- [ ] Verify KPI strip uses `divide-x` instead of individual borders
- [ ] Verify breakdown panels are `h-[405px]` with scroll

---

## 8. Light Theme Token Mapping

When `[data-theme='light']` is active, the semantic tokens flip:

```css
[data-theme='light'] {
  --background: #f8f9fb;
  --foreground: #18181b;
  --card-bg: #ffffff;
  --card-border: #e4e4e7;
  --card-hover: #d4d4d8;
  --sidebar-bg: #ffffff;
  --header-bg: #ffffff;
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #a1a1aa;
  --input-bg: #ffffff;
  --input-border: #e4e4e7;
  --dropdown-bg: #ffffff;
  --table-row-hover: #f4f4f5;
  --divider: #e4e4e7;
  --accent-glow: none;
}
```

---

## 9. Reference: Zinc Scale to Custom Neutral Mapping

| Tailwind Zinc | Hex | Our Neutral Token |
|--------------|-----|-------------------|
| `zinc-950` | `#09090b` | ~ neutral-50 (we use `#0a0a0f`) |
| `zinc-900` | `#18181b` | neutral-100 |
| `zinc-800` | `#27272a` | neutral-200 |
| `zinc-700` | `#3f3f46` | neutral-300 |
| `zinc-600` | `#52525b` | neutral-400 |
| `zinc-500` | `#71717a` | neutral-500 |
| `zinc-400` | `#a1a1aa` | neutral-600 |
| `zinc-300` | `#d4d4d8` | neutral-700 |
| `zinc-200` | `#e4e4e7` | neutral-800 |
| `zinc-100` | `#f4f4f5` | neutral-900 |
| `zinc-50` | `#fafafa` | neutral-950 |

Note: Our "neutral" scale runs dark-to-light (50=dark, 950=light) because it's designed for a dark-first UI. The Tailwind zinc scale runs light-to-dark. The mapping above shows the equivalence. In practice, use Tailwind's `zinc-*` classes directly since they match our needs.
