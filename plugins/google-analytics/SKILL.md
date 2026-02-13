---
name: google-analytics
description: Access Google Analytics 4 data (list properties, get reports) for the connected user.
---

# Google Analytics

Use this skill to fetch traffic reports and list properties from the user's Google Analytics account.

## Tools

### List Properties
Run this command to list all available GA4 properties and their IDs.
`node /data/workspace/plugins/google-analytics/index.js list-properties`

### Get Report
Run this command to get a traffic report for a specific property.
Arguments:
- `propertyId`: The GA4 property ID (e.g., 'properties/123456789').
- `startDate` (optional): Start date (YYYY-MM-DD or '30daysAgo', '7daysAgo'). Defaults to '7daysAgo'.
- `endDate` (optional): End date (YYYY-MM-DD or 'today'). Defaults to 'today'.

`node /data/workspace/plugins/google-analytics/index.js get-report <propertyId> [startDate] [endDate]`
