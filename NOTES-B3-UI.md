# Batch 3 UI notes (tc/b3-ui, from tc/integrate 642e078)

Owner preview feedback, UI part. Checks run on worker1 (`scripts/dev/worker1.sh`), shots in
`/root/projects/tc-redesign-research/batch3/ui/`.

## 1. Page paths lead page lists
- `components/site/lib/pagePath.ts` (pure: `pageLabel` "/" -> "/ (home)", `splitPagePath`) and
  `components/site/PagePath.tsx`: one line, the head shrinks with an ellipsis and the last segment stays
  ("/es/tools/ai-ima…/generator", CSS only, follows the column width). With a page title: Radix tooltip
  (title + full path); without: native title.
- Used by the Pages card rows (`pages/PageRows.tsx`, rows 40px now), Landing lists, the Pages table,
  Traffic > Pages (all pages + landing pages).
- Page drawer: title = path, subtitle = page title (top-30 titles from pageTrends, else the new `title`
  field of the drawer's GA4 report `ga4PageDetail`, one extra 1-row GA4 call that may fail silently).
- Test: `tests/pagePath.test.mjs`.

## 2. Equal-height cards
- Overview (Pages|Sources, Locations|Search/Devices) and Traffic (Sources|Pages, Devices|Peak hours) rows no
  longer use `items-start`, so cards in a row share one height (phones stack: no change).
- `BarList fill` (opt-in): the list is a flex column that grows, "View all N →" sits at the bottom
  (`mt-auto`). `TabbedCard`'s panel is a flex column. `Ga4List fill` passes it on.
- Side cards show `SIDE_ROWS = 9` rows (Sources/Channels/AI, Devices tabs, Search tabs) to about match the
  Pages card's 8 rows of 40px.

## 3. Portfolio: cards above the fold
- `KpiStrip` (ui/StatCard.tsx) gained `density="slim"` (~60px: 13px label over a 17px value, 150px tiles) and a
  `trailing` slot that does not scroll with the tiles; `KpiItem.approx` shows a leading "≈".
- `TotalsStrip` is slim; the combined chart is behind "Show trend" (collapsed by default, `localStorage`
  `tc-portfolio-trend` = '1'/'0', read/write in try/catch). Picking a tile while collapsed opens the trend on it.
- `AlertsPanel` moved under the sites (id `portfolio-alerts-panel`, focusable); the header subtitle ends with
  "N alerts ↓" (smooth scroll unless reduced motion). Cards keep their alert chips. Loading skeleton strip 60px.
