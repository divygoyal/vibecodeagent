export type AnalyticsAccentTone = 'mint' | 'cyan' | 'violet' | 'amber' | 'rose' | 'blue';

export type AnalyticsChartMetric = 'activeUsers' | 'sessions' | 'pageViews' | 'bounceRate';
export type AnalyticsSecondaryMetric = 'none' | 'sessions' | 'pageViews';
export type AnalyticsTimeBucket = 'day' | 'week' | 'month';
export type AnalyticsChartMode = 'combo' | 'line' | 'area';

export type AnalyticsPanelId =
    | 'acquisition'
    | 'content'
    | 'platforms'
    | 'geography'
    | 'insights';

export interface AnalyticsThemeTokens {
    background: string;
    surface: string;
    surfaceElevated: string;
    surfaceMuted: string;
    border: string;
    borderStrong: string;
    highlight: string;
    shadow: string;
}

export interface AnalyticsChartConfig {
    primaryMetric: AnalyticsChartMetric;
    secondaryMetric: AnalyticsSecondaryMetric;
    chartMode: AnalyticsChartMode;
    bucket: AnalyticsTimeBucket;
    compareMode: boolean;
    smoothing: boolean;
    annotations: boolean;
}

export interface AnalyticsPanelConfig {
    id: AnalyticsPanelId;
    title?: string;
    rowLimit: number;
    accentTone: AnalyticsAccentTone;
    visibleTabs: string[];
}

export interface AnalyticsLayoutConfig {
    panelOrder: AnalyticsPanelId[];
    compactHeader: boolean;
}

export type AnalyticsQueryDimension =
    | 'sessionDefaultChannelGroup'
    | 'sessionSource'
    | 'sessionMedium'
    | 'country'
    | 'city'
    | 'browser'
    | 'deviceCategory'
    | 'operatingSystem'
    | 'pagePath'
    | 'landingPagePlusQueryString'
    | 'language';

export type AnalyticsQueryMetric =
    | 'activeUsers'
    | 'totalUsers'
    | 'returningUsers'
    | 'sessions'
    | 'screenPageViews'
    | 'eventCount'
    | 'engagementRate'
    | 'bounceRate'
    | 'averageSessionDuration'
    | 'newUsers';

export type AnalyticsQueryVisualization = 'table' | 'line' | 'bar' | 'area' | 'combo' | 'geo';
export type AnalyticsCompareMode = 'off' | 'previousPeriod' | 'previousYear' | 'segments';
export type AnalyticsQueryOperator =
    | 'equals'
    | 'contains'
    | 'inList'
    | 'notEquals'
    | 'notContains'
    | 'notInList';

export interface AnalyticsQueryFilter {
    fieldName: AnalyticsQueryDimension;
    operator: AnalyticsQueryOperator;
    value: string | string[];
}

export interface AnalyticsQueryComparison {
    id?: string;
    label?: string;
    fieldName: AnalyticsQueryDimension;
    operator: AnalyticsQueryOperator;
    value: string | string[];
}

export interface AnalyticsQueryDescriptor {
    propertyId?: string;
    primaryDimension: AnalyticsQueryDimension;
    secondaryDimension?: AnalyticsQueryDimension | null;
    metrics: AnalyticsQueryMetric[];
    visibleMetrics?: AnalyticsQueryMetric[];
    selectedMetric?: AnalyticsQueryMetric;
    secondaryMetric?: AnalyticsQueryMetric | null;
    range?: string;
    bucket?: AnalyticsTimeBucket;
    compareMode?: AnalyticsCompareMode;
    compare?: boolean;
    comparisons?: AnalyticsQueryComparison[];
    limit?: number;
    orderBy?: AnalyticsQueryMetric;
    visualization?: AnalyticsQueryVisualization;
    plotRows?: string[];
    filters?: AnalyticsQueryFilter[];
}

export interface AnalyticsFilterSet {
    simple: Record<string, string[]>;
    advanced: Array<{
        parameter: string;
        type: 'equals' | 'not_equals' | 'contains' | 'not_contains';
        value: string;
    }>;
}

export interface AnalyticsViewState {
    descriptor: AnalyticsQueryDescriptor;
    metricSlots: AnalyticsQueryMetric[];
    compareMode: AnalyticsCompareMode;
    bucket: AnalyticsTimeBucket;
    chartType: AnalyticsQueryVisualization;
    secondaryMetric?: AnalyticsQueryMetric | null;
    selectedRows: string[];
    filterSet: AnalyticsFilterSet;
}

export interface AnalyticsViewConfig {
    id: string;
    userId?: string;
    propertyId?: string;
    name: string;
    isDefault?: boolean;
    chart: AnalyticsChartConfig;
    panels: Record<AnalyticsPanelId, AnalyticsPanelConfig>;
    layout: AnalyticsLayoutConfig;
    state?: AnalyticsViewState;
    updatedAt: string;
    createdAt?: string;
}

export interface AnalyticsQueryTableRow {
    id: string;
    primaryValue: string;
    secondaryValue?: string;
    metrics: Record<string, number>;
}

export interface AnalyticsQueryTrendPoint {
    key?: string;
    label: string;
    total: number;
    compareTotal?: number;
    secondaryValue?: number;
    series?: Record<string, number>;
    comparisonTotals?: Record<string, number>;
    status?: string;
}

export interface AnalyticsQueryAnnotationHint {
    key: string;
    label: string;
    total: number;
    severity: number;
}

export interface AnalyticsQueryResponse {
    summary: Record<string, number>;
    table: AnalyticsQueryTableRow[];
    totalRow?: AnalyticsQueryTableRow;
    trend: AnalyticsQueryTrendPoint[];
    selectedMetric: AnalyticsQueryMetric;
    secondaryMetric?: AnalyticsQueryMetric | null;
    compareMode: AnalyticsCompareMode;
    annotationHints?: AnalyticsQueryAnnotationHint[];
    descriptor: AnalyticsQueryDescriptor;
}

export interface AnalyticsQueryMetricMeta {
    value: AnalyticsQueryMetric;
    label: string;
    category: string;
    format: 'number' | 'percent' | 'duration';
}

export interface AnalyticsQueryDimensionMeta {
    value: AnalyticsQueryDimension;
    label: string;
    category: string;
}

export interface AnalyticsQueryMetaResponse {
    metrics: AnalyticsQueryMetricMeta[];
    dimensions: AnalyticsQueryDimensionMeta[];
    compareModes: { value: AnalyticsCompareMode; label: string }[];
    chartTypes: { value: AnalyticsQueryVisualization; label: string }[];
}
