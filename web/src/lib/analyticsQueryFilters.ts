import type { DashboardFilters, FilterRule } from '@/stores/analyticsFilterStore';
import type { AnalyticsQueryDimension, AnalyticsQueryFilter } from '@/types/analyticsWorkspace';

export function mapSimpleFilters(filters: DashboardFilters): AnalyticsQueryFilter[] {
    const entries: Array<[keyof DashboardFilters, AnalyticsQueryDimension]> = [
        ['country', 'country'],
        ['device', 'deviceCategory'],
        ['channel', 'sessionDefaultChannelGroup'],
        ['page', 'pagePath'],
        ['referrer', 'sessionSource'],
        ['browser', 'browser'],
        ['os', 'operatingSystem'],
    ];

    return entries.flatMap(([key, fieldName]) => {
        const values = filters[key];
        if (!values.length) return [];
        return [{
            fieldName,
            operator: 'inList' as const,
            value: values,
        }];
    });
}

export function mapAdvancedFilters(filters: FilterRule[]): AnalyticsQueryFilter[] {
    const fieldMap: Record<string, AnalyticsQueryDimension> = {
        country: 'country',
        device: 'deviceCategory',
        channel: 'sessionDefaultChannelGroup',
        page: 'pagePath',
        referrer: 'sessionSource',
        browser: 'browser',
        os: 'operatingSystem',
    };

    return filters.flatMap((filter) => {
        const fieldName = fieldMap[filter.parameter];
        if (!fieldName) return [];
        return [{
            fieldName,
            operator:
                filter.type === 'equals'
                    ? 'equals'
                    : filter.type === 'contains'
                        ? 'contains'
                        : filter.type === 'not_equals'
                            ? 'notEquals'
                            : 'notContains',
            value: filter.value,
        } as AnalyticsQueryFilter];
    });
}
