# Marketing notes (tc/marketing, worktree tc-marketing, dev ports 3107/8107, instance `marketing`)

Specs: /root/projects/tc-redesign-research/{PRODUCT.md "Positioning", "Marketing site", "Remove"; DESIGN.md 2, 3, 4.4, 5.16, 5.17, 5.21}.
Screenshots: /root/projects/tc-redesign-research/shots/marketing/.

## Owns
`web/src/app/(marketing)/**` except `leaderboard/**`, `sponsor/**`, `ai/**`; marketing layout/header/footer,
opengraph images, `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt`. Marketing blocks live in
`web/src/components/marketing/**` (site/, home/, demo/, pricing/, tools/).

## Layout of the code
- `components/marketing/site/`: MarketingHeader (nav from xl, Drawer menu below), MarketingFooter, BrandMark (pine mark,
  DESIGN 2.8 recommendation), ConnectGoogleButton (Google sign-in; honours `?callbackUrl=` on the page; signed in -> "Open
  dashboard"), Section/SectionHeading/BrowserFrame, Faq (+FAQPage JSON-LD), FinalCta, ContentPage/Prose, CopyField,
  SiteIcon (letter tile for `.example` hosts, so demo pages make no favicon requests), SignInNotice (`?error=`/`?callbackUrl=`
  on `/`, which is NextAuth's sign-in page), og.tsx (shared OG card).
- `components/marketing/demo/`: `data.ts` server-only adapter over `lib/demo` (portfolio for 7d/28d/3m/12m + per-site sample
  dashboard, memoised 10 min, deterministic per UTC day, never calls Google); `types.ts` = structural subset of tc/portfolio's
  `PortfolioResponse` (same field names) -> swap `buildMarketingDemoPortfolio` for `buildDemoPortfolio()` from
  `lib/portfolio/demo.ts` once tc/portfolio is merged. UI: DemoSiteCard (DESIGN 3.25), PortfolioTotals (KpiStrip + chart),
  DemoPortfolioView, DemoSiteDashboardView, DemoBanner.
- `lib/plans.ts`: FREE_START_CREDITS (=5, mirrors admin/models.py User.credits default, one time), PAID_PLANS (Growth $19/50,
  Pro $29/100, same Dodo product ids as /dashboard/plan and the webhook), `dodoCheckoutUrl()` (same URL as /dashboard/plan).

## Decisions
- Public pages always light: layout root `data-theme="light"` + `.tc-root`; body text 16/24.
- Home is ISR (`revalidate = 3600`); hero cards and dashboard visual are real components fed by the demo generator.
- Live leaderboard preview is client-fetched from `/api/leaderboard?tab=top&range=28d&sort=traffic&page_size=5`, accepts
  both the v3 shape (`rows`) and the legacy one (`entries`); the whole section is absent when there are no rows.
- /demo = portfolio (range, sort, search, Search Console/Analytics card view); /demo/[slug] = sample dashboard per demo
  site (11 static params, `dynamicParams = false`, noindex).
- Pricing: signed in with an email -> `<a target=_blank>` to the Dodo checkout URL for the product id (identical to
  /dashboard/plan); signed out -> Google sign-in with callback `/dashboard/plan` (as before). Buttons carry `data-plan`.
- Free Ask messages: the backend grants 5 once (no monthly free reset exists), so copy says "5 Ask messages to start".
- /features -> /#product via `permanentRedirect` in the page (until next.config has it).
- Foundation (85bddd8) removed /globe, /x, /reddit, demo/telegram*, share-popup-preview with redirects; merged, no duplicates.

## Done
- 0e9f08a shell, home, demo, pricing, content pages, tools restyle, removals, OG, sitemap, robots, llms.txt.
- 7b42653 merge tc/foundation (kept marketing versions of layout/home/pricing/sitemap/robots).
- 03fe2aa, 2b9867f small fixes (header nav from xl, variable names, aria labels). tsc clean, eslint clean on owned files.

## Verification status
- Not yet run: dev server (both slots busy at 14:5x UTC; `TC_SLOT_WAIT_MIN=60 scripts/dev/up.sh marketing 3107 8107` queued).
- Ready to run once up: scratchpad scripts mshots.mjs (1280 + 390 full-page shots + console/network report) and
  mflows.mjs (contact POST, pricing signed-out -> Google sign-in, signed-in -> Dodo checkout popup), then crawl.mjs
  `--only` the marketing routes. Shots go to /root/projects/tc-redesign-research/shots/marketing/.

## Left / for the report
- next.config redirects wanted: `/features` -> `/#product` (308); `/demo/telegram*` -> `/demo` (foundation sends them to `/`).
- Root `app/layout.tsx` (not mine) still has the old default title/description, dark `theme-color`, and a JSON-LD
  description "AI-powered SEO & analytics platform"; worth updating to the new positioning.
