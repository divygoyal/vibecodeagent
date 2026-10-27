# Round 2 · WS3 dashboards (branch tc/r2-dash, worktree tc-r2-dash, dev instance r2dash 3113/8113)

Spec: /root/projects/tc-redesign-research/round2/{ROUND2,RULES,builder-templates-themes}.md.
Shots: /root/projects/tc-redesign-research/round2/candidate/dash/.

## Golden gate (nothing existing may change)
- `scripts/dev/dash-golden.mjs capture <port> <dir>`: one dashboard per shipped template (seed-dashboards.mjs),
  every visible page, + seeded v1 dashboard (owner view + public link), 1440, light + dark, full page.
- `scripts/dev/dash-golden.mjs compare <base1,base2,...> <cand>`: exact RGBA match against any baseline sample.
- Baseline: candidate/dash/golden/base, base2, base3 (captured 2026-10-27 from 01a2a25 before any change).
  Two of today's views settle in one of two states (donut sizing on the public link; dev-server timing),
  hence several samples. Removed bad samples: base{,2}/tpl-portfolio-1440-dark (skeleton), base3/tpl-client-report-p3-1440-dark (blank canvas).
- Demo data is per UTC day: re-shoot the baseline from a pristine worktree if the day changes.

## Log
- b5dcd27 gate script. f046e02 16 templates (templates.round2.ts appended; the 8 shipped build as before),
  theme/brand/cover model (types + schema + publicDoc), themes.ts, brand.ts (deriveBrand), clipboard.ts,
  cfRules.ts, dashboard-themes.css (scoped [data-dash-theme]), gallery (search, categories, New, themed
  thumbnails, theme choice on create), previews for the 16 (the 8 old previews kept byte-identical).
- f3e3f43 theme wiring: owner view = themed panel (shell="panel", app mode), share link/embed = themed page,
  editor canvas = live theme preview (Light/Dark toggle); cover page; credits; dark logo; branded PDF
  (lib/builder/reportPdf.ts, browser only); TV mode (TvMode.tsx, ?tv=1, Present); widget filters UI
  (WidgetFilters.tsx), table rules (RulesEditor.tsx + TableView), scorecard targets, copy/paste.
- Settings tabs General | Appearance; toolbar Theme button; TV rows fit the screen height.

## How the default look stays identical
- dashThemeAttrs()/dashRootProps() return null for a doc without a theme (or TrafficClaw + default options,
  no brand colour): no attributes are spread, no wrapper is added, grid stays 32/16.
- Card markers are data attributes only (data-dash-widget); conditional-format classes only when rules exist;
  target bar only when a target exists; cover/credits only when set.

## Dev data (instance r2dash)
- /root/.trafficclaw-dev/r2dash/dashboards-r2.json: one dashboard per new template (shared) + site overview in
  each theme. Seeded with the scratch script seed-r2.mjs (POST /api/dashboards with templateId/themeId).
