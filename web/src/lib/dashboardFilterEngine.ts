// Dashboard Filter Engine
// Client-side cross-widget filtering for dashboard builder.
// Filters per-widget data arrays based on active DashboardFilter[].

import type { DashboardFilter, WidgetConfig } from '@/types/dashboard';

// Dimensions that should NOT trigger cross-widget filtering
// (filtering a time-series by a single date is useless).
const SKIP_DIMENSIONS = new Set(['date']);

/**
 * Returns true if a given dimension should support cross-widget filtering.
 */
export function isFilterableDimension(dimension: string): boolean {
  return !SKIP_DIMENSIONS.has(dimension);
}

// ── Dimension aliases ────────────────────────────────────────
// Different data sources may use different field names for the same concept.
// This map normalises them so a filter on 'source' also matches 'medium', etc.

const DIMENSION_ALIASES: Record<string, string[]> = {
  source: ['source'],
  country: ['country'],
  channelGrouping: ['channelGrouping'],
  deviceCategory: ['deviceCategory'],
  browser: ['browser'],
  operatingSystem: ['operatingSystem'],
  city: ['city'],
  medium: ['medium'],
  page: ['page'],
  query: ['query'],
};

/**
 * Get all field names that map to a given filter dimension.
 */
function getFieldNames(dimension: string): string[] {
  return DIMENSION_ALIASES[dimension] ?? [dimension];
}

// ── Core filter logic ────────────────────────────────────────

/**
 * Apply active filters to the data for a single widget.
 * - Array data: rows are filtered where any matching dimension field === filter value.
 * - KPI / null data: returned as-is (aggregate data can't be sliced client-side).
 */
export function applyFiltersToWidgetData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  widget: WidgetConfig,
  filters: DashboardFilter[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // No filters → pass through
  if (!filters.length || data == null) return data;

  // Skip filtering the widget that created the filter (show it unfiltered
  // so the user can see the full chart context with the selected item highlighted).
  const externalFilters = filters.filter((f) => f.sourceWidgetId !== widget.id);
  if (!externalFilters.length) return data;

  // Only filter array data (charts / tables). KPI and text widgets are scalar.
  if (!Array.isArray(data)) return data;

  return data.filter((row: Record<string, unknown>) => {
    // Row must pass ALL active external filters
    return externalFilters.every((filter) => {
      const fields = getFieldNames(filter.dimension);
      // Check if this row has the filtered dimension at all
      const matchField = fields.find((f) => row[f] !== undefined);
      if (!matchField) return true; // dimension not present → don't exclude
      return String(row[matchField]).toLowerCase() === filter.value.toLowerCase();
    });
  });
}

/**
 * Apply all active filters to the full widgetData map.
 * Returns a new map with filtered data for each widget.
 */
export function applyDashboardFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  widgetData: Record<string, any>,
  widgets: WidgetConfig[],
  filters: DashboardFilter[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  if (!filters.length) return widgetData;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};

  for (const widget of widgets) {
    const raw = widgetData[widget.id];
    result[widget.id] = applyFiltersToWidgetData(raw, widget, filters);
  }

  return result;
}

/**
 * Generate a unique filter ID from dimension + value.
 */
export function createFilterId(dimension: string, value: string): string {
  return `${dimension}::${value}`;
}

/**
 * Format a dimension name for display in filter chips.
 */
export function formatDimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    source: 'Source',
    country: 'Country',
    channelGrouping: 'Channel',
    deviceCategory: 'Device',
    browser: 'Browser',
    operatingSystem: 'OS',
    city: 'City',
    medium: 'Medium',
    page: 'Page',
    query: 'Keyword',
  };
  return labels[dimension] ?? dimension.charAt(0).toUpperCase() + dimension.slice(1);
}
