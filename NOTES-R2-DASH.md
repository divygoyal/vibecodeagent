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
- f3c4c01 variables ('variable' control, {{var:id}} in widget filters/text, URL f.<id>, editor section, chip;
  Brand vs non-brand uses it) and click to filter (bars, table rows, map countries; URL x=dim:value; chip bar).
- 184b1f9 inline editor query route accepts variable controls (strict schema); dash patterns per series in
  High contrast / Paper (Recharts className tc-series-N, CSS only under [data-dash-palette="contrast"]).
- 55d3743 lint clean on all changed files.

## Checks
- tsc clean; npm test 74/74 (tests/dashboardRound2.test.mjs 13 tests); tsx tests/builder/query.test.ts 11/11
  (all 24 templates evaluate on demo data); check:rsc 0 errors; eslint clean on changed files.

## Left / not done
- chartTint (brand colour on single-series charts) and per-series point markers (only dash patterns).
- Calculated metrics, scheduled email, server PDF (owner: no headless browser), annotations, widget library.

## PAUSED 2026-10-27 ~08:10 UTC (coordinator: usage limit)
Done: everything above is committed (gate, 16 templates + gallery, 8 themes + picker + live preview, brand kit,
cover, branded PDF, TV mode, widget filters UI, table rules, scorecard targets, copy/paste, variables,
click to filter). Last full gate (cand1, before the variables/lint commits): 28/28 identical after
re-shooting 2 known-flaky shots (donut sizing race, also seen in the baseline samples).
Next on resume:
1. up.sh r2dash 3113 8113 (slots are often full: loop until free), login.mjs.
2. Re-run the full gate: dash-golden.mjs capture 3113 golden/cand2, compare base,base2,base3 cand2; re-shoot
   flaky shots with --only.
3. seed-tour.mjs (scratchpad) for the feature tour; screenshots via scratchpad mkjobs.py (templates, themes,
   baseline, features) + bshot.mjs into round2/candidate/dash/; sheet.py contact sheets.
4. check-mobile.mjs on dashboard routes (--paths list, gallery, themed views, public client report); down.sh.
5. Report.

## Resumed 2026-10-27 ~09:55 UTC (one dev-slot session, then down.sh)
- Gate cand2 (head f4e49b8+): 28/28 identical vs base samples (2 shots taken under parallel screenshot load re-shot with --only).
- Mobile (390, light+dark, 7 dashboard routes): overflow 0, error 0; textSpill 2 (client report), smallTargets 4 (executive view).
- Shots in round2/candidate/dash/: critique-* (judge equivalents; 390 list shots missing), templates/, themes/, features/, sheet-*.png.
  themes/site-overview-studio-1440-light.png caught a loading frame (re-shoot next session).

## Judge round 1 fixes (2026-10-27 ~11:00 UTC)
- AI traffic and Studio light were capture-timing blanks (both render; shots now wait for the grid). bshot waits for readiness.
- Collisions: card padding fixed at 16 px in every density (footnotes no longer overprint x labels); goal bar spacing.
- Client report: no empty bullets for viewers, prompts in the template, no repeated intro title, split cover, cover title wraps at 390.
- Template tables: narrow dimension column + one change chip at half width (wide tables with >5 metrics: two); columns never hidden
  (hiding broke row thresholds). Local SEO relaid out, filtered/thresholded empty tables explain themselves.
- Themes: Executive (serif numbers, navy card tops, no grid), Paper (small caps, no fills), High contrast (2 px black, solid chips).
- TV page 2 and International: map without its duplicate list. List card: "1 view", single-line meta.
- All 16 templates re-rendered (templates/*-1440-light.png + 4 at 390). Gate cand3: 28/28 identical (re-shot 2 known donut/blank races).
- Still pre-existing (cannot change without breaking the gate): "– –" for missing values, geo legend over the list in narrow maps,
  donut sizing race.
