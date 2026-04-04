// Dashboard Builder Helpers
// Templates, widget metadata, theme presets, and utility functions

import type {
  WidgetMeta,
  WidgetType,
  WidgetConfig,
  GridLayouts,
  DashboardTheme,
  DashboardTemplate,
  ThemePreset,
  LayoutItem,
} from '@/types/dashboard';

// ── Widget Registry ──────────────────────────────────────────

export const WIDGET_REGISTRY: Record<WidgetType, WidgetMeta> = {
  kpi: {
    type: 'kpi',
    label: 'KPI Card',
    description: 'Single metric with change percentage',
    icon: 'TrendingUp',
    category: 'analytics',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 6, h: 3 },
    defaultConfig: {
      dataSource: 'ga4',
      metric: 'totalUsers',
      showComparison: true,
    },
  },
  'area-chart': {
    type: 'area-chart',
    label: 'Area Chart',
    description: 'Time-series area chart',
    icon: 'AreaChart',
    category: 'analytics',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {
      dataSource: 'ga4',
      metric: 'totalUsers',
      dimension: 'date',
      chartType: 'area',
    },
  },
  'bar-chart': {
    type: 'bar-chart',
    label: 'Bar Chart',
    description: 'Horizontal or vertical bar chart',
    icon: 'BarChart3',
    category: 'analytics',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {
      dataSource: 'ga4',
      metric: 'sessions',
      dimension: 'source',
      chartType: 'bar',
    },
  },
  'donut-chart': {
    type: 'donut-chart',
    label: 'Donut Chart',
    description: 'Proportion breakdown chart',
    icon: 'PieChart',
    category: 'analytics',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 6, h: 6 },
    defaultConfig: {
      dataSource: 'ga4',
      metric: 'sessions',
      dimension: 'channelGrouping',
    },
  },
  table: {
    type: 'table',
    label: 'Data Table',
    description: 'Sortable data table with rows',
    icon: 'Table',
    category: 'analytics',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {
      dataSource: 'ga4',
      dimension: 'page',
    },
  },
  text: {
    type: 'text',
    label: 'Text / Heading',
    description: 'Static text, heading, or note',
    icon: 'Type',
    category: 'content',
    defaultSize: { w: 12, h: 1 },
    minSize: { w: 2, h: 1 },
    maxSize: { w: 12, h: 4 },
    defaultConfig: {
      dataSource: 'static',
      content: 'Section Title',
    },
  },
  'seo-performance': {
    type: 'seo-performance',
    label: 'SEO Performance',
    description: 'Search Console clicks & impressions over time',
    icon: 'Search',
    category: 'seo',
    defaultSize: { w: 8, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {
      dataSource: 'gsc',
      metric: 'clicks',
      dimension: 'date',
      chartType: 'area',
    },
  },
  'keywords-table': {
    type: 'keywords-table',
    label: 'Top Keywords',
    description: 'Search Console top queries table',
    icon: 'FileSearch',
    category: 'seo',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {
      dataSource: 'gsc',
      dimension: 'query',
    },
  },
};

// ── Metric Options ───────────────────────────────────────────

export const GA4_METRICS = [
  { value: 'totalUsers', label: 'Users' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'screenPageViews', label: 'Page Views' },
  { value: 'bounceRate', label: 'Bounce Rate' },
  { value: 'averageSessionDuration', label: 'Avg. Session Duration' },
  { value: 'engagementRate', label: 'Engagement Rate' },
  { value: 'newUsers', label: 'New Users' },
  { value: 'activeUsers', label: 'Active Users' },
  { value: 'sessionsPerUser', label: 'Sessions per User' },
  { value: 'screenPageViewsPerSession', label: 'Pages per Session' },
] as const;

export const GA4_DIMENSIONS = [
  { value: 'date', label: 'Date' },
  { value: 'source', label: 'Traffic Source' },
  { value: 'medium', label: 'Medium' },
  { value: 'channelGrouping', label: 'Channel' },
  { value: 'page', label: 'Page Path' },
  { value: 'country', label: 'Country' },
  { value: 'city', label: 'City' },
  { value: 'deviceCategory', label: 'Device' },
  { value: 'browser', label: 'Browser' },
  { value: 'operatingSystem', label: 'Operating System' },
] as const;

export const GSC_METRICS = [
  { value: 'clicks', label: 'Clicks' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'ctr', label: 'CTR' },
  { value: 'position', label: 'Avg. Position' },
] as const;

// ── Theme Presets ────────────────────────────────────────────

export const THEME_PRESETS: Record<ThemePreset, DashboardTheme> = {
  default: {
    preset: 'default',
    primaryColor: '#10b981',
    accentColor: '#06b6d4',
    backgroundColor: '#09090b',
    cardBackground: '#18181b',
    textColor: '#ffffff',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'md',
    showTrafficClawBranding: true,
  },
  light: {
    preset: 'light',
    primaryColor: '#059669',
    accentColor: '#0891b2',
    backgroundColor: '#ffffff',
    cardBackground: '#f9fafb',
    textColor: '#111827',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'md',
    showTrafficClawBranding: true,
  },
  midnight: {
    preset: 'midnight',
    primaryColor: '#3b82f6',
    accentColor: '#8b5cf6',
    backgroundColor: '#020617',
    cardBackground: '#0f172a',
    textColor: '#f8fafc',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'md',
    showTrafficClawBranding: true,
  },
  ocean: {
    preset: 'ocean',
    primaryColor: '#06b6d4',
    accentColor: '#14b8a6',
    backgroundColor: '#0f172a',
    cardBackground: '#1e293b',
    textColor: '#f8fafc',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'md',
    showTrafficClawBranding: true,
  },
  forest: {
    preset: 'forest',
    primaryColor: '#84cc16',
    accentColor: '#22c55e',
    backgroundColor: '#022c22',
    cardBackground: '#064e3b',
    textColor: '#f0fdf4',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'lg',
    showTrafficClawBranding: true,
  },
  custom: {
    preset: 'custom',
    primaryColor: '#10b981',
    accentColor: '#06b6d4',
    backgroundColor: '#09090b',
    cardBackground: '#18181b',
    textColor: '#ffffff',
    fontFamily: 'Geist Sans, sans-serif',
    borderRadius: 'md',
    showTrafficClawBranding: true,
  },
};

// ── Helper Functions ─────────────────────────────────────────

let _widgetCounter = 0;

export function generateWidgetId(): string {
  _widgetCounter++;
  return `w-${Date.now()}-${_widgetCounter}`;
}

export function createWidget(type: WidgetType, overrides?: Partial<WidgetConfig>): WidgetConfig {
  const meta = WIDGET_REGISTRY[type];
  const id = generateWidgetId();
  return {
    id,
    type,
    title: meta.label,
    dataSource: meta.defaultConfig.dataSource ?? 'ga4',
    metric: meta.defaultConfig.metric,
    dimension: meta.defaultConfig.dimension,
    chartType: meta.defaultConfig.chartType,
    showComparison: meta.defaultConfig.showComparison,
    content: meta.defaultConfig.content,
    ...overrides,
  };
}

export function createDefaultLayout(widgetId: string, type: WidgetType, index: number): { x: number; y: number; w: number; h: number } {
  const meta = WIDGET_REGISTRY[type];
  const cols = 12;
  const { w, h } = meta.defaultSize;
  // Stack widgets: fill row then wrap
  const perRow = Math.floor(cols / w);
  const col = (index % perRow) * w;
  const row = Math.floor(index / perRow) * h;
  return { x: col, y: row, w, h };
}

export function getWidgetConstraints(type: WidgetType) {
  const meta = WIDGET_REGISTRY[type];
  return {
    minW: meta.minSize.w,
    minH: meta.minSize.h,
    maxW: meta.maxSize.w,
    maxH: meta.maxSize.h,
  };
}

// ── Templates ────────────────────────────────────────────────

function buildTemplate(
  id: string,
  name: string,
  description: string,
  icon: string,
  category: DashboardTemplate['category'],
  widgetDefs: Array<{ type: WidgetType; title: string; overrides?: Partial<WidgetConfig>; layout: { x: number; y: number; w: number; h: number } }>,
): DashboardTemplate {
  const widgets: WidgetConfig[] = [];
  const lgLayouts: LayoutItem[] = [];

  for (const def of widgetDefs) {
    const w = createWidget(def.type, { title: def.title, ...def.overrides });
    widgets.push(w);
    const constraints = getWidgetConstraints(def.type);
    lgLayouts.push({ i: w.id, ...def.layout, ...constraints });
  }

  // Auto-generate md and sm layouts
  const mdLayouts = lgLayouts.map((l) => ({
    ...l,
    w: Math.min(l.w, 6),
    x: 0,
  }));
  const smLayouts = lgLayouts.map((l) => ({
    ...l,
    w: 12,
    x: 0,
  }));

  return {
    id,
    name,
    description,
    icon,
    category,
    widgets,
    gridLayouts: { lg: lgLayouts, md: mdLayouts, sm: smLayouts },
    theme: { ...THEME_PRESETS.default },
  };
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  buildTemplate(
    'analytics-overview',
    'Analytics Overview',
    'Classic GA4-style dashboard with traffic KPIs, trend chart, sources, and top pages',
    'BarChart3',
    'analytics',
    [
      { type: 'kpi', title: 'Users', overrides: { metric: 'totalUsers' }, layout: { x: 0, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'Sessions', overrides: { metric: 'sessions' }, layout: { x: 3, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'Page Views', overrides: { metric: 'screenPageViews' }, layout: { x: 6, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'Bounce Rate', overrides: { metric: 'bounceRate' }, layout: { x: 9, y: 0, w: 3, h: 2 } },
      { type: 'area-chart', title: 'Traffic Trend', overrides: { metric: 'totalUsers', dimension: 'date' }, layout: { x: 0, y: 2, w: 8, h: 4 } },
      { type: 'donut-chart', title: 'Traffic Sources', overrides: { dimension: 'channelGrouping' }, layout: { x: 8, y: 2, w: 4, h: 4 } },
      { type: 'table', title: 'Top Pages', overrides: { dimension: 'page' }, layout: { x: 0, y: 6, w: 12, h: 4 } },
    ],
  ),
  buildTemplate(
    'seo-performance',
    'SEO Performance',
    'Search Console focused dashboard with keyword and page performance',
    'Search',
    'seo',
    [
      { type: 'kpi', title: 'Clicks', overrides: { dataSource: 'gsc', metric: 'clicks' }, layout: { x: 0, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'Impressions', overrides: { dataSource: 'gsc', metric: 'impressions' }, layout: { x: 3, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'CTR', overrides: { dataSource: 'gsc', metric: 'ctr' }, layout: { x: 6, y: 0, w: 3, h: 2 } },
      { type: 'kpi', title: 'Avg. Position', overrides: { dataSource: 'gsc', metric: 'position' }, layout: { x: 9, y: 0, w: 3, h: 2 } },
      { type: 'seo-performance', title: 'Search Performance Trend', layout: { x: 0, y: 2, w: 12, h: 4 } },
      { type: 'keywords-table', title: 'Top Keywords', layout: { x: 0, y: 6, w: 6, h: 4 } },
      { type: 'table', title: 'Top Landing Pages', overrides: { dataSource: 'gsc', dimension: 'page' }, layout: { x: 6, y: 6, w: 6, h: 4 } },
    ],
  ),
  buildTemplate(
    'combined-report',
    'Combined Report',
    'Full analytics + SEO report for comprehensive overview',
    'LayoutDashboard',
    'combined',
    [
      { type: 'text', title: 'Analytics', overrides: { content: 'Analytics Overview' }, layout: { x: 0, y: 0, w: 12, h: 1 } },
      { type: 'kpi', title: 'Users', overrides: { metric: 'totalUsers' }, layout: { x: 0, y: 1, w: 3, h: 2 } },
      { type: 'kpi', title: 'Sessions', overrides: { metric: 'sessions' }, layout: { x: 3, y: 1, w: 3, h: 2 } },
      { type: 'kpi', title: 'Page Views', overrides: { metric: 'screenPageViews' }, layout: { x: 6, y: 1, w: 3, h: 2 } },
      { type: 'kpi', title: 'Bounce Rate', overrides: { metric: 'bounceRate' }, layout: { x: 9, y: 1, w: 3, h: 2 } },
      { type: 'area-chart', title: 'Traffic Trend', layout: { x: 0, y: 3, w: 8, h: 4 } },
      { type: 'bar-chart', title: 'Traffic Sources', overrides: { dimension: 'source' }, layout: { x: 8, y: 3, w: 4, h: 4 } },
      { type: 'text', title: 'SEO', overrides: { content: 'SEO Performance' }, layout: { x: 0, y: 7, w: 12, h: 1 } },
      { type: 'seo-performance', title: 'Search Trend', layout: { x: 0, y: 8, w: 8, h: 4 } },
      { type: 'keywords-table', title: 'Top Keywords', layout: { x: 8, y: 8, w: 4, h: 4 } },
    ],
  ),
  buildTemplate(
    'executive-summary',
    'Executive Summary',
    'High-level KPI dashboard designed for quick glanceable overview',
    'Briefcase',
    'executive',
    [
      { type: 'text', title: 'Header', overrides: { content: 'Executive Dashboard' }, layout: { x: 0, y: 0, w: 12, h: 1 } },
      { type: 'kpi', title: 'Users', overrides: { metric: 'totalUsers' }, layout: { x: 0, y: 1, w: 4, h: 2 } },
      { type: 'kpi', title: 'Sessions', overrides: { metric: 'sessions' }, layout: { x: 4, y: 1, w: 4, h: 2 } },
      { type: 'kpi', title: 'Page Views', overrides: { metric: 'screenPageViews' }, layout: { x: 8, y: 1, w: 4, h: 2 } },
      { type: 'kpi', title: 'Clicks', overrides: { dataSource: 'gsc', metric: 'clicks' }, layout: { x: 0, y: 3, w: 4, h: 2 } },
      { type: 'kpi', title: 'Impressions', overrides: { dataSource: 'gsc', metric: 'impressions' }, layout: { x: 4, y: 3, w: 4, h: 2 } },
      { type: 'kpi', title: 'Avg. Position', overrides: { dataSource: 'gsc', metric: 'position' }, layout: { x: 8, y: 3, w: 4, h: 2 } },
      { type: 'area-chart', title: 'Traffic Trend', layout: { x: 0, y: 5, w: 12, h: 4 } },
    ],
  ),
  {
    id: 'blank-canvas',
    name: 'Blank Canvas',
    description: 'Start from scratch with an empty dashboard',
    icon: 'Plus',
    category: 'blank',
    widgets: [],
    gridLayouts: { lg: [], md: [], sm: [] },
    theme: { ...THEME_PRESETS.default },
  },
];

export function getTemplate(id: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find((t) => t.id === id);
}

// ── Theme Helpers ────────────────────────────────────────────

export function getThemeCSS(theme: DashboardTheme): Record<string, string> {
  return {
    '--db-bg': theme.backgroundColor ?? '#09090b',
    '--db-card': theme.cardBackground ?? '#18181b',
    '--db-primary': theme.primaryColor ?? '#10b981',
    '--db-accent': theme.accentColor ?? '#06b6d4',
    '--db-text': theme.textColor ?? '#ffffff',
    '--db-radius': theme.borderRadius === 'none' ? '0px'
      : theme.borderRadius === 'sm' ? '0.25rem'
      : theme.borderRadius === 'lg' ? '0.75rem'
      : theme.borderRadius === 'full' ? '1.5rem'
      : '0.5rem',
    '--db-font': theme.fontFamily ?? 'Geist Sans, sans-serif',
  };
}

export function isLightTheme(theme: DashboardTheme): boolean {
  if (!theme.backgroundColor) return false;
  // Simple heuristic: check if bg is light
  const hex = theme.backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
