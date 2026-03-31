# 05 — Advanced Filter System

## Overview

Expand the current 7-dimension toggle filter system into a 25+ parameter filter system with multiple match types (equals, not_equals, contains, regex). This bridges the biggest feature gap between TrafficClaw and competitors like Rybbit (40+ filter params).

### Current state
- 7 dimensions: `country`, `device`, `channel`, `page`, `referrer`, `browser`, `os`
- Single filter type: exact match via `includes()`
- Toggle-based UI: click a table row to add/remove filter
- Client-side only: filters are applied post-fetch by ratio estimation
- Store: `web/src/stores/analyticsFilterStore.ts` (Zustand)

### Target state
- 25+ parameters across 5 categories (Core, URL, Geo, UTM, Advanced)
- 6 filter types: `equals`, `not_equals`, `contains`, `not_contains`, `regex`, `not_regex`
- Dedicated filter builder UI with parameter picker, type picker, value input
- Server-side filter support: pass filters to GA4 API as `dimensionFilter`
- Active filters as colored pills with edit/remove

---

## Filter Parameters

### Core (7) — already partially exist
| Parameter | GA4 Dimension | Notes |
|-----------|--------------|-------|
| `country` | `country` | Existing |
| `device_type` | `deviceCategory` | Existing as `device` |
| `os` | `operatingSystem` | Existing |
| `browser` | `browser` | Existing |
| `referrer` | `sessionSource` | Existing |
| `pathname` | `pagePath` | Existing as `page` |
| `page_title` | `pageTitle` | New |

### URL (4)
| Parameter | GA4 Dimension | Notes |
|-----------|--------------|-------|
| `hostname` | `hostname` | New |
| `entry_page` | `landingPagePlusQueryString` | New (data already fetched) |
| `exit_page` | `exitPagePlusQueryString` | New (requires new GA4 query) |
| `querystring` | `pagePathPlusQueryString` | New, filter with `contains` on `?` |

### Geo (4)
| Parameter | GA4 Dimension | Notes |
|-----------|--------------|-------|
| `city` | `city` | New (data already fetched) |
| `region` | `region` | New (data already fetched) |
| `language` | `language` | New (data already fetched) |
| `timezone` | N/A | Not available in GA4 — omit or derive from city |

### UTM (5)
| Parameter | GA4 Dimension | Notes |
|-----------|--------------|-------|
| `utm_source` | `sessionSource` | Maps to same as referrer |
| `utm_medium` | `sessionMedium` | New |
| `utm_campaign` | `sessionCampaignName` | New |
| `utm_term` | `sessionManualTerm` | New (GA4 may not populate for all) |
| `utm_content` | `sessionManualAdContent` | New (GA4 may not populate for all) |

### Advanced (3)
| Parameter | GA4 Dimension | Notes |
|-----------|--------------|-------|
| `browser_version` | `browserVersion` | New |
| `os_version` | `operatingSystemVersion` | New |
| `channel` | `sessionDefaultChannelGroup` | Existing |

### Total: 23 confirmed parameters
(timezone excluded — not natively available in GA4)

---

## Filter Types

| Type | Label | Description | GA4 `stringFilter.matchType` |
|------|-------|-------------|------------------------------|
| `equals` | is | Exact match | `EXACT` |
| `not_equals` | is not | Exact negative match | `EXACT` (with `not` wrapper) |
| `contains` | contains | Substring match | `CONTAINS` |
| `not_contains` | doesn't contain | Negative substring | `CONTAINS` (with `not` wrapper) |
| `regex` | matches regex | Regular expression | `FULL_REGEXP` |
| `not_regex` | doesn't match regex | Negative regex | `FULL_REGEXP` (with `not` wrapper) |

### GA4 API Filter Mapping

GA4 Data API v1 supports these filter constructs:

```typescript
// Single filter (positive)
{
  filter: {
    fieldName: 'country',
    stringFilter: {
      matchType: 'EXACT',      // or 'CONTAINS', 'BEGINS_WITH', 'FULL_REGEXP'
      value: 'United States',
      caseSensitive: false,
    }
  }
}

// Negated filter
{
  notExpression: {
    filter: {
      fieldName: 'country',
      stringFilter: { matchType: 'EXACT', value: 'India' }
    }
  }
}

// Multiple filters (AND)
{
  andGroup: {
    expressions: [
      { filter: { fieldName: 'country', stringFilter: { matchType: 'EXACT', value: 'US' } } },
      { filter: { fieldName: 'deviceCategory', stringFilter: { matchType: 'EXACT', value: 'mobile' } } },
    ]
  }
}

// In-list filter (OR within same dimension)
{
  filter: {
    fieldName: 'country',
    inListFilter: {
      values: ['United States', 'Canada', 'United Kingdom'],
      caseSensitive: false,
    }
  }
}
```

### Optimization: Use `inListFilter` for multiple equals on same dimension

When a user adds multiple `equals` filters for the same parameter (e.g., country = US OR country = UK), collapse them into a single `inListFilter` instead of separate `andGroup` entries.

---

## Store Redesign

### New types: `web/src/stores/analyticsFilterStore.ts`

```typescript
import { create } from 'zustand';

// ─── Filter Types ───

export type FilterMatchType =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'regex'
  | 'not_regex';

export interface AdvancedFilter {
  id: string;                    // Unique ID (nanoid or crypto.randomUUID)
  parameter: FilterParameter;    // Which dimension
  matchType: FilterMatchType;    // How to match
  value: string;                 // The filter value
}

export type FilterParameter =
  // Core
  | 'country'
  | 'device_type'
  | 'os'
  | 'browser'
  | 'referrer'
  | 'pathname'
  | 'page_title'
  // URL
  | 'hostname'
  | 'entry_page'
  | 'exit_page'
  | 'querystring'
  // Geo
  | 'city'
  | 'region'
  | 'language'
  // UTM
  | 'utm_source'
  | 'utm_medium'
  | 'utm_campaign'
  | 'utm_term'
  | 'utm_content'
  // Advanced
  | 'browser_version'
  | 'os_version'
  | 'channel';

// Map filter parameters to GA4 dimension names
export const PARAMETER_TO_GA4_DIMENSION: Record<FilterParameter, string> = {
  country: 'country',
  device_type: 'deviceCategory',
  os: 'operatingSystem',
  browser: 'browser',
  referrer: 'sessionSource',
  pathname: 'pagePath',
  page_title: 'pageTitle',
  hostname: 'hostname',
  entry_page: 'landingPagePlusQueryString',
  exit_page: 'exitPagePlusQueryString',
  querystring: 'pagePathPlusQueryString',
  city: 'city',
  region: 'region',
  language: 'language',
  utm_source: 'sessionSource',
  utm_medium: 'sessionMedium',
  utm_campaign: 'sessionCampaignName',
  utm_term: 'sessionManualTerm',
  utm_content: 'sessionManualAdContent',
  browser_version: 'browserVersion',
  os_version: 'operatingSystemVersion',
  channel: 'sessionDefaultChannelGroup',
};

// Human-readable labels for the UI
export const PARAMETER_LABELS: Record<FilterParameter, string> = {
  country: 'Country',
  device_type: 'Device Type',
  os: 'Operating System',
  browser: 'Browser',
  referrer: 'Referrer',
  pathname: 'Page Path',
  page_title: 'Page Title',
  hostname: 'Hostname',
  entry_page: 'Entry Page',
  exit_page: 'Exit Page',
  querystring: 'Query String',
  city: 'City',
  region: 'Region',
  language: 'Language',
  utm_source: 'UTM Source',
  utm_medium: 'UTM Medium',
  utm_campaign: 'UTM Campaign',
  utm_term: 'UTM Term',
  utm_content: 'UTM Content',
  browser_version: 'Browser Version',
  os_version: 'OS Version',
  channel: 'Channel',
};

// Group parameters for the dropdown UI
export const PARAMETER_GROUPS: { label: string; params: FilterParameter[] }[] = [
  {
    label: 'Core',
    params: ['country', 'device_type', 'os', 'browser', 'referrer', 'pathname', 'page_title'],
  },
  {
    label: 'URL',
    params: ['hostname', 'entry_page', 'exit_page', 'querystring'],
  },
  {
    label: 'Geo',
    params: ['city', 'region', 'language'],
  },
  {
    label: 'UTM',
    params: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'],
  },
  {
    label: 'Advanced',
    params: ['browser_version', 'os_version', 'channel'],
  },
];

export const MATCH_TYPE_LABELS: Record<FilterMatchType, string> = {
  equals: 'is',
  not_equals: 'is not',
  contains: 'contains',
  not_contains: "doesn't contain",
  regex: 'matches regex',
  not_regex: "doesn't match regex",
};

// ─── Store ───

interface FilterState {
  // Legacy filters (kept for backward compat during migration)
  filters: DashboardFilters;

  // New advanced filters
  advancedFilters: AdvancedFilter[];

  // Compare mode
  compareMode: boolean;

  // Legacy methods (keep during migration, then deprecate)
  setFilter: (dimension: keyof DashboardFilters, values: string[]) => void;
  toggleFilter: (dimension: keyof DashboardFilters, value: string, multi?: boolean) => void;
  clearFilter: (dimension: keyof DashboardFilters) => void;

  // New advanced filter methods
  addAdvancedFilter: (filter: Omit<AdvancedFilter, 'id'>) => void;
  updateAdvancedFilter: (id: string, updates: Partial<Omit<AdvancedFilter, 'id'>>) => void;
  removeAdvancedFilter: (id: string) => void;
  clearAllFilters: () => void;

  // Helpers
  setCompareMode: (on: boolean) => void;
  activeFilterCount: () => number;
  hasFilter: (dimension: keyof DashboardFilters, value: string) => boolean;

  // GA4 dimension filter builder
  buildGA4DimensionFilter: () => any | null;
}

// Legacy interface — keep during migration
export interface DashboardFilters {
  country: string[];
  device: string[];
  channel: string[];
  page: string[];
  referrer: string[];
  browser: string[];
  os: string[];
}

const EMPTY_FILTERS: DashboardFilters = {
  country: [],
  device: [],
  channel: [],
  page: [],
  referrer: [],
  browser: [],
  os: [],
};

export const useFilterStore = create<FilterState>((set, get) => ({
  filters: { ...EMPTY_FILTERS },
  advancedFilters: [],
  compareMode: false,

  // ─── Legacy methods (unchanged) ───
  setFilter: (dimension, values) =>
    set(state => ({
      filters: { ...state.filters, [dimension]: values },
    })),

  toggleFilter: (dimension, value, multi = false) =>
    set(state => {
      const current = state.filters[dimension];
      const exists = current.includes(value);
      let next: string[];
      if (multi) {
        next = exists ? current.filter(v => v !== value) : [...current, value];
      } else {
        next = exists && current.length === 1 ? [] : [value];
      }
      return { filters: { ...state.filters, [dimension]: next } };
    }),

  clearFilter: (dimension) =>
    set(state => ({
      filters: { ...state.filters, [dimension]: [] },
    })),

  // ─── New advanced filter methods ───
  addAdvancedFilter: (filter) =>
    set(state => ({
      advancedFilters: [
        ...state.advancedFilters,
        { ...filter, id: crypto.randomUUID() },
      ],
    })),

  updateAdvancedFilter: (id, updates) =>
    set(state => ({
      advancedFilters: state.advancedFilters.map(f =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),

  removeAdvancedFilter: (id) =>
    set(state => ({
      advancedFilters: state.advancedFilters.filter(f => f.id !== id),
    })),

  clearAllFilters: () =>
    set({
      filters: { ...EMPTY_FILTERS },
      advancedFilters: [],
    }),

  setCompareMode: (on) => set({ compareMode: on }),

  activeFilterCount: () => {
    const s = get();
    const legacyCount = Object.values(s.filters).reduce(
      (sum, arr) => sum + (arr.length > 0 ? 1 : 0), 0
    );
    return legacyCount + s.advancedFilters.length;
  },

  hasFilter: (dimension, value) => {
    return get().filters[dimension].includes(value);
  },

  // ─── Build GA4 dimensionFilter from advancedFilters ───
  buildGA4DimensionFilter: () => {
    const { advancedFilters } = get();
    if (advancedFilters.length === 0) return null;

    // Group equals filters by parameter for inListFilter optimization
    const equalsGroups = new Map<string, string[]>();
    const otherExpressions: any[] = [];

    for (const f of advancedFilters) {
      const ga4Dim = PARAMETER_TO_GA4_DIMENSION[f.parameter];
      if (!ga4Dim) continue;

      // Collapse multiple "equals" on same dimension into inListFilter
      if (f.matchType === 'equals') {
        const existing = equalsGroups.get(ga4Dim) || [];
        existing.push(f.value);
        equalsGroups.set(ga4Dim, existing);
        continue;
      }

      // Map match type to GA4 stringFilter.matchType
      const isNegated = f.matchType.startsWith('not_');
      const baseType = f.matchType.replace('not_', '') as 'equals' | 'contains' | 'regex';
      const ga4MatchType: Record<string, string> = {
        equals: 'EXACT',
        contains: 'CONTAINS',
        regex: 'FULL_REGEXP',
      };

      const filterExpr: any = {
        filter: {
          fieldName: ga4Dim,
          stringFilter: {
            matchType: ga4MatchType[baseType] || 'EXACT',
            value: f.value,
            caseSensitive: false,
          },
        },
      };

      if (isNegated) {
        otherExpressions.push({ notExpression: filterExpr });
      } else {
        otherExpressions.push(filterExpr);
      }
    }

    // Convert equals groups to inListFilter or single filter
    for (const [dim, values] of equalsGroups.entries()) {
      if (values.length === 1) {
        otherExpressions.push({
          filter: {
            fieldName: dim,
            stringFilter: {
              matchType: 'EXACT',
              value: values[0],
              caseSensitive: false,
            },
          },
        });
      } else {
        otherExpressions.push({
          filter: {
            fieldName: dim,
            inListFilter: {
              values,
              caseSensitive: false,
            },
          },
        });
      }
    }

    if (otherExpressions.length === 0) return null;
    if (otherExpressions.length === 1) return otherExpressions[0];

    return {
      andGroup: {
        expressions: otherExpressions,
      },
    };
  },
}));

// Legacy helper — keep during migration
export function passesFilters(
  filters: DashboardFilters,
  row: { country?: string; device?: string; channel?: string; page?: string; referrer?: string; browser?: string; os?: string }
): boolean {
  if (filters.country.length > 0 && row.country && !filters.country.includes(row.country)) return false;
  if (filters.device.length > 0 && row.device && !filters.device.includes(row.device)) return false;
  if (filters.channel.length > 0 && row.channel && !filters.channel.includes(row.channel)) return false;
  if (filters.page.length > 0 && row.page && !filters.page.includes(row.page)) return false;
  if (filters.referrer.length > 0 && row.referrer && !filters.referrer.includes(row.referrer)) return false;
  if (filters.browser.length > 0 && row.browser && !filters.browser.includes(row.browser)) return false;
  if (filters.os.length > 0 && row.os && !filters.os.includes(row.os)) return false;
  return true;
}
```

---

## Server-Side Filter Integration

### Passing filters to GA4 API

The filter flow: UI -> Store -> API route -> `runGAReport()` -> GA4

#### Step 1: Send filters with the API request

In `useDashboardData.ts`, serialize the advanced filters into the API URL:

```typescript
export function useAnalyticsData(
  section: string,
  propertyId?: string,
  enabled = true,
  range = '30d',
  dimensionFilter?: any  // GA4 dimensionFilter object
) {
  const query = propertyId ? `&propertyId=${propertyId}` : '';
  const filterParam = dimensionFilter
    ? `&dimensionFilter=${encodeURIComponent(JSON.stringify(dimensionFilter))}`
    : '';
  const url = (section && enabled)
    ? `/api/analytics?section=${section}${query}&range=${range}${filterParam}`
    : null;
  const { data, error, isLoading, mutate } = useRegisteredSWR(url, {
    dedupingInterval: 60000,
  });
  return { data, isLoading, isError: error, refresh: mutate };
}
```

#### Step 2: Parse filters in the API route

In `web/src/app/api/analytics/route.ts`:

```typescript
const dimensionFilterParam = url.searchParams.get('dimensionFilter');
const dimensionFilter = dimensionFilterParam
  ? JSON.parse(dimensionFilterParam)
  : null;

// Pass to fetchAnalyticsDashboard
const data = await cachedFetch(cacheKey, async () => {
  return fetchAnalyticsDashboard(accessToken, propertyId, range, dimensionFilter);
}, CACHE_TTL.analytics);
```

#### Step 3: Apply filters in `runGAReport()`

Update `runGAReport()` in `googleApi.ts` to accept an optional `dimensionFilter`:

```typescript
export async function runGAReport(
  token: string,
  propertyId: string,
  dims: string[],
  mets: string[],
  startDate: string,
  endDate: string,
  limit = 100,
  orderByMetric?: string,
  dimensionFilter?: any  // New parameter
) {
  const body: any = {
    dateRanges: [{ startDate, endDate }],
    metrics: mets.map(m => ({ name: m })),
    dimensions: dims.map(d => ({ name: d })),
    limit,
  };
  if (orderByMetric) {
    body.orderBys = [{ metric: { metricName: orderByMetric }, desc: true }];
  }
  if (dimensionFilter) {
    body.dimensionFilter = dimensionFilter;
  }
  return gaFetch(`${GA_DATA_BASE}/${cleanPropertyId(propertyId)}:runReport`, token, body);
}
```

Update `fetchAnalyticsDashboard()` to pass `dimensionFilter` through to all `runGAReport()` calls:

```typescript
export async function fetchAnalyticsDashboard(
  token: string,
  propertyId: string,
  range = '30d',
  dimensionFilter?: any  // New parameter
) {
  // ... existing setup ...

  const [currentTotals, prevTotals, ...rest] = await Promise.all([
    runGAReport(token, pid, ['date'], [...], startDate, endDate, 1000, undefined, dimensionFilter),
    runGAReport(token, pid, ['date'], [...], prevStartDate, prevEndDate, 1000, undefined, dimensionFilter),
    // ... all other queries also get dimensionFilter ...
  ]);
```

### Cache key invalidation

The cache key in the API route must include the filter hash so different filter combinations get different cached responses:

```typescript
const filterHash = dimensionFilter
  ? '-f' + Buffer.from(JSON.stringify(dimensionFilter)).toString('base64url').slice(0, 16)
  : '';
const cacheKey = `analytics-${section}-${propertyId}-${range}${filterHash}`;
```

---

## UI Components

### Filter Builder Button + Dropdown

File: `web/src/components/analytics/FilterBuilder.tsx`

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, Plus, X, ChevronRight, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useFilterStore,
  PARAMETER_GROUPS,
  PARAMETER_LABELS,
  MATCH_TYPE_LABELS,
  type FilterParameter,
  type FilterMatchType,
} from '@/stores/analyticsFilterStore';

// ─── Filter Builder Dropdown ───

type BuilderStep = 'parameter' | 'matchType' | 'value';

export default function FilterBuilder() {
  const { advancedFilters, addAdvancedFilter, removeAdvancedFilter, clearAllFilters, activeFilterCount } = useFilterStore();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<BuilderStep>('parameter');
  const [selectedParam, setSelectedParam] = useState<FilterParameter | null>(null);
  const [selectedMatchType, setSelectedMatchType] = useState<FilterMatchType>('equals');
  const [filterValue, setFilterValue] = useState('');
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        resetBuilder();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const resetBuilder = () => {
    setStep('parameter');
    setSelectedParam(null);
    setSelectedMatchType('equals');
    setFilterValue('');
    setSearch('');
  };

  const handleSelectParam = (param: FilterParameter) => {
    setSelectedParam(param);
    setStep('matchType');
  };

  const handleSelectMatchType = (type: FilterMatchType) => {
    setSelectedMatchType(type);
    setStep('value');
  };

  const handleApplyFilter = () => {
    if (!selectedParam || !filterValue.trim()) return;
    addAdvancedFilter({
      parameter: selectedParam,
      matchType: selectedMatchType,
      value: filterValue.trim(),
    });
    resetBuilder();
    // Don't close — user may want to add more filters
  };

  const count = activeFilterCount();

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(!open); if (!open) resetBuilder(); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition ${
          count > 0
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-white/[0.03] border-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1]'
        }`}
      >
        <Filter className="w-3 h-3" />
        <span>Filter</span>
        {count > 0 && (
          <span className="ml-0.5 w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-[#0a0a0f] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/40 min-w-[300px] overflow-hidden">

          {/* Step 1: Parameter Picker */}
          {step === 'parameter' && (
            <div className="max-h-[400px] overflow-y-auto">
              {/* Search */}
              <div className="sticky top-0 bg-[#0a0a0f] p-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.04] rounded-lg">
                  <Search className="w-3.5 h-3.5 text-zinc-500" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search parameters..."
                    className="bg-transparent text-xs text-white placeholder:text-zinc-600 outline-none flex-1"
                    autoFocus
                  />
                </div>
              </div>

              {PARAMETER_GROUPS.map(group => {
                const filtered = group.params.filter(p =>
                  PARAMETER_LABELS[p].toLowerCase().includes(search.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <div key={group.label}>
                    <div className="px-3 pt-2.5 pb-1">
                      <span className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>
                    {filtered.map(param => (
                      <button
                        key={param}
                        onClick={() => handleSelectParam(param)}
                        className="w-full text-left px-3 py-2 text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.04] transition flex items-center justify-between"
                      >
                        <span>{PARAMETER_LABELS[param]}</span>
                        <ChevronRight className="w-3 h-3 text-zinc-600" />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 2: Match Type Picker */}
          {step === 'matchType' && selectedParam && (
            <div>
              <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                <button onClick={() => setStep('parameter')} className="text-zinc-500 hover:text-white transition text-xs">
                  &larr;
                </button>
                <span className="text-xs font-medium text-white">{PARAMETER_LABELS[selectedParam]}</span>
              </div>
              {(Object.entries(MATCH_TYPE_LABELS) as [FilterMatchType, string][]).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => handleSelectMatchType(type)}
                  className={`w-full text-left px-3 py-2 text-[11px] transition flex items-center justify-between ${
                    type.startsWith('not_')
                      ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.04]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{label}</span>
                  <ChevronRight className="w-3 h-3 text-zinc-600" />
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Value Input */}
          {step === 'value' && selectedParam && (
            <div>
              <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                <button onClick={() => setStep('matchType')} className="text-zinc-500 hover:text-white transition text-xs">
                  &larr;
                </button>
                <span className="text-xs text-zinc-400">
                  {PARAMETER_LABELS[selectedParam]}
                </span>
                <span className="text-[10px] text-zinc-600">
                  {MATCH_TYPE_LABELS[selectedMatchType]}
                </span>
              </div>
              <div className="p-3">
                <input
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleApplyFilter()}
                  placeholder={
                    selectedMatchType.includes('regex')
                      ? 'e.g. ^/blog/.*'
                      : 'Enter value...'
                  }
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/40 transition"
                  autoFocus
                />
                <button
                  onClick={handleApplyFilter}
                  disabled={!filterValue.trim()}
                  className="mt-2 w-full py-2 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          )}

          {/* Active filters list (always visible at bottom) */}
          {advancedFilters.length > 0 && (
            <div className="border-t border-white/[0.06] p-2">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">
                  Active ({advancedFilters.length})
                </span>
                <button
                  onClick={clearAllFilters}
                  className="text-[10px] text-zinc-600 hover:text-zinc-300 transition"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-1 max-h-[150px] overflow-y-auto">
                {advancedFilters.map(f => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] group ${
                      f.matchType.startsWith('not_')
                        ? 'bg-red-500/[0.06] text-red-400'
                        : 'bg-emerald-500/[0.06] text-emerald-400'
                    }`}
                  >
                    <span className="font-medium">{PARAMETER_LABELS[f.parameter]}</span>
                    <span className="text-zinc-500">{MATCH_TYPE_LABELS[f.matchType]}</span>
                    <span className="font-mono truncate max-w-[120px]">{f.value}</span>
                    <button
                      onClick={() => removeAdvancedFilter(f.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Active Filter Pills (in layout.tsx)

Replace the current filter bar in `layout.tsx` (lines 211-248) with one that shows both legacy and advanced filters:

```typescript
import FilterBuilder from '@/components/analytics/FilterBuilder';
import { PARAMETER_LABELS, MATCH_TYPE_LABELS } from '@/stores/analyticsFilterStore';

// In the header row, add FilterBuilder next to the Compare button:
<FilterBuilder />

// In the active filters bar, combine legacy + advanced:
{(activeFilterCount > 0 || advancedFilters.length > 0) && (
  <motion.div ...>
    <div className="flex items-center gap-2 pt-4 pb-1 flex-wrap">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
        <Filter className="w-3 h-3" />
        Filters
      </div>

      {/* Legacy filter pills (blue) */}
      {Object.entries(filters).map(([dim, values]) =>
        values.map((val: string) => (
          <motion.button key={`${dim}-${val}`} ... className="... bg-blue-500/[0.08] border-blue-500/20 text-blue-400 ...">
            <span className="capitalize">{dim}:</span> {val}
            <X className="w-3 h-3 ..." />
          </motion.button>
        ))
      )}

      {/* Advanced filter pills */}
      {advancedFilters.map(f => (
        <motion.button
          key={f.id}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={() => removeAdvancedFilter(f.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition group ${
            f.matchType.startsWith('not_')
              ? 'bg-red-500/[0.08] border-red-500/20 text-red-400 hover:bg-red-500/[0.12]'
              : 'bg-emerald-500/[0.08] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.12]'
          }`}
        >
          <span className="font-medium">{PARAMETER_LABELS[f.parameter]}</span>
          <span className="text-zinc-500">{MATCH_TYPE_LABELS[f.matchType]}</span>
          <span className="font-mono">{f.value}</span>
          <X className="w-3 h-3 opacity-50 group-hover:opacity-100 transition" />
        </motion.button>
      ))}

      <button onClick={clearAllFilters} className="text-[10px] text-zinc-600 hover:text-zinc-300 transition ml-1">
        Clear all
      </button>
    </div>
  </motion.div>
)}
```

### Pill color coding:
- **Green** (`emerald-500/[0.08]`): positive filters (equals, contains, regex)
- **Red** (`red-500/[0.08]`): negative filters (not_equals, not_contains, not_regex)
- **Blue** (`blue-500/[0.08]`): legacy toggle filters (kept during migration)

---

## Migration Strategy

The migration from legacy to advanced filters happens in 3 phases to avoid breaking existing functionality.

### Phase 1: Add advanced filters alongside legacy (non-breaking)

1. Update `analyticsFilterStore.ts` with the new types, `advancedFilters` array, and methods
2. Add `FilterBuilder` component to the analytics layout header
3. Advanced filters display as pills but only affect the UI — no server-side filtering yet
4. Legacy toggle filters continue to work exactly as before (client-side ratio filtering)

### Phase 2: Server-side filter support

1. Add `dimensionFilter` parameter to `runGAReport()`
2. Add `dimensionFilter` parameter to `fetchAnalyticsDashboard()`
3. Update `useAnalyticsData()` to accept and serialize the filter
4. Update `api/analytics/route.ts` to parse and pass through the filter
5. In `analytics/page.tsx`, call `buildGA4DimensionFilter()` and pass to `useAnalyticsData()`
6. Advanced filters now apply server-side (accurate data) while legacy filters still apply client-side

### Phase 3: Migrate legacy to advanced (breaking)

1. When a user clicks a table row to filter, create an `AdvancedFilter` with `equals` match type instead of toggling the legacy filter
2. Remove the legacy `filters` object and `toggleFilter`/`setFilter`/`clearFilter` methods
3. Remove the `passesFilters()` helper and client-side ratio estimation
4. All filtering is now server-side via GA4 `dimensionFilter`
5. Update `DrilldownDrawer` and any other components that read from legacy filters

---

## Implementation Steps (Phase 1 — immediate)

1. Update `web/src/stores/analyticsFilterStore.ts` with the new types and store shape shown above
2. Create `web/src/components/analytics/FilterBuilder.tsx` with the dropdown component
3. In `web/src/app/(dashboard)/dashboard/analytics/layout.tsx`:
   - Import `FilterBuilder`
   - Add `<FilterBuilder />` in the header controls row (next to Compare button)
   - Update the active filters bar to show advanced filter pills
4. Test that legacy toggle filters still work
5. Test that new advanced filters appear as pills and can be added/removed

### Phase 2 (follow-up)

6. Update `web/src/lib/googleApi.ts`: add `dimensionFilter` param to `runGAReport()` and `fetchAnalyticsDashboard()`
7. Update `web/src/lib/useDashboardData.ts`: add `dimensionFilter` param to `useAnalyticsData()`
8. Update `web/src/app/api/analytics/route.ts`: parse `dimensionFilter` from query string
9. In `web/src/app/(dashboard)/dashboard/analytics/page.tsx`:
   - Call `buildGA4DimensionFilter()` from the store
   - Pass result to `useAnalyticsData()`
10. Update cache key generation to include filter hash
11. Test with real GA4 property: apply country filter, verify data changes server-side

---

## GA4 API Limitations and Workarounds

### Not all dimensions work with all filters
Some GA4 dimensions only support `EXACT` match. If a user tries `regex` on `deviceCategory`, the API may return an error. Handle this by:
- Restricting match type options per parameter in the UI
- Adding a `supportedMatchTypes` array to each parameter definition

```typescript
export const PARAMETER_CONFIG: Record<FilterParameter, {
  ga4Dimension: string;
  label: string;
  supportedMatchTypes: FilterMatchType[];
}> = {
  country: {
    ga4Dimension: 'country',
    label: 'Country',
    supportedMatchTypes: ['equals', 'not_equals', 'contains', 'not_contains'],
    // Regex not reliable for country names
  },
  pathname: {
    ga4Dimension: 'pagePath',
    label: 'Page Path',
    supportedMatchTypes: ['equals', 'not_equals', 'contains', 'not_contains', 'regex', 'not_regex'],
  },
  device_type: {
    ga4Dimension: 'deviceCategory',
    label: 'Device Type',
    supportedMatchTypes: ['equals', 'not_equals'],
    // Only 3 values: desktop, mobile, tablet — regex/contains not useful
  },
  // ... etc.
};
```

### Rate limits
Each filter combination triggers a fresh set of GA4 API calls (14 parallel queries in `fetchAnalyticsDashboard`). The in-memory cache (`apiCache.ts`) prevents repeated calls for the same filter combo, but rapid filter changes could hit GA4 rate limits. Mitigate with:
- Debounce: 300ms delay before firing the API call when filters change
- SWR `dedupingInterval: 60000` (already set)
- Show a loading skeleton while debouncing

### Query string length
For complex filter combinations, the URL query string could get long. If it exceeds ~2000 characters, switch to POST for the API route or use a filter hash that maps to a server-side cache.

---

## Autocomplete (Future Enhancement)

A natural next step is to provide autocomplete suggestions in the value input (Step 3 of the builder). For parameters like `country`, `browser`, `os`, and `device_type`, we already have the breakdown data. We can:

1. Pass the current analytics data breakdown to the FilterBuilder
2. When the user selects `country` + `equals`, show a searchable list of countries from the fetched data
3. For free-text parameters (pathname, querystring), show recent/popular values

This is a Phase 3 enhancement — not required for the initial implementation.
