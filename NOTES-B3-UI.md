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
