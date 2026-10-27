# Round 2 · WS2 site pages (tc/r2-site, worktree tc-r2-site, dev 3112/8112, instance `r2site`)

Brief: /root/projects/tc-redesign-research/round2/ROUND2.md (WS2), RULES.md, teardown-a/b.md, design-critique.md.
Owns: components/site/**, app/(dashboard)/dashboard/s/**, app/api/site/**, new files under components/charts/.
Data: GA4 Data API + Search Console API only (no tracker). Shots for the blind judge: round2/candidate/site/.

## Pure modules (components/site/lib, tests in web/tests/siteRound2.test.mjs)
- sources.ts: one mapping for GA4 source names + favicon domains ("(direct)" -> Direct, google -> Google, t.co -> X ...).
- filters.ts: click-to-filter keys (channel, source, country, city, device, browser, os, language, path, landing),
  URL <-> API params (`f=<key>:<value>`), one GA4 dimensionFilter (EXACT, AND).
- intervals.ts: day/week/month buckets (ISO weeks, Monday first; first/last bucket can be partial), GSC roll-up.
- findings.ts: rule-based one-line findings (trend + driver, busiest day, peak hours, overlay, CTR benchmark, geo).
- googleUpdates.ts: curated Google core/spam/helpful updates 2023-2026 from the Search Status Dashboard (source in comments).

## Log
- 40be485 pure modules + tests (siteRound2.test.mjs).
- 6c5a284 API: /api/site/ga4 takes `f=<key>:<value>` filters (summary, breakdowns, heatmap, pageTrends), `interval=day|week|month`
  (summary buckets: isoYearIsoWeek / yearMonth, named by the first day inside the range), new reports `heatmap` (dayOfWeek x hour,
  property time zone from GA4 metadata), `pageTrends` (top N pages with title, ±% and ≤14 trend bars; plus up to 300 titles),
  `organic` (google / organic sessions per day, for the GSC overlay); countries breakdown adds countryId; realtime adds countryId and
  `live` (aggregated minute x place x device x page rows; null if GA4 refuses). New charts (new files only): GeoChoropleth (reuses
  the builder's world-atlas file, adds click/selection/markers/responsive), WeekHourHeatmap, DualAxisChart, CtrPositionChart,
  TrendBars, chartScales, useElementWidth.
- ebf50f9 Overview: tabbed Sources / Pages / Search cards, map card, Search clicks vs organic visits (dual axis), findings, interval.
- 7b9ca12 Traffic: SiteFilterProvider + FilterBar (URL chips), tabbed cards, Locations map, Devices card, Peak hours; Sources tab
  favicons + row filters; Audience map; Realtime map + "Recent activity" (aggregated, labelled) + Right now tabs; Search CTR vs
  position card; period stepper in SiteHeader.
- 64a6a0b Pages + Traffic > Pages: titles over paths, trend bars (top 25), delta chips.

## Decisions
- No code copied from any third party (Umami/bklit ideas only, own implementation), so no NOTICE file is needed.
  The world-atlas data already ships with its licence in web/public/geo/.
- Filters are GA4-only and apply on Traffic tabs Overview, Pages, Sources, Audience, Events. Realtime, Funnels, Journeys and
  Retention say "Filters (not used on this tab)". Outside Traffic a row click opens Traffic with that filter.
- Page filter key is `path` (not `page`: the Pages screen uses ?page= for its drawer).
- Overlay chart compares GSC clicks with GA4 google / organic sessions (not all Organic Search) over the GSC days.
- Notes are scoped to the GA4 property id (else the GSC site URL); Google updates are drawn at their rollout start.
- Interval is one `?interval=` per page; week needs 14+ days, month 60+.

## Status at PAUSE (2026-10-27 ~08:00 UTC)
- Done: all 12 WS2 items built and committed; tsc, eslint (changed files), npm test (71 + siteRound2), check:rsc pass.
- Screens taken once into round2/candidate/site/ (20 files, same names as critique-site-*); they predate b7c624b
  (phone header fixes, eager favicons) and the heatmap hour-label fix -> RETAKE all 20 after resume.
- Mobile check (partial, checks/mobile-r2site.md): 0 overflow/offscreen/clipped; heatmap hour labels spilled (fixed in WIP
  commit, re-check); "loading" hits were slow dev server under low RAM (re-check Traffic > Pages alone).
- Next: up.sh r2site 3112 8112 -> login -> check-mobile for the 12 site paths (in parts) -> check-scenarios for
  ga4only,gsconly,f403,f429,f500,fempty on /dashboard/s/** -> retake 20 shots (scratchpad shots.sh) -> down.sh -> report.
