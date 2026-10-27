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

## 4. Bug: "Users (sum of sites)" skeleton forever
- Evidence (preview web.log + admin.db, read-only): `[portfolio-sync] reason=page … due=0` every ~2 s, no
  `[portfolio-users]` line ever, `portfolio_range_totals` empty; 3 GSC assets `siteUnverifiedUser` /
  `no_access`, sync_started_at ~19 h old.
- Cause: `needsSync()` counted those sites as due after 30 min (isDue on `no_access`), `runSync()` skips
  unverified sites, so every poll started an empty sync -> `syncing` always true -> `usersPending` always true
  and `startRangeUsers` (waits for `!syncing`) never ran -> tile `loading` forever.
- Fix: one rule `dueAssets()` (isSyncable + isDue) for both. Range-users runs back off 5 min after any failure,
  also a thrown 401 (it used to restart on every poll). The tile never shows a skeleton any more: summed daily
  users with "≈" and a hover note until exact users land (`usersTotalTile` in lib/portfolio/view.ts).
- Test: `tests/portfolioUsersTotal.test.mjs` (3 of 4 fail on the old code).

## 5. Link pickers on empty Search Console / GA4 cards
- `components/site/LinkSource.tsx` replaces the body of `SourceMissing` (Overview summary cards, Traffic and
  Search pages): picker + Link + Check again + guidance. Card ids `link-gsc` / `link-ga4` (the GSC-only
  Overview's "Link Analytics" hint now jumps to `#link-ga4` instead of Settings, which has no picker).
- Picker lists every GSC site (Domain and URL prefix; unverified shown disabled; "linked to X" note) or every GA4
  property from the live directory, ranked by `lib/sites/linkCandidates.ts` (stream host covered by the site, then
  name match, then A-Z; a real match is preselected). Test `tests/linkCandidates.test.mjs`.
- Save = the portfolio pairing dialog's call: `PATCH /api/portfolio/assets/ga4:<prop> {gscSite}` or
  `gsc:<site> {ga4Property}` -> `setPairingOverride` (portfolio_assets). The route now stores the current Google
  inventory once (`repairPairs`) when the site or the target is not in the store yet. After saving: directory,
  pairs, store directory and portfolio keys revalidate; a GA4-only page (`ga4-123`) follows its new route key.
- Check again = `GET /api/sites/directory?refresh=1` (existing cache bust; now also `invalidateInventory(id)`,
  fetchInventory itself unchanged) + a background `POST /api/portfolio/sync {}` so the store learns new sites.
- `DirectoryProperty.host` (stream host from the store) added in directoryServer for ranking.
- Guidance: "Add it in Search Console" (welcome URL) + 2 verify steps / "Create a GA4 property" + 2 steps;
  "In another Google account?": add <session email> (Search Console → Settings → Users and permissions /
  GA Admin → Property access management) or connect another Google account (/dashboard/settings?tab=google,
  where tc/b3-accounts adds the button).
