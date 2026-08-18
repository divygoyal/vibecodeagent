// Dashboard Builder Types
// Shared types for the customizable dashboard builder feature

// ── Grid Layout Item ──────────────────────────────────────────
// Matches react-grid-layout's Layout interface (defined locally to avoid
// import issues with the library's `export =` namespace pattern).

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
}

// ── Widget Types ──────────────────────────────────────────────

export type WidgetType =
  | 'kpi'
  | 'area-chart'
  | 'bar-chart'
  | 'donut-chart'
  | 'table'
  | 'text'
  | 'seo-performance'
  | 'keywords-table';

export type DataSource = 'ga4' | 'gsc' | 'audit' | 'ai' | 'static';

export type DateRange = '7d' | '14d' | '30d' | '90d';

export type ChartVariant = 'area' | 'line' | 'bar' | 'donut' | 'sparkline';

export interface DataFilter {
  dimension: string;
  operator: 'equals' | 'contains' | 'not_equals' | 'regex';
  value: string;
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;

  // Data binding
  dataSource: DataSource;
  metric?: string;       // e.g., 'totalUsers', 'sessions', 'clicks'
  dimension?: string;    // e.g., 'date', 'country', 'page'
  dateRange?: DateRange;
  filters?: DataFilter[];

  // Display options
  chartType?: ChartVariant;
  colorOverride?: string;
  showComparison?: boolean;

  // Text widget content
  content?: string;
}

// ── Layout Types ──────────────────────────────────────────────

export interface GridLayouts {
  lg: LayoutItem[];
  md: LayoutItem[];
  sm: LayoutItem[];
}

// ── Theme Types ──────────────────────────────────────────────

export type ThemePreset = 'default' | 'light' | 'midnight' | 'ocean' | 'forest' | 'custom';

export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface DashboardTheme {
  preset: ThemePreset;

  // Custom overrides
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  cardBackground?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: BorderRadius;

  // Branding
  logoUrl?: string;
  logoPosition?: 'top-left' | 'top-center' | 'top-right';
  companyName?: string;
  showTrafficClawBranding: boolean;
}

// ── Dashboard Types ──────────────────────────────────────────

export interface DashboardLayout {
  id: string;
  userId: string;
  name: string;
  description?: string;
  propertyId: string;
  siteUrl?: string;

  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  theme: DashboardTheme;

  isPublic: boolean;
  shareToken?: string;
  embedEnabled: boolean;

  isTemplate: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardListItem {
  id: string;
  name: string;
  description?: string;
  propertyId: string;
  widgetCount: number;
  isPublic: boolean;
  shareToken?: string;
  views: number;
  createdAt: string;
  updatedAt: string;
}

// ── Template Types ───────────────────────────────────────────

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;         // lucide icon name
  category: 'analytics' | 'seo' | 'combined' | 'executive' | 'blank';
  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  theme: DashboardTheme;
  previewImage?: string;
}

// ── API Types ────────────────────────────────────────────────

export interface CreateDashboardRequest {
  name: string;
  description?: string;
  propertyId: string;
  siteUrl?: string;
  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  theme: DashboardTheme;
  isTemplate?: boolean;
}

export interface UpdateDashboardRequest {
  name?: string;
  description?: string;
  widgets?: WidgetConfig[];
  gridLayouts?: GridLayouts;
  theme?: DashboardTheme;
  isPublic?: boolean;
  embedEnabled?: boolean;
}

// ── Widget Metadata ──────────────────────────────────────────

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string;
  icon: string;
  category: 'analytics' | 'seo' | 'content';
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  defaultConfig: Partial<WidgetConfig>;
}

// ── Widget Interactions ──────────────────────────────────────

/** Emitted by a widget when the user clicks a data element */
export interface WidgetInteraction {
  sourceWidgetId: string;
  dimension: string;   // e.g. 'source', 'country', 'query', 'page'
  value: string;       // the clicked value, e.g. 'google', 'United States'
}

/** Active cross-widget filter applied to the dashboard */
export interface DashboardFilter {
  id: string;                // unique filter id
  dimension: string;         // dimension being filtered
  value: string;             // filter value
  sourceWidgetId: string;    // which widget created this filter
  sourceWidgetTitle: string; // human label for the filter chip
}

// ── Builder State ────────────────────────────────────────────

export interface DashboardSnapshot {
  widgets: WidgetConfig[];
  gridLayouts: GridLayouts;
  theme: DashboardTheme;
}
