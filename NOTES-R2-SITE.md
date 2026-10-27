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
