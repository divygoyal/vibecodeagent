---
name: google-analytics
description: Query Google Analytics 4 data — traffic, users, engagement, conversions, and more
---

# Google Analytics Plugin

Full access to the Google Analytics 4 Data API. Run any report with any combination of dimensions and metrics.

## Commands

### `list-properties`
List all GA4 properties you have access to. Use this to find the property ID.

### `traffic-summary <site-or-domain> [options]`
Resolve the matching GA4 property from the connected Google account and fetch traffic in one command. Use this first for direct traffic questions in Telegram/Nanobot.

### `list-metrics <propertyId>`
Show all available dimensions and metrics for a property. Use this when you need to discover what you can query.

### `query <propertyId> [options]`
**The main command.** Run any GA4 report with arbitrary dimensions, metrics, filters, ordering, and date ranges.

Options:
- `--dimensions date,country,deviceCategory` — comma-separated dimension names
- `--metrics activeUsers,sessions,bounceRate` — comma-separated metric names
- `--startDate 30daysAgo` — start date (YYYY-MM-DD or relative like 7daysAgo, yesterday)
- `--endDate today` — end date
- `--limit 100` — max rows to return
- `--orderBy activeUsers` — sort by this metric or dimension
- `--orderDirection desc` — sort direction (asc or desc)

### `realtime <propertyId> [options]`
Get realtime active users. Supports `--dimensions` and `--metrics`.

### `get-report <propertyId> [startDate] [endDate]`
Quick traffic report shortcut (date × activeUsers × sessions).

## Examples
```
traffic-summary example.com --startDate yesterday --endDate yesterday
traffic-summary mysite --startDate 7daysAgo --endDate today
query 123456789 --dimensions country --metrics activeUsers,sessions --startDate 30daysAgo
query 123456789 --dimensions pagePath --metrics screenPageViews --orderBy screenPageViews --limit 20
query 123456789 --dimensions deviceCategory,browser --metrics sessions,bounceRate
realtime 123456789 --dimensions country --metrics activeUsers
```

## Common Dimensions
`date`, `country`, `city`, `deviceCategory`, `browser`, `operatingSystem`, `pagePath`, `pageTitle`, `sessionSource`, `sessionMedium`, `sessionCampaignName`, `newVsReturning`, `language`

## Common Metrics
`activeUsers`, `sessions`, `screenPageViews`, `bounceRate`, `averageSessionDuration`, `conversions`, `totalRevenue`, `engagedSessions`, `totalUsers`, `eventCount`, `newUsers`

## Auth and multi-tenant: `--client-id <github_id>`
Inside a user bot container, run commands without `--client-id` first. The plugin uses the Google OAuth tokens injected through `OPENCLAW_CONNECTIONS`.

`--client-id` is only for querying GA4 data on behalf of a different platform user (a "client") in runtimes where admin API lookup is allowed. Do not use it for the current Telegram bot user's own data.

Pass `--client-id <github_id>` on any command. The plugin fetches that client's stored Google OAuth tokens from the admin API at runtime and uses those for the Google call. The client's properties become accessible without anyone granting cross-account access in Google.

```
list-properties --client-id 114835151932310912436
query 123456789 --client-id 114835151932310912436 --dimensions country --metrics activeUsers
```

When `--client-id` is omitted inside a user bot container, the plugin uses `OPENCLAW_CONNECTIONS` first. If no env credentials exist, it falls back to `USER_IDENTIFIER` and the admin API only when `DISABLE_ADMIN_TOKEN_LOOKUP` is not enabled.
