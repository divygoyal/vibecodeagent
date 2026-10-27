# Round 2 · WS4 Homepage and trust (tc/r2-home, worktree tc-r2-home, dev instance r2home 3114/8114)

Specs: /root/projects/tc-redesign-research/round2/{ROUND2.md WS4, RULES.md, teardown-b.md §13, teardown-a.md, design-critique.md §4, §15}.
Screenshots for the blind judge: /root/projects/tc-redesign-research/round2/candidate/home/cand_*.png (names match round2/baseline/live_*.png).

## Owns
`app/(marketing)/**` except `leaderboard/**` (WS5) and `ai/**` (unchanged), `components/marketing/**`, sitemap and llms.txt
entries for /security and /changelog, the footer.

## Owner decisions applied
- H1 kept: "All your sites. One screen. Free."
- Home demo keeps sample data (`.example` sites from lib/demo); nothing from trafficclaw.com's own Google data.
- No invented stats, logos or testimonials. Social proof = live counts from `/api/leaderboard` (see below), hidden under a threshold.

## What changed (home)
- Hero: the static pill became a link to /ai ("New · Ask ChatGPT or Claude about your traffic"); tighter subhead (one promise:
  every site on one screen, what changed, what to fix next); trust line adds "Nothing to install" and "Read-only access" links to
  /security; a "Works with" strip: Google Analytics 4, Search Console, ChatGPT, Claude, Cursor as plain text (no logos, see Brand).
- "Four things you get, all free" became "What you get, free": four outcome-led cards (Every site, one glance / Dashboards without
  the setup / Proof, not screenshots / Ask the AI you already use), each with its own icon and its feature name as a label, plus a
  wide fifth card "What to fix next" with the Actions page in miniature.
- The Actions preview is computed, not typed: `buildMarketingDemoActions()` (components/marketing/demo/data.ts) runs the app's own
  rules (components/site/lib/rules.ts: striking distance + low CTR, ranked like app/api/site/_lib/actions.ts) on the demo generator.
  For acmeanalytics.example it gives exactly the app's top cards (+7,667 / +2,858 / +1,715 clicks a month).
- How it works: "Up and running in three steps" with dark numbered circles became "From Google sign-in to your first fix": three
  steps, each with what you actually see (the two read-only permissions, three portfolio rows, the top task / share / ask).
- "What's new" row (three dated highlights from the changelog) above the FAQ.
- FAQ: 7 → 12 questions (new: Looker Studio, GA4-only or GSC-only, numbers that differ, data freshness, client sites).
- Section eyebrows are plain pine text instead of grey pills (critique #15, high confidence); applies to every SectionHeading
  (home, pricing, tools). /ai does not use SectionHeading, so it is unchanged.

## Social proof (leaderboard section)
- `components/marketing/home/proof.ts`: `fetchProofCounts()` reads `/api/leaderboard?tab=categories&page_size=100` (all pages, max
  10): listed = board `total`, verified = rows with `verification.level === 'owner'`. `proofItems()` shows each figure only at or
  above `PROOF_MIN` = 25 listed sites / 10 owner-verified sites.
- Live on 2026-10-27: 6 listed, 0 owner-verified (all 6 rank on the GA4 "grace" rule) → nothing shows, by design.

## [confirm] for the owner (left out of the pages until confirmed)
- [confirm] Proof thresholds: 25 listed sites and 10 owner-verified sites. Change `PROOF_MIN` in proof.ts.
- [confirm] Which ChatGPT and Claude plans can add a custom connector (teardown-b FAQ #5). Not on the page.

## Findings for the owner (not changed here)
(filled in as the security page is written)
