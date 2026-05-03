// Maps widgets → semantic sections so the Share Studio can bulk-toggle visibility.
// Tries explicit `section` field first; falls back to inferring from dataSource + dimension/metric.

import type { WidgetConfig, WidgetSection } from '@/types/dashboard';

export function getWidgetSection(widget: WidgetConfig): WidgetSection {
  if (widget.section) return widget.section;

  // GSC-sourced widgets are SEO
  if (widget.dataSource === 'gsc') return 'seo';
  if (widget.type === 'seo-performance' || widget.type === 'keywords-table') return 'seo';

  const dim = widget.dimension ?? '';
  const metric = widget.metric ?? '';

  if (dim === 'country' || dim === 'city') return 'geo';
  if (dim === 'deviceCategory' || dim === 'browser' || dim === 'operatingSystem') return 'technology';
  if (dim === 'page') return 'pages';
  if (dim === 'source' || dim === 'medium' || dim === 'channelGrouping') return 'sources';

  // Sessions / users / pageviews / bounce / engagement → traffic
  if (
    metric === 'totalUsers' ||
    metric === 'sessions' ||
    metric === 'screenPageViews' ||
    metric === 'bounceRate' ||
    metric === 'engagementRate' ||
    metric === 'newUsers' ||
    metric === 'activeUsers' ||
    metric === 'sessionsPerUser' ||
    metric === 'screenPageViewsPerSession' ||
    metric === 'averageSessionDuration'
  ) {
    return 'traffic';
  }

  return 'traffic';
}

export const SECTION_LABELS: Record<WidgetSection, string> = {
  traffic: 'Traffic',
  sources: 'Sources',
  pages: 'Pages',
  geo: 'Geography',
  technology: 'Technology',
  seo: 'SEO',
};

export const SECTION_DESCRIPTIONS: Record<WidgetSection, string> = {
  traffic: 'Users, sessions, page views, bounce rate',
  sources: 'Channels, source/medium breakdown',
  pages: 'Top pages and landing pages',
  geo: 'Country and city distribution',
  technology: 'Devices, browsers, operating systems',
  seo: 'Search Console clicks, impressions, queries',
};
