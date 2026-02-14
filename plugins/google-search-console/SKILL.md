---
name: google-search-console
description: Access Google Search Console data (list sites, search performance, index coverage) for the connected user.
---

# Google Search Console

Use this skill to fetch search performance data, index coverage, and list verified sites from the user's Google Search Console.

## Tools

### List Sites
List all verified sites in the user's Search Console account.
`node /data/workspace/plugins/google-search-console/index.js list-sites`

### Get Performance
Get search performance report (clicks, impressions, CTR, position) for a site.
Arguments:
- `siteUrl`: The site URL as shown in Search Console (e.g., 'sc-domain:example.com' or 'https://example.com/').
- `startDate` (optional): Start date (YYYY-MM-DD). Defaults to 28 days ago.
- `endDate` (optional): End date (YYYY-MM-DD). Defaults to today.

`node /data/workspace/plugins/google-search-console/index.js get-performance <siteUrl> [startDate] [endDate]`

### Get Top Queries
Get top search queries for a site.
Arguments:
- `siteUrl`: The site URL.
- `startDate` (optional): Start date. Defaults to 28 days ago.
- `limit` (optional): Number of queries to return. Defaults to 25.

`node /data/workspace/plugins/google-search-console/index.js get-top-queries <siteUrl> [startDate] [limit]`

### Get Index Status
Get index coverage summary for a site.
Arguments:
- `siteUrl`: The site URL.

`node /data/workspace/plugins/google-search-console/index.js get-index-status <siteUrl>`
