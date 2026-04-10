export const SHARE_OVERVIEW_FILTER_NAMES = [
    'referrer_name',
    'referrer',
    'referrer_type',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'device',
    'browser',
    'browser_version',
    'os',
    'os_version',
    'brand',
    'model',
    'country',
    'region',
    'city',
    'origin',
    'path',
    'entry_path',
    'exit_path',
    'name',
] as const;

export type ShareOverviewFilterName = (typeof SHARE_OVERVIEW_FILTER_NAMES)[number];
export type ShareOverviewFilterOperator =
    | 'is'
    | 'isNot'
    | 'contains'
    | 'notContains'
    | 'isNull'
    | 'isNotNull';

export interface ShareOverviewFilter {
    name: ShareOverviewFilterName;
    operator: ShareOverviewFilterOperator;
    value: string[];
}

function isShareOverviewFilterName(value: string): value is ShareOverviewFilterName {
    return (SHARE_OVERVIEW_FILTER_NAMES as readonly string[]).includes(value);
}

function isShareOverviewFilterOperator(value: string): value is ShareOverviewFilterOperator {
    return ['is', 'isNot', 'contains', 'notContains', 'isNull', 'isNotNull'].includes(value);
}

function decodeFilterValue(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizeFilterValues(values: unknown[]) {
    return values
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
}

export function parseShareOverviewFilters(raw: string | null | undefined): ShareOverviewFilter[] {
    if (!raw) {
        return [];
    }

    if (!raw.trim()) {
        return [];
    }

    try {
        if (raw.trim().startsWith('[')) {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.flatMap((item) => {
                if (
                    !item ||
                    typeof item !== 'object' ||
                    typeof item.name !== 'string' ||
                    !isShareOverviewFilterName(item.name) ||
                    typeof item.operator !== 'string' ||
                    !isShareOverviewFilterOperator(item.operator)
                ) {
                    return [];
                }

                const rawValues = Array.isArray(item.value) ? item.value : [];
                const values = normalizeFilterValues(rawValues);
                const noValueOperator = item.operator === 'isNull' || item.operator === 'isNotNull';

                if (!noValueOperator && !values.length) {
                    return [];
                }

                return [{
                    name: item.name,
                    operator: item.operator,
                    value: values,
                }];
            });
        }
    } catch {
        // Fall through to compact parser
    }

    return raw.split(';').flatMap((segment) => {
        const trimmed = segment.trim();
        if (!trimmed) {
            return [];
        }

        const [name, operator, valuesPart = ''] = trimmed.split('~');
        if (!name || !operator || !isShareOverviewFilterName(name) || !isShareOverviewFilterOperator(operator)) {
            return [];
        }

        const values = valuesPart
            ? valuesPart.split('|').map((value) => decodeFilterValue(value).trim()).filter(Boolean)
            : [];
        const noValueOperator = operator === 'isNull' || operator === 'isNotNull';

        if (!noValueOperator && !values.length) {
            return [];
        }

        return [{
            name,
            operator,
            value: values,
        }];
    });
}

export function parseShareOverviewEventNames(raw: string | null | undefined): string[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map((value) => decodeFilterValue(value).trim())
        .filter(Boolean);
}

export function serializeShareOverviewFilters(filters: ShareOverviewFilter[]): string {
    return filters
        .map((filter) => {
            const values = filter.value.map((value) => encodeURIComponent(value)).join('|');
            return `${filter.name}~${filter.operator}~${values}`;
        })
        .join(';');
}

export function serializeShareOverviewEventNames(events: string[]): string {
    return events.map((value) => encodeURIComponent(value)).join(',');
}

export function hasPageScopedFilter(filters: ShareOverviewFilter[]) {
    return filters.some((filter) => filter.name === 'origin' || filter.name === 'path' || filter.name === 'entry_path' || filter.name === 'exit_path');
}
