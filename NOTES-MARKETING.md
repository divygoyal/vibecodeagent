# Marketing notes (tc/marketing, worktree tc-marketing, dev ports 3107/8107, instance `marketing`)

Specs: /root/projects/tc-redesign-research/{PRODUCT.md "Positioning", "Marketing site", "Remove"; DESIGN.md 2, 3, 4.4, 5.16, 5.17, 5.21}.
Screenshots: /root/projects/tc-redesign-research/shots/marketing/.

## Owns
`web/src/app/(marketing)/**` except `leaderboard/**`, `sponsor/**`, `ai/**`; marketing layout/header/footer,
opengraph images, `app/sitemap.ts`, `app/robots.ts`, `app/llms.txt`. Marketing blocks live in
`web/src/components/marketing/**`.

## Plan
1. Layout: header (Product, Demo, Leaderboard, ChatGPT & Claude -> /ai, Free tools, Pricing; Sign in; Connect Google, free), footer, mobile menu.
2. Home: hero + real portfolio preview from demo data, 4 pillars, live leaderboard preview (API, nothing when empty), MCP, how it works, why free, FAQ, CTA.
3. /demo (portfolio) + /demo/[key] (sample dashboard per demo site), read only, never calls Google.
4. /pricing: Free = everything + start credits; Growth/Pro only add Ask messages; same Dodo product IDs and checkout URL.
5. Restyle about/contact/privacy/terms/tools; /features -> /#product.
6. Remove /globe, /x, /reddit, demo/telegram*, share-popup-preview (+ dead marketing components).
7. SEO: metadata + OG per page, sitemap, robots, llms.txt.

## Decisions
(filled in as work lands)

## Done
(commits listed as they land)

## Left / for the report
