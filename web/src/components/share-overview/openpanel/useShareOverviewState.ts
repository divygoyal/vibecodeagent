'use client';

import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from 'nuqs';
import {
    parseShareOverviewEventNames,
    parseShareOverviewFilters,
    serializeShareOverviewEventNames,
    serializeShareOverviewFilters,
    type ShareOverviewFilter,
} from '@/lib/shareOverviewFilters';

const historyOptions = { history: 'push' } as const;
const RANGE_VALUES = ['today', 'yesterday', '7d', '14d', '30d', '60d', '90d', '6m', '12m', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'all', 'custom'] as const;
const INTERVAL_VALUES = ['hour', 'day', 'week', 'month'] as const;
const SOURCE_VALUES = ['referrer_name', 'referrer', 'referrer_type', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const PAGES_VALUES = ['page', 'entry', 'exit'] as const;
const TECH_VALUES = ['device', 'browser', 'browser_version', 'os', 'os_version', 'brand', 'model'] as const;
const GEO_VALUES = ['country', 'region', 'city'] as const;
const EVENT_VALUES = ['events', 'conversions', 'link_out'] as const;
const VIEW_VALUES = ['table', 'chart'] as const;

export type ShareOverviewRange = (typeof RANGE_VALUES)[number];
export type ShareOverviewInterval = (typeof INTERVAL_VALUES)[number];
export type ShareOverviewSourcesTab = (typeof SOURCE_VALUES)[number];
export type ShareOverviewPagesTab = (typeof PAGES_VALUES)[number];
export type ShareOverviewTechTab = (typeof TECH_VALUES)[number];
export type ShareOverviewGeoTab = (typeof GEO_VALUES)[number];
export type ShareOverviewEventTab = (typeof EVENT_VALUES)[number];
export type ShareOverviewView = (typeof VIEW_VALUES)[number];

function getDefaultInterval(range: string, startDate?: string | null, endDate?: string | null) {
    if (range === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
        if (diffDays <= 2) return 'hour';
        if (diffDays >= 180) return 'month';
        if (diffDays >= 60) return 'week';
        return 'day';
    }

    if (range === 'today' || range === 'yesterday') {
        return 'hour';
    }
    if (range === '90d') {
        return 'week';
    }
    if (range === '6m' || range === '12m' || range === 'all' || range === 'this_year' || range === 'last_year') {
        return 'month';
    }
    return 'day';
}

export function useShareOverviewState() {
    const [range, setRangeState] = useQueryState(
        'range',
        parseAsStringEnum([...RANGE_VALUES]).withDefault('30d').withOptions(historyOptions),
    );
    const [overrideInterval, setOverrideInterval] = useQueryState(
        'overrideInterval',
        parseAsStringEnum([...INTERVAL_VALUES]).withOptions(historyOptions),
    );
    const [legacyInterval, setLegacyInterval] = useQueryState(
        'interval',
        parseAsStringEnum([...INTERVAL_VALUES]).withOptions(historyOptions),
    );
    const [metric, setMetric] = useQueryState(
        'metric',
        parseAsInteger.withDefault(0).withOptions(historyOptions),
    );
    const [startDate, setStartDate] = useQueryState(
        'start',
        parseAsString.withOptions(historyOptions),
    );
    const [endDate, setEndDate] = useQueryState(
        'end',
        parseAsString.withOptions(historyOptions),
    );
    const [filtersParam, setFiltersParam] = useQueryState(
        'f',
        parseAsString.withDefault('').withOptions(historyOptions),
    );
    const [legacyFiltersParam, setLegacyFiltersParam] = useQueryState(
        'filters',
        parseAsString.withDefault('').withOptions(historyOptions),
    );
    const [eventsParam, setEventsParam] = useQueryState(
        'events',
        parseAsString.withDefault('').withOptions(historyOptions),
    );
    const [sourcesTab, setSourcesTab] = useQueryState(
        'sources',
        parseAsStringEnum([...SOURCE_VALUES]).withDefault('referrer_name').withOptions(historyOptions),
    );
    const [pagesTab, setPagesTab] = useQueryState(
        'pages',
        parseAsStringEnum([...PAGES_VALUES]).withDefault('page').withOptions(historyOptions),
    );
    const [techTab, setTechTab] = useQueryState(
        'tech',
        parseAsStringEnum([...TECH_VALUES]).withDefault('browser').withOptions(historyOptions),
    );
    const [geoTab, setGeoTab] = useQueryState(
        'geo',
        parseAsStringEnum([...GEO_VALUES]).withDefault('country').withOptions(historyOptions),
    );
    const [eventTab, setEventTab] = useQueryState(
        'ev',
        parseAsStringEnum([...EVENT_VALUES]).withDefault('events').withOptions(historyOptions),
    );
    const [view, setView] = useQueryState(
        'view',
        parseAsStringEnum([...VIEW_VALUES]).withDefault('table').withOptions(historyOptions),
    );
    const [domainParam, setDomainParam] = useQueryState(
        'd',
        parseAsString.withOptions(historyOptions),
    );

    const filters = parseShareOverviewFilters(filtersParam || legacyFiltersParam);
    const eventNames = parseShareOverviewEventNames(eventsParam);
    const interval = overrideInterval || legacyInterval || getDefaultInterval(range, startDate, endDate);
    const showDomain = domainParam === '1' || domainParam === 'true';

    function setRange(value: ShareOverviewRange) {
        const nextInterval = getDefaultInterval(value);
        setRangeState(value);
        setOverrideInterval(nextInterval);
        setLegacyInterval(null);
        if (value !== 'custom') {
            setStartDate(null);
            setEndDate(null);
        }
    }

    function setInterval(value: ShareOverviewInterval | null) {
        setOverrideInterval(value);
        setLegacyInterval(null);
    }

    function setFilters(filtersValue: ShareOverviewFilter[]) {
        setFiltersParam(filtersValue.length ? serializeShareOverviewFilters(filtersValue) : '');
        setLegacyFiltersParam('');
    }

    function addFilter(name: ShareOverviewFilter['name'], value: string, operator: ShareOverviewFilter['operator'] = 'is') {
        const existing = filters.find((filter) => filter.name === name && filter.operator === operator);
        if (existing?.value.includes(value)) {
            return;
        }

        const nextFilters = filters.filter((filter) => filter.name !== name || filter.operator !== operator);
        nextFilters.push({
            name,
            operator,
            value: existing ? [...existing.value, value] : [value],
        });
        setFilters(nextFilters);
    }

    function upsertFilter(nextFilter: ShareOverviewFilter) {
        const nextFilters = filters.filter((filter) => filter.name !== nextFilter.name);
        nextFilters.push(nextFilter);
        setFilters(nextFilters);
    }

    function removeFilter(name: ShareOverviewFilter['name'], value?: string) {
        const nextFilters = filters.flatMap((filter) => {
            if (filter.name !== name) {
                return [filter];
            }
            if (!value) {
                return [];
            }
            const nextValues = filter.value.filter((entry) => entry !== value);
            if (!nextValues.length) {
                return [];
            }
            return [{ ...filter, value: nextValues }];
        });
        setFilters(nextFilters);
    }

    function hasFilter(name: ShareOverviewFilter['name'], value: string, operator: ShareOverviewFilter['operator'] = 'is') {
        return filters.some((filter) => filter.name === name && filter.operator === operator && filter.value.includes(value));
    }

    function getFilterValues(name: ShareOverviewFilter['name']) {
        return filters.find((filter) => filter.name === name)?.value || [];
    }

    function setEventNames(values: string[]) {
        setEventsParam(values.length ? serializeShareOverviewEventNames(values) : '');
    }

    function addEventName(value: string) {
        if (eventNames.includes(value)) {
            return;
        }
        setEventNames([...eventNames, value]);
    }

    function removeEventName(value: string) {
        setEventNames(eventNames.filter((item) => item !== value));
    }

    function setShowDomain(next: boolean) {
        setDomainParam(next ? '1' : null);
    }

    return {
        range,
        setRange,
        interval,
        setInterval,
        overrideInterval,
        metric,
        setMetric,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        filters,
        setFilters,
        addFilter,
        upsertFilter,
        removeFilter,
        eventNames,
        setEventNames,
        addEventName,
        removeEventName,
        sourcesTab,
        setSourcesTab,
        pagesTab,
        setPagesTab,
        techTab,
        setTechTab,
        geoTab,
        setGeoTab,
        eventTab,
        setEventTab,
        view,
        setView,
        hasFilter,
        getFilterValues,
        showDomain,
        setShowDomain,
    };
}
