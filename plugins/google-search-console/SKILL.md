---
name: google-search-console
description: Query Google Search Console data — search queries, pages, countries, devices, URL inspection, and more
---

# Google Search Console Plugin

Full access to the Google Search Console API. Query any search analytics data with any combination of dimensions and filters.

## Commands

### `list-sites`
List all verified sites in your Search Console account.

### `query <siteUrl> [options]`
**The main command.** Run any search analytics query with arbitrary dimensions, filters, search types, and date ranges.

Options:
- `--dimensions query,page,country,device,date` — comma-separated dimensions
- `--startDate 2024-01-01` — start date (YYYY-MM-DD)
- `--endDate 2024-01-31` — end date (YYYY-MM-DD)
- `--limit 100` — max rows (up to 25000)
- `--startRow 0` — pagination offset
- `--type web` — search type: web, image, video, news, discover, googleNews
- `--aggregationType auto` — auto, byProperty, byPage
- `--dataState all` — final (default) or all (includes fresh/partial data)
- `--filters '[{"dimension":"query","operator":"contains","expression":"seo"}]'` — JSON array of dimension filters

Filter Operators: `contains`, `equals`, `notContains`, `notEquals`, `includingRegex`, `excludingRegex`

### `inspect-url <siteUrl> <url>`
Get detailed index status for a specific URL: indexing state, last crawl time, mobile usability, rich results.

### `list-sitemaps <siteUrl>`
List all sitemaps submitted for a site.

### Legacy shortcuts (still work):
- `get-performance <siteUrl> [start] [end]` — daily clicks/impressions over time
- `get-top-queries <siteUrl> [start] [limit]` — top queries by clicks
- `get-index-status <siteUrl>` — sitemap overview

## Examples
```
query sc-domain:example.com --dimensions query --limit 50
query sc-domain:example.com --dimensions page --limit 20 --type web
query sc-domain:example.com --dimensions country,device --startDate 2024-01-01
query sc-domain:example.com --dimensions query --filters '[{"dimension":"query","operator":"contains","expression":"seo"}]'
query sc-domain:example.com --dimensions page,query --limit 100 --aggregationType byPage
inspect-url sc-domain:example.com https://example.com/my-page
```

## Available Dimensions
`query`, `page`, `country`, `device`, `date`, `searchAppearance`

## Search Types
`web`, `image`, `video`, `news`, `discover`, `googleNews`

## Auth and multi-tenant: `--client-id <github_id>`
Inside a user bot container, run commands without `--client-id` first. The plugin uses the Google OAuth tokens injected through `OPENCLAW_CONNECTIONS`.

`--client-id` is only for querying Search Console data on behalf of a different platform user (a "client") in runtimes where admin API lookup is allowed. Do not use it for the current Telegram bot user's own data.

Pass `--client-id <github_id>` on any command. The plugin fetches that client's stored Google OAuth tokens from the admin API at runtime and uses those for the Google call. The client's verified sites become accessible without anyone granting cross-account access in Google.

```
list-sites --client-id 114835151932310912436
query sc-domain:example.com --client-id 114835151932310912436 --dimensions query --limit 50
```

When `--client-id` is omitted inside a user bot container, the plugin uses `OPENCLAW_CONNECTIONS` first. If no env credentials exist, it falls back to `USER_IDENTIFIER` and the admin API only when `DISABLE_ADMIN_TOKEN_LOOKUP` is not enabled.
