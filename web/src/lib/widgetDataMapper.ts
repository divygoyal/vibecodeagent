// Widget Data Mapper
// Maps bulk GA4 (fetchAnalyticsDashboard) and GSC (fetchSeoDashboard)
// responses into per-widget data keyed by widget ID.

import type { WidgetConfig } from '@/types/dashboard';

// ── GA4 Dashboard Response Shape ─────────────────────────────
// Returned by fetchAnalyticsDashboard():

export interface GA4Dashboard {
  kpis: {
    totalUsers: number;
    totalSessions: number;
    totalPageViews: number;
    avgBounceRate: number;       // already * 100
    avgSessionDuration: number;  // seconds
    newUsers: number;
    returningUsers: number;
    pagesPerSession: number;
    changeUsers: number;
    changeSessions: number;
    changePageViews: number;
    changeBounceRate: number;
  } | null;
  traffic: Array<{
    date: string;
    activeUsers: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
  }>;
  sources: Array<{ source: string; sessions: number; users: number; percentage: number }>;
  pages: Array<{ page: string; title: string; views: number; uniqueViews: number; avgTime: string; bounceRate: number }>;
  devices: Array<{ device: string; sessions: number; users: number; percentage: number }>;
  countries: Array<{ country: string; users: number; sessions: number; percentage: number }>;
  browsers: Array<{ name: string; value: number; users?: number; percentage: number }>;
  operatingSystems: Array<{ name: string; value: number; users?: number; percentage: number }>;
  channels: Array<{ name: string; value: number; users?: number; percentage: number }>;
  referrers: Array<{ name: string; value: number; users?: number; percentage: number }>;
  cities: Array<{ city: string; country: string; users: number }>;
  regions: Array<{ region: string; country: string; users: number }>;
  entryPages: Array<{ page: string; sessions: number; users: number; bounceRate: number; percentage: number }>;
  languages: Array<{ name: string; value: number; users?: number; percentage: number }>;
}

// ── GSC Dashboard Response Shape ─────────────────────────────
// Returned by fetchSeoDashboard():

export interface GSCDashboard {
  kpis: {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;          // already * 100
    avgPosition: number;
    indexedPages: number;
    crawlErrors: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
  } | null;
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;    // already * 100
    position: number;
  }>;
  pages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    status: string;
  }>;
  trend: Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  recommendations: unknown[];
}

// ── KPI Metric → Value Mapping ───────────────────────────────

interface KPIResult {
  value: number;
  previousValue?: number;
}

/**
 * Resolve a KPI metric string to its value + previousValue from the bulk data.
 * GA4 KPIs provide absolute values + change percentages.
 * GSC KPIs follow the same pattern.
 */
function resolveKPI(
  metric: string | undefined,
  ga4: GA4Dashboard | null,
  gsc: GSCDashboard | null,
): KPIResult | undefined {
  if (!metric) return undefined;

  const k = ga4?.kpis;
  const s = gsc?.kpis;

  // GA4 KPI mappings
  const ga4Map: Record<string, () => KPIResult | undefined> = {
    totalUsers: () => k ? { value: k.totalUsers, previousValue: derivePrev(k.totalUsers, k.changeUsers) } : undefined,
    activeUsers: () => k ? { value: k.totalUsers, previousValue: derivePrev(k.totalUsers, k.changeUsers) } : undefined,
    sessions: () => k ? { value: k.totalSessions, previousValue: derivePrev(k.totalSessions, k.changeSessions) } : undefined,
    screenPageViews: () => k ? { value: k.totalPageViews, previousValue: derivePrev(k.totalPageViews, k.changePageViews) } : undefined,
    pageViews: () => k ? { value: k.totalPageViews, previousValue: derivePrev(k.totalPageViews, k.changePageViews) } : undefined,
    bounceRate: () => k ? { value: k.avgBounceRate / 100, previousValue: (k.avgBounceRate - k.changeBounceRate) / 100 } : undefined,
    averageSessionDuration: () => k ? { value: k.avgSessionDuration } : undefined,
    newUsers: () => k ? { value: k.newUsers } : undefined,
    sessionsPerUser: () => k ? { value: k.pagesPerSession } : undefined,
    screenPageViewsPerSession: () => k ? { value: k.pagesPerSession } : undefined,
    engagementRate: () => k ? { value: (100 - k.avgBounceRate) / 100 } : undefined,
  };

  // GSC KPI mappings
  const gscMap: Record<string, () => KPIResult | undefined> = {
    clicks: () => s ? { value: s.totalClicks, previousValue: derivePrev(s.totalClicks, s.changeClicks) } : undefined,
    impressions: () => s ? { value: s.totalImpressions, previousValue: derivePrev(s.totalImpressions, s.changeImpressions) } : undefined,
    ctr: () => s ? { value: s.avgCTR / 100, previousValue: (s.avgCTR - s.changeCTR) / 100 } : undefined,
    position: () => s ? { value: s.avgPosition, previousValue: s.avgPosition - s.changePosition } : undefined,
  };

  const resolver = ga4Map[metric] || gscMap[metric];
  return resolver?.();
}

/** Derive previous value from current + percentage change */
function derivePrev(current: number, changePct: number): number {
  if (changePct === 0) return current;
  // changePct = ((cur - prev) / prev) * 100
  // prev = cur / (1 + changePct/100)
  const prev = current / (1 + changePct / 100);
  return Math.round(prev);
}

// ── Dimension → Data Array Mapping ───────────────────────────

type DataRow = Record<string, unknown>;

/**
 * Resolve chart/table data based on dimension + metric + dataSource.
 * Returns an array of objects suitable for Recharts / table components.
 */
function resolveChartData(
  widget: WidgetConfig,
  ga4: GA4Dashboard | null,
  gsc: GSCDashboard | null,
): DataRow[] {
  const { dataSource, dimension, metric } = widget;

  // GA4 data resolution
  if (dataSource === 'ga4') {
    return resolveGA4ChartData(dimension, metric, ga4);
  }

  // GSC data resolution
  if (dataSource === 'gsc') {
    return resolveGSCChartData(dimension, metric, gsc);
  }

  return [];
}

function resolveGA4ChartData(
  dimension: string | undefined,
  metric: string | undefined,
  ga4: GA4Dashboard | null,
): DataRow[] {
  if (!ga4) return [];

  const dim = dimension || 'date';
  const met = metric || 'totalUsers';

  // Date-based time series → use traffic array
  if (dim === 'date') {
    return ga4.traffic.map((row) => {
      const metricValue = resolveTrafficMetric(row, met);
      return { date: row.date, [met]: metricValue };
    });
  }

  // Source dimension
  if (dim === 'source') {
    return ga4.sources.map((row) => ({
      source: row.source,
      sessions: row.sessions,
      users: row.users,
      percentage: row.percentage,
    }));
  }

  // Page dimension
  if (dim === 'page') {
    return ga4.pages.map((row) => ({
      page: row.page,
      title: row.title,
      views: row.views,
      uniqueViews: row.uniqueViews,
      avgTime: row.avgTime,
      bounceRate: row.bounceRate,
    }));
  }

  // Device dimension
  if (dim === 'deviceCategory') {
    return ga4.devices.map((row) => ({
      deviceCategory: row.device,
      sessions: row.sessions,
      users: row.users,
      percentage: row.percentage,
    }));
  }

  // Country dimension
  if (dim === 'country') {
    return ga4.countries.map((row) => ({
      country: row.country,
      users: row.users,
      sessions: row.sessions,
      percentage: row.percentage,
    }));
  }

  // Channel dimension
  if (dim === 'channelGrouping') {
    return ga4.channels.map((row) => ({
      channelGrouping: row.name,
      sessions: row.value,
      users: row.users ?? 0,
      percentage: row.percentage,
    }));
  }

  // Browser dimension
  if (dim === 'browser') {
    return ga4.browsers.map((row) => ({
      browser: row.name,
      sessions: row.value,
      users: row.users ?? 0,
      percentage: row.percentage,
    }));
  }

  // OS dimension
  if (dim === 'operatingSystem') {
    return ga4.operatingSystems.map((row) => ({
      operatingSystem: row.name,
      sessions: row.value,
      users: row.users ?? 0,
      percentage: row.percentage,
    }));
  }

  // City dimension
  if (dim === 'city') {
    return ga4.cities.map((row) => ({
      city: row.city,
      country: row.country,
      users: row.users,
    }));
  }

  // Medium dimension → use referrers
  if (dim === 'medium') {
    return ga4.referrers.map((row) => ({
      medium: row.name,
      sessions: row.value,
      users: row.users ?? 0,
      percentage: row.percentage,
    }));
  }

  // Fallback: return traffic time series
  return ga4.traffic.map((row) => ({
    date: row.date,
    [met]: resolveTrafficMetric(row, met),
  }));
}

function resolveTrafficMetric(
  row: GA4Dashboard['traffic'][number],
  metric: string,
): number {
  switch (metric) {
    case 'totalUsers':
    case 'activeUsers':
      return row.activeUsers;
    case 'sessions':
      return row.sessions;
    case 'screenPageViews':
    case 'pageViews':
      return row.pageViews;
    case 'bounceRate':
      return row.bounceRate;
    default:
      return row.activeUsers;
  }
}

function resolveGSCChartData(
  dimension: string | undefined,
  _metric: string | undefined,
  gsc: GSCDashboard | null,
): DataRow[] {
  if (!gsc) return [];

  const dim = dimension || 'date';

  // Date-based → trend array
  if (dim === 'date') {
    return gsc.trend.map((row) => ({
      date: row.date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
  }

  // Query dimension → queries array
  if (dim === 'query') {
    return gsc.queries.map((row) => ({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
  }

  // Page dimension → pages array
  if (dim === 'page') {
    return gsc.pages.map((row) => ({
      page: row.page,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      status: row.status,
    }));
  }

  return gsc.trend;
}

// ── Main Mapper ──────────────────────────────────────────────

/**
 * Maps bulk GA4 + GSC data to per-widget data.
 * Returns Record<widgetId, widgetData> where widgetData matches
 * the shape each widget component expects.
 */
export function mapWidgetData(
  widgets: WidgetConfig[],
  ga4Data: GA4Dashboard | null,
  gscData: GSCDashboard | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const widget of widgets) {
    switch (widget.type) {
      // ── KPI: { value, previousValue? }
      case 'kpi': {
        result[widget.id] = resolveKPI(widget.metric, ga4Data, gscData) ?? { value: 0 };
        break;
      }

      // ── Area / Bar / Donut charts: Array<Record<string, unknown>>
      case 'area-chart':
      case 'bar-chart':
      case 'donut-chart': {
        result[widget.id] = resolveChartData(widget, ga4Data, gscData);
        break;
      }

      // ── Generic table: Array<Record<string, unknown>>
      case 'table': {
        result[widget.id] = resolveChartData(widget, ga4Data, gscData);
        break;
      }

      // ── Text: no external data
      case 'text': {
        result[widget.id] = null;
        break;
      }

      // ── SEO Performance: Array<{ date, clicks, impressions }>
      case 'seo-performance': {
        result[widget.id] = gscData?.trend ?? [];
        break;
      }

      // ── Keywords Table: Array<{ query, clicks, impressions, ctr, position }>
      case 'keywords-table': {
        // GSC queries have ctr already as percentage (* 100)
        // but KeywordsTableWidget's formatVal does `(value * 100).toFixed(1)%`
        // so we need to divide back to decimal for the widget
        result[widget.id] = (gscData?.queries ?? []).map((q) => ({
          ...q,
          ctr: q.ctr / 100,
        }));
        break;
      }

      default:
        result[widget.id] = null;
    }
  }

  return result;
}
