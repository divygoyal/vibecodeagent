import type {
    AnalyticsCompareMode,
    AnalyticsQueryDimension,
    AnalyticsQueryDimensionMeta,
    AnalyticsQueryMetric,
    AnalyticsQueryMetricMeta,
    AnalyticsQueryVisualization,
} from '@/types/analyticsWorkspace';

export const QUERY_DIMENSION_META: AnalyticsQueryDimensionMeta[] = [
    { value: 'sessionDefaultChannelGroup', label: 'Channel Group', category: 'Acquisition' },
    { value: 'sessionSource', label: 'Source', category: 'Acquisition' },
    { value: 'sessionMedium', label: 'Medium', category: 'Acquisition' },
    { value: 'pagePath', label: 'Page Path', category: 'Content' },
    { value: 'landingPagePlusQueryString', label: 'Landing Page', category: 'Content' },
    { value: 'country', label: 'Country', category: 'Geography' },
    { value: 'city', label: 'City', category: 'Geography' },
    { value: 'language', label: 'Language', category: 'Geography' },
    { value: 'browser', label: 'Browser', category: 'Technology' },
    { value: 'deviceCategory', label: 'Device', category: 'Technology' },
    { value: 'operatingSystem', label: 'Operating System', category: 'Technology' },
];

export const QUERY_METRIC_META: AnalyticsQueryMetricMeta[] = [
    { value: 'activeUsers', label: 'Active users', category: 'User', format: 'number' },
    { value: 'totalUsers', label: 'Total users', category: 'User', format: 'number' },
    { value: 'newUsers', label: 'New users', category: 'User', format: 'number' },
    { value: 'returningUsers', label: 'Returning users', category: 'User', format: 'number' },
    { value: 'sessions', label: 'Sessions', category: 'Traffic', format: 'number' },
    { value: 'screenPageViews', label: 'Views', category: 'Traffic', format: 'number' },
    { value: 'eventCount', label: 'Event count', category: 'Engagement', format: 'number' },
    { value: 'engagementRate', label: 'Engagement rate', category: 'Engagement', format: 'percent' },
    { value: 'bounceRate', label: 'Bounce rate', category: 'Engagement', format: 'percent' },
    { value: 'averageSessionDuration', label: 'Avg session duration', category: 'Engagement', format: 'duration' },
];

export const QUERY_CHART_TYPES: { value: AnalyticsQueryVisualization; label: string }[] = [
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
    { value: 'bar', label: 'Bar' },
    { value: 'combo', label: 'Combo' },
    { value: 'table', label: 'Table' },
    { value: 'geo', label: 'Geo' },
];

export const QUERY_COMPARE_MODES: { value: AnalyticsCompareMode; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'previousPeriod', label: 'Previous period' },
    { value: 'previousYear', label: 'Previous year' },
    { value: 'segments', label: 'Segments' },
];

export const DEFAULT_VISIBLE_METRICS: AnalyticsQueryMetric[] = [
    'activeUsers',
    'sessions',
    'screenPageViews',
    'bounceRate',
];

export const ALLOWED_QUERY_DIMENSIONS = new Set<AnalyticsQueryDimension>(
    QUERY_DIMENSION_META.map((item) => item.value),
);

export const ALLOWED_QUERY_METRICS = new Set<AnalyticsQueryMetric>(
    QUERY_METRIC_META.map((item) => item.value),
);
