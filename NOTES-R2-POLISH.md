# Round 2 · WS1 Professional polish (tc/r2-polish, worktree tc-r2-polish, dev instance r2polish 3111/8111)

Inputs: /root/projects/tc-redesign-research/round2/{ROUND2,RULES,design-critique}.md.
Candidate screenshots: /root/projects/tc-redesign-research/round2/candidate/polish/ (same names as round2/shots/critique-*).

## Done (commits on tc/r2-polish)

1. **Tawk chat bubble** (critique #1, D4) · `components/ui/chatWidget.ts` is the only loader, mounted by
   `components/shell/ChatWidget.tsx` in app/providers.tsx. Bubble on marketing pages and /dashboard/support at
   >= 768px only; never on /dashboard/** (except Support), /share, /embed, /view, /admin, /superadmin, /oauth, /mcp,
   /preview-private, never on phones. `openLiveChat()` (Support "Chat with us" card) opens it anywhere; it stays
   while a chat is open/ongoing. No auto-greeting: `#message-preview` and the unread badge stay hidden until the
   visitor opened the chat (globals.css + a style tag in Tawk's same-origin launcher iframe). Dark app theme: a
   hairline ring on the launcher. Modal/Drawer/nav drawer hide it through the same module. tests/chatWidget.test.mjs.
   Optional owner action: also switch off the greeting trigger in the Tawk dashboard.
2. **Charts** (#2, 2.3) · `components/charts/axis.ts`: `niceAxis` (0/5K/10K, durations 30 s/1 m/5 m, positions
   from 1), `dateTicks` (anchored on the last day: daily ≤14 d, weekly/fortnightly ≤93 d, month starts beyond,
   thinned to plot width), shared `AXIS_TICK`, `AXIS_LINE`, `GRID_STROKE`, `CURSOR`. TimeSeriesChart uses them
   (no minTickGap / preserveStartEnd). tests/chartAxis.test.mjs. `components/charts/style.ts`: `heatbarClass`
   (Search Console lists blue, Analytics lists indigo) used by BarList and Table heat bars; `fmtShare` (whole %,
   `<1%`). BarList rows 32px.
3. **Deltas** (#3) · MetricDelta is one text style (chip variant renders the same, deprecated); renders nothing
   for no data / previous 0 / unchanged position. StatCard: delta inline, "None in the previous …" when there was
   nothing. KpiStrip tiles are two lines (label; value + delta), tabular figures. Portfolio "Users (sum of sites)"
   is "Users" with the note as a hint.
4. **One Ask AI** (#7) · PageHeader detects an Ask action in its actions (AskButton props or a /dashboard/ask
   link) and the topbar hides its own Ask button (ShellContext.pageAsk).
5. **Phones** (#8) · Table renders two-line list rows below 768px (title + main number, then labelled numbers,
   Sort select); column roles via `mobile`/`mobileLabel`, opt out with `mobileList={false}`. PageHeader actions
   wrap (date range first), badges hidden < 640px. Ask heading puts the domain on its own line.
   Underline tabs text-only with a right-edge fade when they scroll.
6. **Glitch sweep** (#10) · app-wide lucide stroke 1.75 (globals.css, `.stroke-keep` opt-out), icon sizes on the
   scale, favicon/avatar fallback letters >= 11px, 6px favicon tiles, sort arrows only on the sorted column/hover,
   percents always 1 decimal outside tiles (23.0%), durations zero-padded (2m 05s), "ONE" → "one",
   ChartCard no longer clips nested footnotes (no overflow-hidden; `bare` prop), Connect AI tool results in words.
7. **Dark mode** (#14, D1–D3) · `--tc-brand` pine-600 with white text (was mint pine-300), heat bars 12% (was 18%),
   area fill 12% (light 10%, was 22%/16%), sparklines their own `--tc-spark-fill-top` (light 16% unchanged, dark 8%).
8. **Density / badges** (#4, #5, 2.4) · Badge sentence case with a soft fill (no outlined caps); portfolio cards
   drop the GA4 badge, hide the property badge on phones/narrow cards; Connect AI Usage card no longer stretches;
   Settings/Plan/Docs/Support left-aligned with the other pages; skeletons wait 200 ms and stay flat for 1 s;
   no "Pick a site" flash in the sidebar while sites load; ChartCard footnotes align at the bottom.

## Verification
- Tawk rules checked in the browser against a local stub of the Tawk script (Cloudflare answers 403 to
  HeadlessChrome, so the real widget cannot load in Playwright): bubble on / and /dashboard/support at 1440,
  none on /dashboard and on phones; greeting card and badge hidden until "Chat with us"; ring in dark; on a
  phone "Chat with us" loads and opens it.
- Candidate screenshots: the r2polish instance runs on a copy of the integrate instance's dev admin.db (the one
  the baseline shots were taken from: same dashboards, MCP grants, leaderboard), so the pairs show the same data.
  The instance's own seed is kept at /root/.trafficclaw-dev/r2polish/admin.db.own-seed.

## Checks
- tsc, npm test (72), check:rsc: clean (see the end of this file for the last run).

## For other workstreams (files I do not own)
- **WS2 (site pages)**: drop the Domain/GA4 badges from `SiteHeader` (critique #4); `!border-0 !p-0 !shadow-none`
  ChartCards in PerformanceTab/OverviewTab/GoalsFunnels can become `<ChartCard bare>`; `items-start` (or merge
  Alerts into "What to fix next") in SiteOverview's Alerts row and other mixed grids (#5); 18px section headings
  (#11); the double space in "20  users right now" (traffic header); action cards → list rows (#6). Header Ask
  buttons may stay: the topbar hides its own when a header has one (if you remove them, the topbar one returns).
- **WS3 (dashboards)**: `BuilderTimeSeries` and `widgets/Charts.tsx` can use `niceAxis` / `dateTicks` /
  `AXIS_TICK` from '@/components/charts' (critique #2). One date control on the dashboard view (Controls.tsx: the
  saved "Last 30 days" preset vs the 7d/28d/3m segment). "Older dashboard" pill → one-time toast; "Public link"
  pill → muted globe + "Public" (D8). Golden screenshots: WS1 intentionally changes shared pixels (delta chip →
  text, Badge, Table phone list, tokens), so baseline the golden set after WS1 merges. `TableView` can pass
  `mobileList={false}` if the dashboard table should keep scrolling on phones.
- **WS5 (leaderboard)**: `PctDelta` goes through MetricDelta, so the profile's chip already renders as text; its
  grey "new" (pct null) is the last odd one out (critique #3: say "No data before …" in the comparison line).
  Favicon letter tiles are now >= 11px.
- **WS4 (marketing)**: the Tawk bubble now shows on marketing pages at desktop width (it did not before); Badge is
  sentence case everywhere.

## Final status (2026-10-27 10:02 UTC)
- Candidate shots: all 52 (13 routes x 1440/390 x light/dark) in round2/candidate/polish/, same names as
  round2/shots/critique-*. Taken on a copy of the integrate dev DB (the baseline's data).
- check-mobile at 390 (light) on the portfolio, site pages, settings, ask, connect-ai, support, plan and the
  legacy /dashboard/analytics/* redirects: error 0, overflow 0, offscreen 0, clipped 0, smallTargets 0, badText 0.
  tabbar=2 / loading=12 come from the traffic tabs reached through the legacy /dashboard/analytics/sessions and
  /performance redirects (WS2 area). Report: round2/candidate/polish-mobile/mobile-r2polish.md.
- The Devices donut legend on the dashboard view follows the builder's own width rule (WS3); WS1 did not change Donut layout.
- Server down, web/.next removed.

## Judge fixes (2026-10-27, VERDICT 36 W / 6 L / 10 T, ship-with-fixes)
- Re-captured app-leaderboard-1440-dark, site-traffic-390-light, site-pages-390-light: the preview, the traffic
  data and the 46-page list all render; the losses were capture timing, not app bugs.
- Phone dashboard table widget: `Table mobileList="compact"` (one meta line, same row height) and TableView sizes
  the page to the cell and always paginates on phones, so no row is cut and the pager shows.
- PageHeader `keepBadgesOnPhone` (Connect AI "4 connected" back on phones).
- Portfolio: GA4 badge back on Analytics-only cards (also on phones); "Users (sum of sites)" label back.
- Sort arrows faint on every sortable column again; Settings centred again with tab icons at md+ (`Tabs showIcons`).
- Re-shot: leaderboard 1440, traffic/pages 390 light, dashboard-view 390, dashboard-edit 1440, connect-ai 390,
  portfolio and settings (all 4 variants).
