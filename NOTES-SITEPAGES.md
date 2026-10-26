# Site pages notes (tc/sitepages, worktree tc-sitepages, dev 3108/8108, instance `sitepages`)

Specs: /root/projects/tc-redesign-research/{DESIGN,PRODUCT}.md (4.2–4.3, 5.4–5.8, 6). Shots go to
/root/projects/tc-redesign-research/shots/sitepages/.

## Plan (route map)
- `/dashboard/s/[host]` Overview: GA4 column (tiles + traffic chart) | GSC column (tiles + search chart),
  top pages (merged), channels, top queries, countries, devices, alerts, top actions.
- `/dashboard/s/[host]/traffic?tab=overview|pages|sources|audience|realtime|events|funnels|journeys|retention`
  (legacy tab keys mapped: ''->overview, goals->events, sessions->sources, performance->actions/audit).
- `/dashboard/s/[host]/search?tab=performance|opportunities|cannibalization|movers|indexing`
  (+ `dim=queries|pages|countries|devices|appearance|dates` inside Performance; DESIGN's `?tab=queries` etc map to it).
- `/dashboard/s/[host]/pages?segment=&page=` merged GA4+GSC table + drawer.
- `/dashboard/s/[host]/actions?status=open|done|dismissed` ranked tasks; `/dashboard/s/[host]/actions/audit` Audit.

## Data layer (done, 1st commit)
- `web/src/app/api/site/_lib/*`: context (session + Google token), google.ts (cached fetch per
  user+asset+request, max 6 concurrent per asset, errors not cached), params, ga4Reports, gscReports, actions.
- `GET /api/site/ga4?property=&report=summary|channels|sources|referrers|pages|landing|countries|cities|languages|devices|browsers|os|events|newReturning|realtime|retention&start&end[&cmpStart&cmpEnd][&mode]`
  Each = 1 GA4 runReport with cur+cmp ranges in one request (summary = 3: totals, daily, AI sessions).
- `GET /api/site/gsc?site=&report=summary|queries|pages|countries|devices|appearance|opportunities|cannibalization|decay|detail|sitemaps|inspect`
- `GET /api/site/actions?site=&property=&label=&start..&tStart..` ranked tasks (cached 5 min).
- `GET|POST /api/site/actions/state` done/dismissed per user -> admin `/api/site-actions/states`
  (admin/site_actions_api.py, migration 023_add_site_action_states.sql, table created on first use;
  main.py: 2 lines before Health Check). Not wired into DELETE user (delete_user_site_action_rows exists).
- `GET|POST /api/site/audit?url=` audit of the user's own page, cached 6 h; demo mode answers *.example.
- Shared pure code in `web/src/components/site/lib/` (types, rules, actionText).

## Dropped / merged (so far, decided)
- Journeys: the old /api/analytics/journeys invents paths (synthesized from landing/exit pages). Keep real
  landing/exit data; drop the fake Sankey.
- Retention: old route returned MOCK cohorts on any error; new report is cached and honest (empty/error).

## Next
- components/site hooks + tiles; Overview; Traffic; Search; Pages; Actions; Audit; redirects; shots; crawl.
