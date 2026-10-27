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
