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

## New pages
- `/security` "Security and data" (app/(marketing)/security): summary tiles, what we read (the 3 scopes from lib/auth.ts, plus
  offline access), what we store with why and how long, how tokens are protected (Fernet for Google tokens, SHA-256 hashes for
  MCP tokens and API keys, 1 h access / 30-day rolling refresh / 180-day cap, max 5 keys), what we never do, who else sees data
  (Google, Gemini for Ask, the connected AI app, Dodo, GA/Clarity/Tawk on our own site), revoke steps (Google permissions,
  Settings › Google, Connect AI, share dialog, leaderboard), deletion (Settings › Danger zone or privacy@, within 30 days; export
  first). Linked from the hero trust line, the home FAQ, the pricing trust line, the footer (Company), sitemap and llms.txt.
- `/changelog` (app/(marketing)/changelog): two releases dated 2026-10-27 (the redesign 4b1db9c and the same-morning follow-ups
  01a2a25/05bf31f/QA fixes), grouped by feature, written from `git log 1b62be9..tc/integrate`; data in
  components/marketing/changelog/entries.ts, which also feeds the home "What's new" row. Footer (Product), sitemap, llms.txt.
- Both have OG images (components/marketing/site/og).

## Pricing and demo (copy polish, no pricing facts changed)
- Pricing: "RECOMMENDED" caps badge → sentence-case "Recommended" pill (critique 2.9 rule 1); feature rows name the site pages
  like the app ("Traffic, Search, What to fix next and Audit"); trust line under the plans ("Every plan: read-only Google access ·
  nothing to install · no site limit", first item links /security); sponsor link → /leaderboard/advertise (no redirect hop).
- Demo: banner sticks under the header (teardown-b #21), one line on phones ("Live demo · sample data" + "Connect your sites"),
  names the 11 sample sites on wider screens; /demo now ends with a Connect Google CTA ("See your own sites like this.").
- FinalCta default line: "Read-only, nothing to install, no card, no site limit."
- Footer trademark line also covers ChatGPT, Claude and Cursor (named in the new Works-with strip).

## Brand
- Works-with strip uses plain product names only, no logos or marks: Google's, OpenAI's and Anthropic's brand rules restrict logo
  use, and plain names cannot be "modified logos". Footer says the names belong to their owners and TrafficClaw is not affiliated.

## [confirm] for the owner (left out of the pages until confirmed)
- [confirm] Proof thresholds: 25 listed sites and 10 owner-verified sites. Change `PROOF_MIN` in proof.ts.
- [confirm] Which ChatGPT and Claude plans can add a custom connector (teardown-b FAQ #5). Not on the page.
- [confirm] A dedicated security contact (security@…). The page uses privacy@trafficclaw.com and the contact form.
- [confirm] Hosting provider and data location (country/region). Not on the page.
- [confirm] Whether removing access in Google alone should count as a deletion request. The privacy policy says revoking or
  emailing both lead to deletion within 30 days; no code reacts to a Google revoke, so /security tells people to use Settings ›
  Danger zone or email for deletion, and says revoking stops our reads.

## Findings for the owner (not changed here, outside WS4)
- **Google refresh token reaches the browser.** `lib/auth.ts` `session()` copies `googleAccessToken`, `googleRefreshToken`,
  `accessToken` and `refreshToken` onto `session.user`, so `GET /api/auth/session` (and `useSession()`) returns them to any
  same-origin script. Several server routes already read them from the JWT with `getToken()`; recommend moving the rest
  there and dropping the tokens from the session payload (check client uses first). /security makes no claim that tokens never reach the browser.
- **Admin user delete does not cover every table.** `DELETE /api/users/{id}` (admin/main.py) removes the container, OAuth tokens,
  MCP rows, portfolio rows, action states and the user row, but not dashboards (+versions, shares, embed tokens), chat threads /
  messages / facts / embeddings, annotations, goals, funnels, leaderboard entries / profiles / daily / audience, weekly digests or
  support messages. Deletion is a manual request today (Settings › Danger zone → support inbox), so the admin must clear the rest
  by hand to meet the 30-day promise in the privacy policy and on /security.
- Tawk.to is loaded only inside the app (AppShell) in this branch; WS1 moves it. /security just says the support chat runs on Tawk.to.
