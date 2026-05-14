'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    Activity,
    ChartColumn,
    ChartNoAxesCombined,
    ChevronDown,
    ChevronUp,
    Eye,
    ExternalLink,
    Filter,
    Globe2,
    Map as MapIcon,
    MousePointer2,
    Search,
    Share2,
    TableProperties,
    Timer,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import AnimatedCounter from '@/components/analytics/AnimatedCounter';
import { CountryFlag } from '@/components/analytics/AnalyticsIcons';
import DatePicker, { getRangeLabel } from '@/components/DatePicker';
import { CITY_COORDS, COUNTRY_COORDS } from '@/lib/globeUtils';
import Logo, { LogoIcon } from '@/components/Logo';
import DashboardHoverSurface from '@/components/dashboard/DashboardHoverSurface';
import type { GlobeVisitor } from '@/components/globe/RealtimeGlobeMaplibre';
import {
    OverviewCountryFlag,
    OverviewValueIcon,
} from '@/components/share-overview/openpanel/OverviewIcons';
import {
    useShareOverviewState,
    type ShareOverviewEventTab,
    type ShareOverviewGeoTab,
    type ShareOverviewPagesTab,
    type ShareOverviewRange,
    type ShareOverviewSourcesTab,
    type ShareOverviewTechTab,
} from '@/components/share-overview/openpanel/useShareOverviewState';
import {
    SHARE_OVERVIEW_FILTER_NAMES,
    hasPageScopedFilter,
    serializeShareOverviewEventNames,
    serializeShareOverviewFilters,
    type ShareOverviewFilter,
} from '@/lib/shareOverviewFilters';
import {
    DEFAULT_SHARE_ACCENT,
    DEFAULT_SECTION_ORDER,
    type NormalizedShareConfig,
    type ShareSectionId,
    type ShareBranding,
} from '@/lib/shareTypes';

/* Live-preview overrides posted from the Share Studio (same-origin postMessage).
 * Any subset of these fields shadows the persisted config without touching the DB. */
type StudioPreviewOverrides = {
    accentColor?: string | null;
    branding?: Partial<ShareBranding>;
    sectionOrder?: ShareSectionId[];
    sectionVisibility?: Partial<Record<ShareSectionId, boolean>>;
};

const STUDIO_PREVIEW_MESSAGE_TYPE = 'tc-share-studio-preview';

const WorldMap = dynamic(() => import('@/components/analytics/WorldMap'), { ssr: false });
const RealtimeGlobeMaplibre = dynamic(() => import('@/components/globe/RealtimeGlobeMaplibre'), { ssr: false });

const CHART_COLORS = ['#3ba974', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171', '#2dd4bf', '#fb7185', '#facc15'];
const OVERVIEW_PRIMARY_ACCENT = '#14C4E1';
const OVERVIEW_PRIMARY_ACCENT_ACTIVE = '#14C4E1';
const OVERVIEW_PRIMARY_ACCENT_PREVIEW = '#14C4E1';
const OVERVIEW_PRIMARY_GLOW = 'rgba(20,196,225,0.22)';
const OVERVIEW_COMPARISON_ACCENT = '#FFFFFF';
const TALL_MINI_BAR_METRICS = new Set(['avg_session_duration', 'new_users']);
const METRICS = [
    { key: 'unique_visitors', label: 'Active Users', unit: 'number', invert: false, icon: Users, accent: '#45c48c' },
    { key: 'total_sessions', label: 'Sessions', unit: 'number', invert: false, icon: Activity, accent: '#38bdf8' },
    { key: 'total_screen_views', label: 'Pageviews', unit: 'number', invert: false, icon: MousePointer2, accent: '#60a5fa' },
    { key: 'views_per_session', label: 'Pages per session', unit: 'number', invert: false, icon: ChartNoAxesCombined, accent: '#f59e0b' },
    { key: 'bounce_rate', label: 'Bounce Rate', unit: 'percent', invert: true, icon: Filter, accent: '#fb7185' },
    { key: 'avg_session_duration', label: 'Session Duration', unit: 'duration', invert: false, icon: Timer, accent: '#a78bfa' },
    { key: 'new_users', label: 'New Users', unit: 'number', invert: false, icon: UserPlus, accent: '#22c55e' },
] as const;
const SOURCES_WIDGETS: Array<{ key: ShareOverviewSourcesTab; label: string }> = [
    { key: 'referrer_name', label: 'Refs' },
    { key: 'referrer', label: 'Urls' },
    { key: 'referrer_type', label: 'Types' },
    { key: 'utm_source', label: 'Source' },
    { key: 'utm_medium', label: 'Medium' },
    { key: 'utm_campaign', label: 'Campaign' },
    { key: 'utm_term', label: 'Term' },
    { key: 'utm_content', label: 'Content' },
];
const PAGES_WIDGETS: Array<{ key: ShareOverviewPagesTab; label: string }> = [
    { key: 'page', label: 'Pages' },
    { key: 'entry', label: 'Entries' },
    { key: 'exit', label: 'Exits' },
];
const TECH_WIDGETS: Array<{ key: ShareOverviewTechTab; label: string }> = [
    { key: 'device', label: 'Devices' },
    { key: 'browser', label: 'Browser' },
    { key: 'browser_version', label: 'Browser Ver' },
    { key: 'os', label: 'OS' },
    { key: 'os_version', label: 'OS Ver' },
    { key: 'brand', label: 'Brand' },
    { key: 'model', label: 'Model' },
];
const GEO_WIDGETS: Array<{ key: ShareOverviewGeoTab; label: string }> = [
    { key: 'country', label: 'Countries' },
    { key: 'region', label: 'Regions' },
    { key: 'city', label: 'Cities' },
];
const EVENT_WIDGETS: Array<{ key: ShareOverviewEventTab; label: string }> = [
    { key: 'events', label: 'Events' },
    { key: 'conversions', label: 'Conversions' },
    { key: 'link_out', label: 'Link out' },
];
const FILTER_LABELS: Record<string, string> = {
    referrer_name: 'Referrer name',
    referrer: 'URL',
    referrer_type: 'Type',
    utm_source: 'Source',
    utm_medium: 'Medium',
    utm_campaign: 'Campaign',
    utm_term: 'Term',
    utm_content: 'Content',
    device: 'Device',
    browser: 'Browser',
    browser_version: 'Browser Version',
    os: 'OS',
    os_version: 'OS Version',
    brand: 'Brand',
    model: 'Model',
    country: 'Country',
    region: 'Region',
    city: 'City',
    origin: 'Origin',
    path: 'Path',
    entry_path: 'Entry',
    exit_path: 'Exit',
    name: 'Event',
};

type StatsSeriesPoint = Record<string, number | string>;
type StatsResponse = {
    metrics: Record<string, number>;
    series: StatsSeriesPoint[];
};
type GenericItem = { prefix?: string; name: string; sessions: number; pageviews: number; revenue?: number };
type TopGenericResponse = { supported: boolean; label: string; primaryMetric?: 'sessions' | 'pageviews'; items: GenericItem[] };
type TopGenericSeriesResponse = {
    supported: boolean;
    label: string;
    primaryMetric?: 'sessions' | 'pageviews';
    items: Array<GenericItem & { data: Array<{ date: string; sessions: number; pageviews: number; revenue?: number }> }>;
};
type TopPagesResponse = {
    supported: boolean;
    items: Array<{
        origin: string;
        path: string;
        title: string;
        sessions: number;
        pageviews: number;
        revenue?: number;
        bounceRate: number;
        avgSessionDuration: number;
    }>;
};
type TopEventsResponse = {
    events: Array<{ id: string; name: string; count: number }>;
    conversions: Array<{ id: string; name: string; count: number }>;
    linkOut: Array<{ id: string; name: string; count: number }>;
    supported: { conversions: boolean; linkOut: boolean };
};
type LiveResponse = {
    activeUsers: number;
    minuteCounts: Array<{ minute: string; sessionCount: number; visitorCount: number; timestamp: number; time: string; referrers: Array<{ referrer: string; count: number }> }>;
    referrers: Array<{ referrer: string; count: number }>;
    byCountry: Array<{ country: string; users: number }>;
    byCity: Array<{ city: string; country: string; users: number }>;
    byPage: Array<{ page: string; users: number }>;
};
type LiveVisitorsResponse = {
    activeUsers: number;
};
type LiveOverviewResponse = LiveResponse | LiveVisitorsResponse;
type LiveMiniBarPoint = {
    minute: string;
    sessionCount: number;
    visitorCount: number;
    timestamp: number;
    time: string;
    referrers: Array<{ referrer: string; count: number }>;
};

function hasLiveBreakdown(data?: LiveOverviewResponse): data is LiveResponse {
    return Boolean(data && 'minuteCounts' in data);
}

type SharedOverviewMode = 'share' | 'dashboard';

type OverviewRuntime = {
    mode: SharedOverviewMode;
    queryKey: string;
    apiBasePath: string;
    baseParams?: Record<string, string | undefined>;
    siteUrl?: string;
    demoMode?: boolean;
    views: number;
    embedMode?: boolean;
    initialRange?: string;
    onRangeChange?: (value: string) => void;
    onShareDashboard?: () => void;
    config?: NormalizedShareConfig | null;
    /** When true, the iframe-only "[Logo] TrafficClaw" strip is suppressed.
     *  Server-side gated by an HMAC signature on the `_b` URL param so
     *  only the marketing site can flip it. Customer embeds never carry
     *  the signature → they always see the watermark. */
    hideOwnerLogo?: boolean;
};

const OverviewRuntimeContext = createContext<OverviewRuntime | null>(null);

/**
 * Live accent color, merged from the persisted share config + any Studio
 * postMessage overrides. Lives in its own context so child components
 * (mini-bar shapes, line charts, KPI dots, etc.) all consume the SAME
 * up-to-the-millisecond value — previously each consumer read
 * runtime.config?.theme.accentColor directly, which only refreshes after
 * Save and so the live preview only updated the chart line (which read
 * `accentColor` from the merged calc) while the mini-bars and tile
 * sparklines stayed hardcoded blue.
 */
const ShareAccentContext = createContext<string>('#14C4E1');
function useShareAccent() {
    return useContext(ShareAccentContext);
}

/**
 * Convert a #RRGGBB hex to an `rgba(r,g,b,a)` string. Used by the mini-bar
 * renderers to shade the accent color at varying opacities so the
 * left-to-right depth effect persists across whatever color the user
 * picked in the Studio. Falls back to the input as-is if the format
 * doesn't parse (e.g. an `rgb()` already came in).
 */
function withAccentAlpha(hex: string, alpha: number): string {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return hex;
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r},${g},${b},${a})`;
}

const LIVE_DATA_POLL_INTERVAL_MS = 15_000;
const LIVE_RECONCILE_INTERVAL_MS = 60_000;
const OVERVIEW_QUERY_STALE_MS = 30_000;
const OVERVIEW_TABLE_ROW_LIMIT = 15;
const OVERVIEW_MINI_BAR_COUNT = 14;
const OVERVIEW_LIVE_BAR_COUNT = 12;

function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}

function useOverviewRuntime() {
    const runtime = useContext(OverviewRuntimeContext);
    if (!runtime) {
        throw new Error('Overview runtime missing');
    }
    return runtime;
}

function fetchJson<T>(url: string): Promise<T> {
    return fetch(url).then(async (response) => {
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }

        return response.json();
    });
}

function buildSearch({
    filters,
    events,
    extra,
}: {
    filters: ShareOverviewFilter[];
    events?: string[];
    extra?: Record<string, string | undefined>;
}) {
    const search = new URLSearchParams();
    if (filters.length) {
        search.set('f', serializeShareOverviewFilters(filters));
    }
    if (events?.length) {
        search.set('events', serializeShareOverviewEventNames(events));
    }

    Object.entries(extra || {}).forEach(([key, value]) => {
        if (value) {
            search.set(key, value);
        }
    });

    return search.toString();
}

function buildOverviewUrl(
    runtime: OverviewRuntime,
    endpoint: string,
    {
        filters,
        events,
        extra,
    }: {
        filters: ShareOverviewFilter[];
        events?: string[];
        extra?: Record<string, string | undefined>;
    },
) {
    const search = buildSearch({
        filters,
        events,
        extra: {
            ...(runtime.baseParams || {}),
            ...(extra || {}),
        },
    });
    return `${runtime.apiBasePath}/${endpoint}${search ? `?${search}` : ''}`;
}

function shortNumber(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString('en-US');
}

function formatMetricValue(value: number, unit: string) {
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 1000 ? 0 : 2 }).format(value);
    if (unit === 'duration') {
        const minutes = Math.floor(value / 60);
        const seconds = Math.round(value % 60);
        return `${minutes}m ${seconds}s`;
    }
    return shortNumber(value);
}

function bucketItems<T>(items: T[], targetCount: number) {
    if (items.length <= targetCount) {
        return items.map((item) => [item]);
    }

    return Array.from({ length: targetCount }, (_, bucketIndex) => {
        const start = Math.floor((bucketIndex * items.length) / targetCount);
        const end = Math.floor(((bucketIndex + 1) * items.length) / targetCount);
        return items.slice(start, Math.max(start + 1, end));
    }).filter((bucket) => bucket.length > 0);
}

function average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateMetricMiniSeries(
    data: StatsSeriesPoint[],
    metricKey: string,
    targetCount = OVERVIEW_MINI_BAR_COUNT,
) {
    const points = data.map((point) => ({
        current: getMetricSeriesValue(point, metricKey),
        previous: getMetricSeriesValue(point, `prev_${metricKey}`),
        date: String(point.date),
    }));

    return bucketItems(points, targetCount).map((bucket) => {
        const lastPoint = bucket[bucket.length - 1];
        return {
            current: average(bucket.map((point) => point.current)),
            previous: average(bucket.map((point) => point.previous)),
            date: lastPoint.date,
        };
    });
}

function aggregateLiveMiniSeries(
    data: LiveResponse['minuteCounts'],
    targetCount = OVERVIEW_LIVE_BAR_COUNT,
): LiveMiniBarPoint[] {
    return bucketItems(data, targetCount).map((bucket) => {
        const firstPoint = bucket[0];
        const lastPoint = bucket[bucket.length - 1];
        const referrerTotals = new Map<string, number>();

        bucket.forEach((point) => {
            point.referrers.forEach((referrer) => {
                referrerTotals.set(referrer.referrer, (referrerTotals.get(referrer.referrer) || 0) + referrer.count);
            });
        });

        return {
            minute: lastPoint.minute,
            sessionCount: Math.round(average(bucket.map((point) => point.sessionCount))),
            visitorCount: Math.round(average(bucket.map((point) => point.visitorCount))),
            timestamp: lastPoint.timestamp,
            time:
                firstPoint.time === lastPoint.time
                    ? lastPoint.time
                    : `${firstPoint.time} - ${lastPoint.time}`,
            referrers: Array.from(referrerTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([referrer, count]) => ({ referrer, count })),
        };
    });
}

/**
 * Mini-bar tinting. Derives each bar's fill from the user's chosen accent
 * by varying opacity left→right (older bars dimmer, recent bars solid),
 * with a faint alternating shimmer so the gradient still reads as
 * individual bars. Previously this was six hardcoded cyan hex values —
 * which is why every Studio accent choice (Forest, Solar, Rose, etc.)
 * left the KPI sparklines stuck on the default blue.
 */
function miniBarColor(index: number, total: number, accent: string) {
    if (total <= 1) return withAccentAlpha(accent, 0.85);
    const progress = index / Math.max(total - 1, 1);
    if (progress >= 0.82) return withAccentAlpha(accent, index % 2 === 0 ? 1 : 0.88);
    if (progress >= 0.56) return withAccentAlpha(accent, index % 2 === 0 ? 0.78 : 0.66);
    return withAccentAlpha(accent, index % 2 === 0 ? 0.5 : 0.58);
}

type MiniBarShapeProps = {
    fill?: string;
    height?: number;
    width?: number;
    x?: number;
    y?: number;
};

function MiniBarShape({
    fill = OVERVIEW_PRIMARY_ACCENT,
    height = 0,
    width = 0,
    x = 0,
    y = 0,
}: MiniBarShapeProps) {
    if (width <= 0 || height <= 0) return null;

    const adjustedHeight = Math.max(height, 4);
    const adjustedY = y - (adjustedHeight - height);
    const visualWidth = Math.max(Math.min(width - 2, 12), 8);
    const visualX = x + (width - visualWidth) / 2;
    const radius = Math.min(visualWidth / 2, 6);
    const highlightHeight = Math.max(Math.min(adjustedHeight * 0.42, adjustedHeight), 4);

    return (
        <g>
            <rect
                x={visualX}
                y={adjustedY}
                width={visualWidth}
                height={adjustedHeight}
                rx={radius}
                fill={fill}
                opacity={0.96}
            />
            <rect
                x={visualX}
                y={adjustedY}
                width={visualWidth}
                height={highlightHeight}
                rx={radius}
                fill="#ffffff"
                opacity={0.08}
            />
        </g>
    );
}

function diffDirection(current: number, previous: number, invert = false) {
    if (!previous) return null;
    const raw = ((current - previous) / previous) * 100;
    if (!Number.isFinite(raw)) return null;
    const change = +raw.toFixed(1);
    return { change, positive: invert ? change <= 0 : change >= 0 };
}

function metricTone(diff: ReturnType<typeof diffDirection>, active: boolean, previewed: boolean) {
    if (diff?.positive) {
        return {
            solid: active ? OVERVIEW_PRIMARY_ACCENT_ACTIVE : previewed ? OVERVIEW_PRIMARY_ACCENT_PREVIEW : OVERVIEW_PRIMARY_ACCENT,
            muted: OVERVIEW_PRIMARY_GLOW,
        };
    }

    if (diff && !diff.positive) {
        return {
            solid: active ? '#FFB0BA' : previewed ? '#FF9BA8' : '#F87171',
            muted: 'rgba(248,113,113,0.2)',
        };
    }

    return {
        solid: active ? '#D9E5EC' : previewed ? '#C0D1DC' : '#7A8595',
        muted: 'rgba(148,163,184,0.18)',
    };
}

function normalizeTrendChange(diff: ReturnType<typeof diffDirection>, invert = false) {
    if (!diff) {
        return null;
    }

    const adjusted = invert ? -diff.change : diff.change;
    if (!Number.isFinite(adjusted)) {
        return null;
    }

    return +adjusted.toFixed(1);
}

function formatTrendChange(value: number | null) {
    if (value === null) {
        return '--';
    }

    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatDateLabel(value: string | number, interval: string) {
    const date = new Date(value);
    if (interval === 'hour') {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (interval === 'month') {
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMetricSeriesValue(point: StatsSeriesPoint, key: string) {
    const value = point[key];
    return typeof value === 'number' ? value : 0;
}

function normalizePagePath(path: string) {
    if (!path) {
        return '/';
    }

    return path.startsWith('/') ? path : `/${path}`;
}

function buildPageHref(origin?: string, path?: string, siteUrl?: string) {
    const normalizedPath = normalizePagePath(path || '/');

    if (origin && origin !== '(not set)') {
        const host = origin.startsWith('http://') || origin.startsWith('https://') ? origin : `https://${origin}`;
        return `${host.replace(/\/$/, '')}${normalizedPath}`;
    }

    if (siteUrl) {
        return `${siteUrl.replace(/\/$/, '')}${normalizedPath}`;
    }

    return normalizedPath;
}

function useDebouncedLiveValue(value: number, delay: number, reconcileMs: number) {
    const [displayValue, setDisplayValue] = useState(value);
    const latestValueRef = useRef(value);

    useEffect(() => {
        latestValueRef.current = value;
        const timeoutId = window.setTimeout(() => {
            setDisplayValue(value);
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [delay, value]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setDisplayValue(latestValueRef.current);
        }, reconcileMs);

        return () => window.clearInterval(intervalId);
    }, [reconcileMs]);

    return displayValue;
}

function iconForGenericValue(column: string, name: string) {
    return <OverviewValueIcon column={column} value={name} />;
}

function formatOverviewValueLabel(column: string, value: string) {
    if (!value) {
        return '(not set)';
    }

    if (column === 'referrer' || column === 'referrer_name' || column === 'origin') {
        return value
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/$/, '');
    }

    return value;
}

const OVERVIEW_TABLE_HEADER_BASE_CLASS = 'grid gap-3 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[12px] font-medium text-zinc-350';
const OVERVIEW_TABLE_ROW_BASE_CLASS = 'dashboard-hover-item group relative grid h-8 w-full items-center gap-3 overflow-hidden border-b border-white/[0.07] px-4 text-left transition';
const OVERVIEW_TABLE_FILL_BASE_CLASS = 'absolute left-0 top-[1px] bottom-[1px] rounded-r-[2px] transition';
const OVERVIEW_TABLE_VALUE_BASE_CLASS = 'relative z-10 text-right font-mono text-[13px] leading-none';

type GeoVisualizationMode = 'globe' | 'map';
const GEO_VISITOR_COLORS = ['#34d399', '#22d3ee', '#60a5fa', '#a78bfa', '#f59e0b', '#fb7185'] as const;
const COUNTRY_COORD_LOOKUP = new Map(
    Object.entries(COUNTRY_COORDS).map(([name, coords]) => [normalizeGeoLookupValue(name), coords]),
);
const CITY_COORD_LOOKUP = new Map(
    Object.entries(CITY_COORDS).map(([name, coords]) => [normalizeGeoLookupValue(name), coords]),
);
const GEO_ACTIVITY_ADJECTIVES = ['most', 'ruby', 'coral', 'silver', 'jade', 'bronze', 'violet', 'blue', 'golden', 'onyx'] as const;
const GEO_ACTIVITY_ANIMALS = ['tiger', 'wolf', 'falcon', 'fox', 'lynx', 'bear', 'orca', 'lark', 'koala', 'panther'] as const;
const GEO_ACTIVITY_AGES = ['a few seconds ago', '24 seconds ago', '36 seconds ago', '52 seconds ago', '1 min ago', '2 min ago'] as const;

type ShareGeoActivityItem = {
    id: string;
    name: string;
    country: string;
    city: string;
    page: string;
    event: 'visited' | 'exited to';
    exitLabel?: string;
    ageLabel: string;
    warmth: number;
    estValue: string;
    avatarColor: string;
    avatarInitial: string;
};

type ShareGeoInsights = {
    topCountries: Array<{ country: string; users: number }>;
    topReferrers: Array<{ referrer: string; count: number }>;
    activityFeed: ShareGeoActivityItem[];
    estTotalValue: number;
};

function normalizeGeoLookupValue(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function getGeoLookupCoords(value: string, lookup: Map<string, [number, number]>) {
    return lookup.get(normalizeGeoLookupValue(value));
}

function hashString(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function getGeoVisitorColor(value: string) {
    return GEO_VISITOR_COLORS[hashString(value) % GEO_VISITOR_COLORS.length];
}

function getGeoVisitorInitial(value: string) {
    const clean = value.trim().replace(/[^a-z0-9]/gi, '');
    return clean ? clean[0].toUpperCase() : '•';
}

function getGeoVisitorWarmth(users: number, maxUsers: number) {
    const ratio = maxUsers > 0 ? users / maxUsers : 0;
    return Math.max(0.2, Math.min(0.72, 0.18 + ratio * 0.62));
}

function getGeoActivityName(seed: string) {
    const hash = hashString(seed);
    return `${GEO_ACTIVITY_ADJECTIVES[hash % GEO_ACTIVITY_ADJECTIVES.length]} ${GEO_ACTIVITY_ANIMALS[(hash >> 3) % GEO_ACTIVITY_ANIMALS.length]}`;
}

function buildShareGeoInsights(data?: LiveResponse): ShareGeoInsights {
    const topCountries = (data?.byCountry || []).slice(0, 4);
    const topReferrers = (data?.referrers || []).slice(0, 4);
    const byCity = data?.byCity || [];
    const byPage = data?.byPage || [];
    const maxUsers = Math.max(1, ...byCity.map((row) => row.users), ...topCountries.map((row) => row.users));

    const activityFeed = byCity.slice(0, 6).map((row, index) => {
        const page = byPage[index % Math.max(byPage.length, 1)]?.page || '/';
        const referrer = topReferrers[index % Math.max(topReferrers.length, 1)]?.referrer || 'external';
        const warmth = getGeoVisitorWarmth(row.users, maxUsers);
        const estValueNumber = +(0.75 + row.users * 0.38 + warmth * 2.1).toFixed(2);
        const isExit = index % 4 === 3 && topReferrers.length > 0;
        const displayName = getGeoActivityName(`${row.city}-${row.country}-${index}`);

        return {
            id: `${normalizeGeoLookupValue(row.country)}:${normalizeGeoLookupValue(row.city)}:${index}`,
            name: displayName,
            country: row.country,
            city: row.city,
            page,
            event: isExit ? 'exited to' : 'visited',
            exitLabel: isExit ? formatOverviewValueLabel('referrer_name', referrer) : undefined,
            ageLabel: GEO_ACTIVITY_AGES[index] || `${(index + 1) * 18} seconds ago`,
            warmth,
            estValue: formatMetricValue(estValueNumber, 'currency'),
            avatarColor: getGeoVisitorColor(displayName),
            avatarInitial: getGeoVisitorInitial(displayName),
        } satisfies ShareGeoActivityItem;
    });

    const estTotalValue = activityFeed.reduce((sum, item) => sum + Number(item.estValue.replace(/[^0-9.]/g, '') || 0), 0);

    return {
        topCountries,
        topReferrers,
        activityFeed,
        estTotalValue,
    };
}

function buildRealtimeGeoVisualizationData(data?: LiveResponse) {
    const byCountry = (data?.byCountry || [])
        .filter((row) => row.country && row.users > 0)
        .map((row) => ({ country: row.country, users: row.users }));
    const byCity = (data?.byCity || [])
        .filter((row) => row.city && row.country && row.users > 0)
        .map((row) => ({ city: row.city, country: row.country, users: row.users }));
    const maxUsers = Math.max(
        1,
        ...byCountry.map((row) => row.users),
        ...byCity.map((row) => row.users),
    );
    const countriesWithMappedCities = new Set<string>();
    const visitors: GlobeVisitor[] = [];

    byCity.forEach((row) => {
        const coords = getGeoLookupCoords(row.city, CITY_COORD_LOOKUP);
        if (!coords) {
            return;
        }

        countriesWithMappedCities.add(normalizeGeoLookupValue(row.country));
        const label = `${row.city}, ${row.country}`;
        visitors.push({
            id: `city:${normalizeGeoLookupValue(row.country)}:${normalizeGeoLookupValue(row.city)}`,
            name: row.city,
            city: row.city,
            country: row.country,
            lat: coords[0],
            lng: coords[1],
            users: row.users,
            warmth: getGeoVisitorWarmth(row.users, maxUsers),
            avatarColor: getGeoVisitorColor(label),
            avatarInitial: getGeoVisitorInitial(row.city),
        });
    });

    byCountry.forEach((row) => {
        if (countriesWithMappedCities.has(normalizeGeoLookupValue(row.country))) {
            return;
        }

        const coords = getGeoLookupCoords(row.country, COUNTRY_COORD_LOOKUP);
        if (!coords) {
            return;
        }

        visitors.push({
            id: `country:${normalizeGeoLookupValue(row.country)}`,
            name: row.country,
            country: row.country,
            lat: coords[0],
            lng: coords[1],
            users: row.users,
            warmth: getGeoVisitorWarmth(row.users, maxUsers),
            avatarColor: getGeoVisitorColor(row.country),
            avatarInitial: getGeoVisitorInitial(row.country),
        });
    });

    return {
        byCountry,
        byCity,
        visitors,
    };
}

function OverviewInlineLabel({
    icon,
    label,
    prefix,
    selected = false,
    trailing,
}: {
    icon: ReactNode;
    label: string;
    prefix?: string | null;
    selected?: boolean;
    trailing?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            {icon}
            <div className="flex min-w-0 flex-1 items-center gap-1">
                {prefix ? (
                    <>
                        <span className="max-w-[44%] shrink-0 truncate text-[11px] leading-none text-zinc-500">{prefix}</span>
                        <span className="shrink-0 text-zinc-700">/</span>
                    </>
                ) : null}
                <span className={cx('min-w-0 flex-1 truncate text-[12px] leading-none md:text-[13px]', selected ? 'text-white' : 'text-zinc-100')}>
                    {label}
                </span>
                {trailing ? <span className="shrink-0 opacity-0 transition group-hover:opacity-100">{trailing}</span> : null}
            </div>
        </div>
    );
}

function QueryBoundaries({
    title,
    loading,
    error,
    empty,
    children,
}: {
    title?: string;
    loading: boolean;
    error: Error | null;
    empty?: boolean;
    children: ReactNode;
}) {
    if (loading) {
        return <div className="flex h-[358px] items-center justify-center text-sm text-zinc-500">Loading {title || 'data'}...</div>;
    }
    if (error) {
        return <div className="flex h-[358px] items-center justify-center px-4 text-center text-sm text-red-400/80">{error.message}</div>;
    }
    if (empty) {
        return <div className="flex h-[358px] items-center justify-center text-sm text-zinc-500">No data available</div>;
    }
    return <>{children}</>;
}

function Widget({
    className,
    children,
    tone = 'mixed',
}: {
    className?: string;
    children: ReactNode;
    tone?: 'emerald' | 'cyan' | 'mixed';
}) {
    return (
        <DashboardHoverSurface
            as="section"
            tone={tone}
            className={cx('overflow-hidden rounded-xl border border-white/[0.12] bg-[#10151b] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_12px_32px_rgba(0,0,0,0.16)]', className)}
        >
            {children}
        </DashboardHoverSurface>
    );
}

function WidgetHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
    return (
        <div className="border-b border-white/[0.08] bg-white/[0.02] px-3 py-2 sm:px-4 sm:py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-100">{title}</div>
                {children}
            </div>
        </div>
    );
}

function WidgetHeadSearchable<T extends string>({
    tabs,
    activeTab,
    onTabChange,
    searchValue,
    onSearchChange,
    searchPlaceholder,
    actions,
}: {
    tabs: Array<{ key: T; label: string; disabled?: boolean }>;
    activeTab: T;
    onTabChange: (value: T) => void;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="border-b border-white/[0.08] bg-white/[0.015]">
            <div className="flex flex-col gap-2 px-2 pb-1.5 pt-2 sm:flex-row sm:items-center sm:justify-between sm:px-2.5">
                <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[#10151b] to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[#10151b] to-transparent" />
                    <div className="flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                disabled={tab.disabled}
                                onClick={() => onTabChange(tab.key)}
                                className={cx(
                                    'dashboard-hover-chip shrink-0 rounded-md border border-transparent px-2 py-[5px] text-[12px] font-medium leading-none transition-colors',
                                    activeTab === tab.key && tab.disabled ? 'cursor-not-allowed border border-amber-500/20 bg-amber-500/[0.08] text-amber-200' : '',
                                    activeTab === tab.key && !tab.disabled ? 'border-white/[0.10] bg-white/[0.08] text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]' : '',
                                    activeTab !== tab.key && tab.disabled ? 'cursor-not-allowed text-zinc-700' : '',
                                    activeTab !== tab.key && !tab.disabled ? 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200' : '',
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                {actions ? <div className="flex shrink-0 justify-end sm:justify-start">{actions}</div> : null}
            </div>
            {onSearchChange ? (
                <label className="relative flex h-9 items-center border-t border-white/[0.06] bg-[#0d1217] px-2.5 sm:h-10 sm:px-3">
                    <Search className="mr-2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                        value={searchValue}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={searchPlaceholder || 'Search...'}
                        className="w-full bg-transparent text-[13px] text-zinc-200 outline-none placeholder:text-zinc-600"
                    />
                </label>
            ) : null}
        </div>
    );
}

function WidgetFooter({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cx(
                'flex min-h-9 flex-wrap items-center gap-2 border-t border-white/[0.09] bg-[#0d1217] px-2 py-1.5 text-[10px] text-zinc-400 sm:px-2.5',
                className,
            )}
        >
            {children}
        </div>
    );
}

function ShareGeoStatsCard({
    activeUsers,
    estTotalValue,
    topCountries,
    topReferrers,
}: {
    activeUsers: number;
    estTotalValue: number;
    topCountries: ShareGeoInsights['topCountries'];
    topReferrers: ShareGeoInsights['topReferrers'];
}) {
    return (
        <div className="flex h-full flex-col gap-3 px-4 py-3.5">
            <div className="flex items-center gap-2">
                <LogoIcon size={18} />
                <span className="text-[13px] font-bold tracking-tight text-white">TrafficClaw</span>
                <span className="rounded-md border border-cyan-400/10 bg-cyan-400/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-100/85">Real-time</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-300">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="font-medium text-zinc-200">
                    <AnimatedCounter value={activeUsers} className="font-bold text-emerald-300" formatter={(value) => shortNumber(value)} />
                    {' '}visitors on your site
                </span>
                <span className="text-zinc-500">(est. value: <span className="font-semibold text-emerald-300">{formatMetricValue(estTotalValue, 'currency')}</span>)</span>
            </div>
            <div className="space-y-2.5 text-[12px]">
                {topReferrers.length ? (
                    <div className="flex items-start gap-3">
                        <span className="w-[62px] shrink-0 pt-0.5 text-zinc-500">Referrers</span>
                        <div className="flex flex-wrap gap-1.5">
                            {topReferrers.map((item) => (
                                <span key={`geo-ref:${item.referrer}`} className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-zinc-300">
                                    <OverviewValueIcon column="referrer_name" value={item.referrer} />
                                    <span>{formatOverviewValueLabel('referrer_name', item.referrer)}</span>
                                    <span className="text-zinc-500">({shortNumber(item.count)})</span>
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
                {topCountries.length ? (
                    <div className="flex items-start gap-3">
                        <span className="w-[62px] shrink-0 pt-0.5 text-zinc-500">Countries</span>
                        <div className="flex flex-wrap gap-1.5">
                            {topCountries.map((item) => (
                                <span key={`geo-country:${item.country}`} className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-zinc-300">
                                    <CountryFlag country={item.country} />
                                    <span>{item.country}</span>
                                    <span className="text-zinc-500">({shortNumber(item.users)})</span>
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function ShareGeoActivityFeed({ items }: { items: ShareGeoActivityItem[] }) {
    return (
        <div className="flex h-full min-h-[168px] flex-col">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Recent activity</div>
                <div className="text-[10px] text-zinc-600">Live feed</div>
            </div>
            {items.length ? (
                <div className="max-h-[182px] overflow-y-auto">
                    {items.map((item) => (
                        <div key={item.id} className="group flex items-start gap-2.5 border-b border-white/[0.04] px-4 py-2.5 last:border-b-0">
                            <div className="relative mt-0.5 shrink-0">
                                <div
                                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.14] text-[11px] font-bold text-white shadow-[0_0_0_2px_rgba(0,0,0,0.24)]"
                                    style={{ background: item.avatarColor }}
                                >
                                    {item.avatarInitial}
                                </div>
                                <div
                                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#141820]"
                                    style={{ background: item.warmth > 0.52 ? '#ef4444' : item.warmth > 0.38 ? '#f59e0b' : '#22c55e' }}
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-1 leading-snug">
                                    <span className="text-[12px] font-bold text-white">{item.name}</span>
                                    <span className="text-[12px] text-zinc-500">from</span>
                                    <CountryFlag country={item.country} />
                                    <span className="text-[12px] font-bold text-white">{item.country}</span>
                                    <span className="text-[12px] text-zinc-500">{item.event}</span>
                                    {item.event === 'visited' ? (
                                        <span className="text-[12px] font-mono text-zinc-300">{item.page}</span>
                                    ) : (
                                        <>
                                            <ExternalLink className="h-2.5 w-2.5 text-zinc-600" />
                                            <span className="max-w-[140px] truncate text-[11px] text-zinc-400">{item.exitLabel}</span>
                                        </>
                                    )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-600">{item.ageLabel}</span>
                                    <span className="text-[10px] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                                        {item.estValue}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex min-h-[168px] items-center justify-center px-4 text-sm text-zinc-500">No live visit activity yet</div>
            )}
        </div>
    );
}

function FooterDetailsButton({
    onClick,
    disabled = false,
    label = 'Open details',
}: {
    onClick: () => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={cx(
                'dashboard-hover-action inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.03] transition',
                disabled ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
            )}
            data-variant="ghost"
        >
            <Eye className="h-3.5 w-3.5" />
        </button>
    );
}

function DetailModal({
    open,
    title,
    description,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
}) {
    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-start sm:p-4">
            <div className="w-full max-w-full overflow-hidden rounded-t-[22px] border border-white/[0.1] bg-[#090c10] shadow-2xl sm:mt-10 sm:max-w-5xl sm:rounded-2xl">
                <div className="border-b border-white/[0.06] px-4 pt-2.5 sm:hidden">
                    <div className="mx-auto h-1 w-12 rounded-full bg-white/[0.12]" />
                </div>
                <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3.5 sm:px-5 sm:py-4">
                    <div>
                        <div className="text-sm font-semibold text-zinc-100">{title}</div>
                        {description ? <div className="mt-1 text-xs text-zinc-500">{description}</div> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-white/[0.08] p-2 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-[85vh] overflow-auto sm:max-h-[75vh]">{children}</div>
            </div>
        </div>
    );
}

type SortDirection = 'desc' | 'asc' | null;

function SortableHeader({
    label,
    active,
    direction,
    onClick,
    align = 'left',
}: {
    label: string;
    active: boolean;
    direction: SortDirection;
    onClick: () => void;
    align?: 'left' | 'right';
}) {
    const Icon = active ? (direction === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                'inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-200',
                align === 'right' ? 'ml-auto justify-end' : 'justify-start',
            )}
        >
            <span>{label}</span>
            <Icon className={cx('h-3 w-3', active ? 'text-zinc-500' : 'text-zinc-700/80')} />
        </button>
    );
}

function nextSortState(column: string, currentColumn: string | null, currentDirection: SortDirection) {
    if (currentColumn !== column) {
        return { column, direction: 'desc' as const };
    }
    if (currentDirection === 'desc') {
        return { column, direction: 'asc' as const };
    }
    return { column: null, direction: null };
}

function LiveNowPill({
    activeUsers,
    compact = false,
}: {
    activeUsers: number;
    compact?: boolean;
}) {
    return (
        <DashboardHoverSurface
            as="div"
            tone="cyan"
            className={cx(
                'flex items-center gap-2 rounded-[14px] border border-[#14C4E1]/18 bg-[linear-gradient(180deg,rgba(11,18,28,0.96),rgba(6,11,18,0.96))] text-sm shadow-[0_14px_30px_rgba(0,0,0,0.18)]',
                compact ? 'px-2.5 py-1.5 text-[12px]' : 'px-3 py-2',
            )}
        >
            <span className={cx('relative rounded-full', compact ? 'h-2 w-2' : 'h-2.5 w-2.5', activeUsers > 0 ? 'bg-[#14C4E1]' : 'bg-zinc-600')}>
                {activeUsers > 0 ? <span className="absolute inset-0 rounded-full bg-[#14C4E1] opacity-60 animate-ping" /> : null}
            </span>
            <span className={cx('font-mono text-zinc-100', compact ? 'text-[12px]' : '')}>{shortNumber(activeUsers)}</span>
            <span className="text-zinc-500">live now</span>
        </DashboardHoverSurface>
    );
}

function OverviewViewToggle({
    view,
    setView,
    disabled = false,
}: {
    view: 'table' | 'chart';
    setView: (value: 'table' | 'chart') => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setView(view === 'table' ? 'chart' : 'table')}
            className={cx(
                'dashboard-hover-action inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 transition',
                disabled ? 'cursor-not-allowed text-zinc-700' : 'text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100',
            )}
            data-variant="ghost"
        >
            {view === 'table' ? (
                <>
                    <ChartColumn className="h-3.5 w-3.5" />
                    Chart
                </>
            ) : (
                <>
                    <TableProperties className="h-3.5 w-3.5" />
                    Table
                </>
            )}
        </button>
    );
}

function MetricCard({
    metric,
    active,
    onClick,
    data,
    current,
    previous,
    interval,
    primary,
}: {
    metric: (typeof METRICS)[number];
    active: boolean;
    onClick: () => void;
    data: StatsSeriesPoint[];
    current: number;
    previous: number;
    interval: string;
    primary: boolean;
}) {
    const accent = useShareAccent();
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);
    const [cardHovered, setCardHovered] = useState(false);
    const [hoverLabelPosition, setHoverLabelPosition] = useState<{ left: number; top: number } | null>(null);
    const miniChartHoverRef = useRef<HTMLDivElement | null>(null);
    const miniSeries = useMemo(
        () => aggregateMetricMiniSeries(data, metric.key),
        [data, metric.key],
    );
    const hoveredPoint = currentIndex === null ? null : miniSeries[currentIndex] || null;
    const displayedCurrent = hoveredPoint?.current ?? current;
    const displayedPrevious = hoveredPoint?.previous ?? previous;
    const diff = diffDirection(displayedCurrent, displayedPrevious, metric.invert);
    const trendChange = normalizeTrendChange(diff, metric.invert);
    const previewed = cardHovered || currentIndex !== null;
    const highlighted = active || previewed;
    const tone = metricTone(diff, active, previewed);
    const trendLabel = formatTrendChange(trendChange);
    const TrendIcon = trendChange !== null && trendChange < 0 ? ChevronDown : ChevronUp;
    const hoverDateLabel = hoveredPoint ? formatDateLabel(hoveredPoint.date, interval) : null;
    const useTallMiniBars = TALL_MINI_BAR_METRICS.has(metric.key);
    const miniChartFrameClass = useTallMiniBars ? 'h-[76px] sm:h-[84px]' : 'h-[48px] sm:h-[54px]';
    const miniChartBarClass = useTallMiniBars ? 'h-[70px] sm:h-[78px]' : 'h-[42px] sm:h-[46px]';
    const trendBadgeStyle =
        trendChange === null
            ? {
                color: '#D8E3EA',
                borderColor: 'rgba(148,163,184,0.24)',
                background:
                    'linear-gradient(180deg, rgba(148,163,184,0.16) 0%, rgba(15,21,28,0.92) 100%)',
                boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(148,163,184,0.04), 0 10px 24px rgba(0,0,0,0.24)',
            }
            : trendChange >= 0
                ? {
                    color: '#BAE7FF',
                    borderColor: 'rgba(56,189,248,0.32)',
                    background:
                        'linear-gradient(180deg, rgba(56,189,248,0.22) 0%, rgba(7,18,32,0.94) 100%)',
                    boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(56,189,248,0.06), 0 12px 28px rgba(6,24,46,0.34)',
                }
                : {
                    color: '#FFB1BD',
                    borderColor: 'rgba(248,113,113,0.28)',
                    background:
                        'linear-gradient(180deg, rgba(248,113,113,0.2) 0%, rgba(29,12,15,0.94) 100%)',
                    boxShadow:
                        'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(248,113,113,0.05), 0 12px 28px rgba(36,10,15,0.28)',
                };

    const updateHoverIndex = useCallback((clientX: number, clientY: number) => {
        const element = miniChartHoverRef.current;
        if (!element || !miniSeries.length) {
            setCurrentIndex(null);
            setHoverLabelPosition(null);
            return;
        }

        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0) {
            setCurrentIndex(null);
            setHoverLabelPosition(null);
            return;
        }

        const relativeX = Math.min(Math.max(clientX - bounds.left, 0), bounds.width);
        const relativeY = Math.min(Math.max(clientY - bounds.top, 0), bounds.height);
        const nextIndex = Math.min(
            miniSeries.length - 1,
            Math.max(0, Math.floor((relativeX / bounds.width) * miniSeries.length)),
        );
        const labelHalfWidth = 44;
        const left = Math.min(Math.max(relativeX, labelHalfWidth), Math.max(labelHalfWidth, bounds.width - labelHalfWidth));
        const top = Math.max(-28, Math.min(6, relativeY - 26));

        setCurrentIndex(nextIndex);
        setHoverLabelPosition({ left, top });
    }, [miniSeries.length]);

    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => {
                setCardHovered(true);
            }}
            onMouseLeave={() => {
                setCardHovered(false);
                setCurrentIndex(null);
                setHoverLabelPosition(null);
            }}
            onFocus={() => {
                setCardHovered(true);
            }}
            onBlur={() => {
                setCardHovered(false);
                setCurrentIndex(null);
                setHoverLabelPosition(null);
            }}
            aria-pressed={active}
            data-active={active ? 'true' : 'false'}
            className={cx(
                'group relative min-h-[134px] overflow-hidden border-b border-r border-white/[0.08] text-left transition-all duration-200 sm:min-h-[140px] md:min-h-[148px]',
                'bg-[linear-gradient(180deg,rgba(8,14,24,0.98),rgba(4,9,18,0.94))]',
                'hover:bg-[linear-gradient(180deg,rgba(11,21,36,0.98),rgba(6,12,22,0.96))]',
                '[&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r md:[&:nth-child(4n)]:border-r-0',
                active
                    ? 'shadow-[inset_0_0_0_1px_rgba(56,189,248,0.34),0_18px_36px_rgba(0,0,0,0.26)]'
                    : cardHovered
                        ? 'shadow-[inset_0_0_0_1px_rgba(56,189,248,0.14),0_12px_28px_rgba(3,10,20,0.2)]'
                        : '',
            )}
        >
            <div
                className={cx(
                    'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/0 to-transparent opacity-0 transition',
                    active ? 'via-sky-300/85 opacity-100' : cardHovered ? 'via-sky-200/35 opacity-100' : '',
                )}
            />
            <div
                className={cx(
                    'pointer-events-none absolute inset-0 opacity-0 transition',
                    active ? 'opacity-100' : cardHovered ? 'opacity-60' : '',
                )}
                style={{
                    background:
                        `radial-gradient(120% 140% at 0% 0%, rgba(59,130,246,0.12), transparent 50%), radial-gradient(120% 140% at 100% 0%, ${tone.muted}, transparent 54%)`,
                }}
            />
            <div className="relative z-10 flex h-full flex-col px-3 pb-3 pt-3.5 sm:px-4 sm:pb-3.5 sm:pt-4">
                <div className="flex-1">
                    <div className="flex h-full flex-col">
                        <div className="mb-2 flex items-center gap-1.5">
                            <metric.icon className={cx('h-3 w-3 transition-colors sm:h-3.5 sm:w-3.5', highlighted ? 'text-zinc-200' : 'text-zinc-500')} />
                            <span className={cx('text-[11px] leading-none transition-colors sm:text-[12px]', highlighted ? 'text-zinc-200' : 'text-zinc-400')}>
                                {metric.label}
                            </span>
                        </div>
                        <div className="mt-5 flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className={cx('min-w-0 font-mono font-bold leading-[0.96] tracking-[-0.045em] text-zinc-50', primary ? 'text-[22px] sm:text-[30px]' : 'text-[20px] sm:text-[26px]')}>
                                {formatMetricValue(displayedCurrent, metric.unit)}
                            </div>
                            <span
                                className="inline-flex max-w-full self-start shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[-0.01em] backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-[11px]"
                                style={trendBadgeStyle}
                            >
                                {trendChange !== null ? <TrendIcon className="h-3.5 w-3.5" /> : null}
                                <span>{trendChange === null ? 'No baseline' : trendLabel}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-3 border-t border-white/[0.04] pt-2">
                    <div
                        ref={miniChartHoverRef}
                        className={`relative ${miniChartFrameClass} opacity-95 transition duration-200 group-hover:opacity-100`}
                        onMouseEnter={(event) => {
                            updateHoverIndex(event.clientX, event.clientY);
                        }}
                        onMouseMove={(event) => {
                            updateHoverIndex(event.clientX, event.clientY);
                        }}
                        onMouseLeave={() => {
                            setCurrentIndex(null);
                            setHoverLabelPosition(null);
                        }}
                    >
                        {hoveredPoint && hoverLabelPosition ? (
                            <div
                                className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-full border border-white/[0.1] bg-[#08111d]/96 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-200 shadow-[0_12px_24px_rgba(0,0,0,0.34)] backdrop-blur-md"
                                style={{
                                    left: hoverLabelPosition.left,
                                    top: hoverLabelPosition.top,
                                }}
                            >
                                {hoverDateLabel}
                            </div>
                        ) : null}
                        <div className={`pointer-events-none absolute inset-x-0 bottom-[1px] ${miniChartBarClass}`}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={miniSeries} barCategoryGap="36%" barGap={0}>
                                    <Tooltip content={() => null} cursor={false} />
                                    <Bar
                                        dataKey="current"
                                        fill={accent}
                                        fillOpacity={1}
                                        isAnimationActive={false}
                                        shape={<MiniBarShape />}
                                        minPointSize={5}
                                        maxBarSize={12}
                                        barSize={10}
                                    >
                                        {miniSeries.map((_, index) => (
                                            <Cell key={`mini-bar-${metric.key}-${index}`} fill={miniBarColor(index, miniSeries.length, accent)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </button>
    );
}

function ShareDashboardButton({
    onClick,
    compact = false,
}: {
    onClick: () => void;
    compact?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                'dashboard-hover-action relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-[14px] border border-[#14C4E1]/26 bg-[linear-gradient(135deg,rgba(7,20,28,0.98),rgba(7,53,63,0.96))] font-medium text-[#EAFDFF] shadow-[0_18px_44px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.03)] transition hover:border-[#7AD9DA]/38 hover:text-white',
                compact ? 'h-10 w-full px-3 text-[12px]' : 'h-10 px-4 text-sm',
            )}
        >
            <span className="absolute inset-0 rounded-[14px] bg-[radial-gradient(circle_at_top_left,rgba(20,196,225,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(122,217,218,0.18),transparent_46%)] opacity-90" />
            <span className="relative inline-flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#7AD9DA]/20 bg-[#14C4E1]/12 text-[#B8F5FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <Share2 className="h-3.5 w-3.5" />
                </span>
                <span>Share dashboard</span>
            </span>
        </button>
    );
}

function LiveMetricTile({
    data,
    total,
    className,
}: {
    data?: LiveOverviewResponse;
    total: number;
    className?: string;
}) {
    const accent = useShareAccent();
    const hasBreakdown = hasLiveBreakdown(data);
    const topReferrers = hasBreakdown ? data.referrers.slice(0, 2) : [];
    const liveMiniSeries = useMemo(
        () => (hasBreakdown ? aggregateLiveMiniSeries(data.minuteCounts) : []),
        [data, hasBreakdown],
    );
    const liveLabel = hasBreakdown ? 'Sessions last 30 min' : 'Active users right now';

    return (
        <div className={cx('relative col-span-2 min-h-[112px] border-b border-white/[0.08] bg-[linear-gradient(180deg,rgba(56,189,248,0.08),rgba(8,15,28,0.42))] px-3 pb-3 pt-3 text-left sm:px-4 sm:pb-3 sm:pt-3.5 md:col-span-1', className)}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/65 to-transparent" />
            <div className="relative z-10 flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] leading-none text-zinc-400 sm:text-[12px]">{liveLabel}</div>
                        <div className="mt-3 font-mono text-[26px] font-bold leading-[0.96] tracking-[-0.04em] text-zinc-100 sm:text-[30px]">
                            {shortNumber(total)}
                        </div>
                    </div>
                    {topReferrers.length ? (
                        <div className="hidden items-center gap-1.5 md:flex">
                            {topReferrers.map((item) => (
                                <span
                                    key={item.referrer}
                                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-1 text-[10px] text-zinc-400"
                                >
                                    <OverviewValueIcon column="referrer_name" value={item.referrer} />
                                    <span className="max-w-[52px] truncate">{item.count}</span>
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="mt-auto pt-3 sm:pt-4">
                    {hasBreakdown ? (
                        <div className="h-[56px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={liveMiniSeries} barCategoryGap="40%" barGap={0}>
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const row = payload[0]?.payload as LiveMiniBarPoint;
                                            return (
                                                <div className="rounded-lg border border-white/[0.08] bg-[#0f141a]/95 px-3 py-2 text-xs shadow-[0_16px_32px_rgba(0,0,0,0.38)] backdrop-blur-md">
                                                    <div className="mb-1 text-zinc-500">{row.time}</div>
                                                    <div className="font-mono text-zinc-100">{row.sessionCount} sessions</div>
                                                    {row.referrers?.length ? (
                                                        <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
                                                            {row.referrers.map((item) => (
                                                                <div key={`${row.timestamp}:${item.referrer}`} className="flex items-center justify-between gap-3">
                                                                    <span className="flex items-center gap-1.5 text-zinc-400">
                                                                        <OverviewValueIcon column="referrer_name" value={item.referrer} />
                                                                        <span className="max-w-[120px] truncate">{item.referrer}</span>
                                                                    </span>
                                                                    <span className="font-mono text-zinc-100">{item.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar
                                        dataKey="sessionCount"
                                        fill={accent}
                                        isAnimationActive={false}
                                        shape={<MiniBarShape />}
                                        minPointSize={5}
                                        maxBarSize={12}
                                        barSize={10}
                                    >
                                        {liveMiniSeries.map((_, index) => (
                                            <Cell key={`live-bar-${index}`} fill={miniBarColor(index, liveMiniSeries.length, accent)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex h-[56px] items-end">
                            <div className="inline-flex items-center rounded-md border border-sky-400/15 bg-sky-400/[0.08] px-2.5 py-1.5 text-[11px] text-sky-100/80">
                                Fast realtime summary
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function GenericTable({
    rows,
    column,
    onRowClick,
    renderLabel,
    valueLabel = 'Sessions',
    secondaryLabel = 'Pageviews',
    primaryMetric = 'sessions',
    secondaryMetric = 'pageviews',
    isSelected,
    interactionDisabled = false,
    limitRows = OVERVIEW_TABLE_ROW_LIMIT,
}: {
    rows: GenericItem[];
    column: string;
    onRowClick: (row: GenericItem) => void;
    renderLabel?: (row: GenericItem) => ReactNode;
    valueLabel?: string;
    secondaryLabel?: string;
    primaryMetric?: 'sessions' | 'pageviews';
    secondaryMetric?: 'sessions' | 'pageviews';
    isSelected?: (row: GenericItem) => boolean;
    interactionDisabled?: boolean;
    limitRows?: number | null;
}) {
    const [sortColumn, setSortColumn] = useState<'label' | 'primary' | 'secondary' | 'revenue' | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const showRevenue = rows.some((row) => Number(row.revenue || 0) > 0);
    const desktopGridTemplate = showRevenue
        ? 'md:grid-cols-[minmax(0,1fr)_84px_84px_96px]'
        : 'md:grid-cols-[minmax(0,1fr)_84px_84px]';

    const sortedRows = useMemo(() => {
        if (!sortColumn || !sortDirection) {
            return rows;
        }

        const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
        const multiplier = sortDirection === 'desc' ? -1 : 1;

        return [...rows].sort((left, right) => {
            if (sortColumn === 'label') {
                const leftLabel = left.prefix ? `${left.prefix} / ${left.name}` : left.name;
                const rightLabel = right.prefix ? `${right.prefix} / ${right.name}` : right.name;
                return collator.compare(leftLabel, rightLabel) * multiplier;
            }

            if (sortColumn === 'revenue') {
                return ((Number(left.revenue || 0) - Number(right.revenue || 0))) * multiplier;
            }

            const metricKey = sortColumn === 'primary' ? primaryMetric : secondaryMetric;
            return (Number(left[metricKey] || 0) - Number(right[metricKey] || 0)) * multiplier;
        });
    }, [primaryMetric, rows, secondaryMetric, sortColumn, sortDirection]);

    const visibleRows = typeof limitRows === 'number' ? sortedRows.slice(0, limitRows) : sortedRows;
    const maxPrimaryValue = Math.max(...visibleRows.map((row) => Number(row[primaryMetric] || 0)), 1);

    function toggleSort(columnName: 'label' | 'primary' | 'secondary' | 'revenue') {
        const next = nextSortState(columnName, sortColumn, sortDirection);
        setSortColumn(next.column as 'label' | 'primary' | 'secondary' | 'revenue' | null);
        setSortDirection(next.direction);
    }

    return (
        <div className="min-h-[358px]">
            <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2.5 border-b border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-zinc-350 md:hidden">
                <span>{FILTER_LABELS[column] || column}</span>
                <div className="text-right">
                    <div>{valueLabel}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{secondaryLabel}</div>
                </div>
            </div>
            <div className={cx(OVERVIEW_TABLE_HEADER_BASE_CLASS, 'hidden md:grid', desktopGridTemplate)}>
                <SortableHeader
                    label={FILTER_LABELS[column] || column}
                    active={sortColumn === 'label'}
                    direction={sortDirection}
                    onClick={() => toggleSort('label')}
                />
                <SortableHeader
                    label={valueLabel}
                    active={sortColumn === 'primary'}
                    direction={sortDirection}
                    onClick={() => toggleSort('primary')}
                    align="right"
                />
                <SortableHeader
                    label={secondaryLabel}
                    active={sortColumn === 'secondary'}
                    direction={sortDirection}
                    onClick={() => toggleSort('secondary')}
                    align="right"
                />
                {showRevenue ? (
                    <SortableHeader
                        label="Revenue"
                        active={sortColumn === 'revenue'}
                        direction={sortDirection}
                        onClick={() => toggleSort('revenue')}
                        align="right"
                    />
                ) : null}
            </div>
            <div>
                {visibleRows.map((row) => {
                    const selected = isSelected?.(row) ?? false;
                    const primaryValue = Number(row[primaryMetric] || 0);
                    const secondaryValue = Number(row[secondaryMetric] || 0);
                    const revenueValue = Number(row.revenue || 0);

                    return (
                        <button
                            key={`${row.prefix || ''}-${row.name}`}
                            type="button"
                            disabled={interactionDisabled}
                            aria-pressed={selected}
                            onClick={() => onRowClick(row)}
                            className={cx(
                                OVERVIEW_TABLE_ROW_BASE_CLASS,
                                'h-auto min-h-[42px] grid-cols-[minmax(0,1fr)_104px] px-3 py-1.5 md:h-8 md:min-h-8 md:px-4 md:py-0',
                                desktopGridTemplate,
                                interactionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                                selected ? 'bg-blue-500/[0.14]' : '',
                            )}
                        >
                            <div
                                className={cx(
                                    OVERVIEW_TABLE_FILL_BASE_CLASS,
                                    selected ? 'bg-blue-500/[0.18]' : 'bg-white/[0.035]',
                                    !interactionDisabled ? 'group-hover:bg-blue-500/[0.10]' : '',
                                )}
                                style={{ width: `${(primaryValue / maxPrimaryValue) * 100}%` }}
                            />
                            <div className="relative z-10 min-w-0">
                                {renderLabel ? renderLabel(row) : (
                                    <OverviewInlineLabel
                                        icon={iconForGenericValue(column, row.prefix || row.name)}
                                        prefix={row.prefix ? formatOverviewValueLabel(column, row.prefix) : null}
                                        label={formatOverviewValueLabel(column, row.name)}
                                        selected={selected}
                                    />
                                )}
                            </div>
                            <div className="relative z-10 flex flex-col items-end text-right md:hidden">
                                <span className={cx('font-mono text-[12px] leading-none', selected ? 'text-white' : 'text-zinc-100')}>
                                    {shortNumber(primaryValue)}
                                </span>
                                <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-blue-50' : 'text-zinc-500')}>
                                    {secondaryLabel}: {shortNumber(secondaryValue)}
                                </span>
                                {showRevenue ? (
                                    <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-amber-200' : 'text-amber-300')}>
                                        {revenueValue > 0 ? formatMetricValue(revenueValue, 'currency') : '-'}
                                    </span>
                                ) : null}
                            </div>
                            <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-white' : 'text-zinc-100')}>{shortNumber(primaryValue)}</div>
                            <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-blue-50' : 'text-zinc-300')}>{shortNumber(secondaryValue)}</div>
                            {showRevenue ? (
                                <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-amber-200' : 'text-amber-300')}>
                                    {revenueValue > 0 ? formatMetricValue(revenueValue, 'currency') : '-'}
                                </div>
                            ) : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function transformSeriesChartData(items: TopGenericSeriesResponse['items']) {
    const allDates = new Set<string>();
    items.forEach((item) => item.data.forEach((point) => allDates.add(point.date)));

    return Array.from(allDates).sort().map((date) => {
        const entry: Record<string, string | number> = { date };
        items.forEach((item) => {
            const key = item.prefix ? `${item.prefix}:${item.name}` : item.name;
            const point = item.data.find((row) => row.date === date);
            entry[key] = point?.sessions || 0;
        });
        return entry;
    });
}

function MultiSeriesLineChart({
    items,
    interval,
    metric = 'sessions',
}: {
    items: TopGenericSeriesResponse['items'];
    interval: string;
    metric?: 'sessions' | 'pageviews';
}) {
    const data = useMemo(() => transformSeriesChartData(items).map((entry) => {
        const next: Record<string, string | number> = { date: String(entry.date) };
        items.forEach((item) => {
            const key = item.prefix ? `${item.prefix}:${item.name}` : item.name;
            const point = item.data.find((row) => row.date === entry.date);
            next[key] = metric === 'pageviews' ? point?.pageviews || 0 : point?.sessions || 0;
        });
        return next;
    }), [items, metric]);

    return (
        <div className="px-4 pb-3 pt-4">
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tickFormatter={(value) => formatDateLabel(value, interval)} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(value: number) => shortNumber(value)} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
                        <Tooltip
                            cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                    <div className="rounded-lg border border-white/[0.08] bg-[#11151a] px-3 py-2 text-xs shadow-xl">
                                        <div className="mb-2 text-zinc-400">{formatDateLabel(label || '', interval)}</div>
                                        <div className="space-y-1.5">
                                            {payload.slice(0, 6).map((item, index) => (
                                                <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-5">
                                                    <div className="flex items-center gap-2 text-zinc-300">
                                                        <span className="h-2 w-2 rounded-full" style={{ background: item.color as string }} />
                                                        <span className="max-w-[160px] truncate">{String(item.name).split(':').join(' / ')}</span>
                                                    </div>
                                                    <span className="font-mono text-zinc-100">{shortNumber(Number(item.value || 0))}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        {items.map((item, index) => {
                            const key = item.prefix ? `${item.prefix}:${item.name}` : item.name;
                            return <Line key={key} type="monotone" dataKey={key} name={key} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />;
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                {items.map((item, index) => (
                    <div key={`${item.prefix || ''}-${item.name}`} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="text-zinc-400">
                            {item.prefix ? `${item.prefix} / ` : ''}
                            <span className="text-zinc-200">{item.name}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function OverviewMetrics({ liveData }: { liveData?: LiveOverviewResponse }) {
    const runtime = useOverviewRuntime();
    const { range, interval, metric, setMetric, startDate, endDate, filters, eventNames } = useShareOverviewState();
    const pageScoped = hasPageScopedFilter(filters);

    const statsQuery = useQuery<StatsResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'stats', range, interval, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'stats', {
            filters,
            events: eventNames,
            extra: {
                range,
                overrideInterval: interval,
                start: startDate || undefined,
                end: endDate || undefined,
            },
        })),
        placeholderData: keepPreviousData,
        staleTime: OVERVIEW_QUERY_STALE_MS,
    });

    const displayedMetric = METRICS[metric] || METRICS[0];
    const data = statsQuery.data?.series || [];
    const liveTotal = hasLiveBreakdown(liveData)
        ? liveData.minuteCounts.reduce((sum, item) => sum + item.sessionCount, 0)
        : liveData?.activeUsers || 0;
    const displayedLiveTotal = useDebouncedLiveValue(liveTotal, 800, LIVE_RECONCILE_INTERVAL_MS);
    // Read the merged accent (persisted config + Studio postMessage overrides)
    // from context — NOT runtime.config?.theme.accentColor directly. Doing it
    // directly was the reason the Studio's live preview only painted the line
    // after Save: the runtime is built once outside the preview-overrides
    // state, so the persisted color was stuck until a reload.
    const activeMetricColor = useShareAccent();
    const previousMetricColor = OVERVIEW_COMPARISON_ACCENT;
    const chartHelperText = pageScoped
        ? 'Page-scoped filters applied • Some session-level cards stay limited.'
        : `Compared with previous period • ${getRangeLabel(range)}`;

    return (
        <div className="col-span-6">
            <DashboardHoverSurface
                as="section"
                tone="cyan"
                className="relative overflow-hidden rounded-[14px] border border-white/[0.14] bg-[#030712] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_22px_70px_rgba(0,0,0,0.34)]"
                style={{
                    backgroundImage:
                        'radial-gradient(120% 110% at 0% 0%, rgba(59,130,246,0.16), transparent 44%), radial-gradient(90% 90% at 100% 0%, rgba(56,189,248,0.12), transparent 34%)',
                }}
            >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_30%)]" />
                <div className="relative">
                    <div className="grid grid-cols-2 overflow-hidden md:grid-cols-4">
                        {METRICS.map((item, index) => (
                            <MetricCard
                                key={item.key}
                                metric={item}
                                active={metric === index}
                                onClick={() => setMetric(index)}
                                data={data}
                                current={statsQuery.data?.metrics[item.key] || 0}
                                previous={statsQuery.data?.metrics[`prev_${item.key}`] || 0}
                                interval={interval}
                                primary={index < 4}
                            />
                        ))}
                        <LiveMetricTile data={liveData} total={displayedLiveTotal} className="col-span-2 md:col-span-1" />
                    </div>

                    <div className="border-t border-white/[0.10] bg-[#020611]/96 px-3 pb-4 pt-3.5 sm:px-5 sm:pb-6 sm:pt-4">
                        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.26em] text-zinc-500">Selected Metric</div>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeMetricColor }} />
                                    <span className="text-[15px] font-semibold text-zinc-100">{displayedMetric.label}</span>
                                </div>
                            </div>
                            <span
                                className={cx(
                                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] leading-none',
                                    pageScoped
                                        ? 'border-amber-400/16 bg-amber-400/[0.08] text-amber-100'
                                        : 'border-cyan-400/16 bg-cyan-400/[0.08] text-cyan-100',
                                )}
                            >
                                <span
                                    className={cx(
                                        'h-1.5 w-1.5 rounded-full',
                                        pageScoped ? 'bg-amber-300' : 'bg-cyan-300',
                                    )}
                                />
                                {chartHelperText}
                            </span>
                        </div>
                        <div className="mt-4 h-[216px] sm:h-[272px]">
                            {statsQuery.isLoading ? (
                                <div className="flex h-full items-center justify-center text-sm text-zinc-500">Loading chart...</div>
                            ) : statsQuery.error ? (
                                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-400/80">{statsQuery.error.message}</div>
                            ) : !data.length ? (
                                <div className="flex h-full items-center justify-center text-sm text-zinc-500">No data available</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={data}>
                                        <defs>
                                            <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={activeMetricColor} stopOpacity={0.34} />
                                                <stop offset="45%" stopColor={activeMetricColor} stopOpacity={0.12} />
                                                <stop offset="100%" stopColor={activeMetricColor} stopOpacity={0.015} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.06)" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(value) => formatDateLabel(value, interval)}
                                            tick={{ fill: '#7f8a9b', fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            minTickGap={24}
                                        />
                                        <YAxis
                                            tickFormatter={(value: number) => shortNumber(value)}
                                            tick={{ fill: '#7f8a9b', fontSize: 11 }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={44}
                                        />
                                        <Tooltip
                                            cursor={{ stroke: 'rgba(241,245,249,0.7)', strokeWidth: 1.2 }}
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload?.length) return null;
                                                const currentValue = Number(payload.find((item) => item.dataKey === displayedMetric.key)?.value || 0);
                                                const previousValue = Number(payload.find((item) => item.dataKey === `prev_${displayedMetric.key}`)?.value || 0);
                                                const tooltipDiff = diffDirection(currentValue, previousValue, displayedMetric.invert);
                                                const tooltipTrend = formatTrendChange(normalizeTrendChange(tooltipDiff, displayedMetric.invert));
                                                const tooltipTone = metricTone(tooltipDiff, true, true);

                                                return (
                                                    <div className="rounded-[16px] border border-white/[0.08] bg-[#07101a]/96 px-3.5 py-3 text-xs shadow-[0_20px_40px_rgba(0,0,0,0.46)] backdrop-blur-xl">
                                                        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                                                            {formatDateLabel(label || '', interval)}
                                                        </div>
                                                        <div className="mt-3 space-y-2.5">
                                                            <div className="flex items-center justify-between gap-6">
                                                                <span className="inline-flex items-center gap-2 text-zinc-400">
                                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeMetricColor }} />
                                                                    Current
                                                                </span>
                                                                <span className="font-mono text-[14px] font-semibold text-zinc-100">
                                                                    {formatMetricValue(currentValue, displayedMetric.unit)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-6">
                                                                <span className="inline-flex items-center gap-2 text-zinc-400">
                                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: previousMetricColor }} />
                                                                    Previous
                                                                </span>
                                                                <span className="font-mono text-[13px] font-semibold" style={{ color: previousMetricColor }}>
                                                                    {formatMetricValue(previousValue, displayedMetric.unit)}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-6 border-t border-white/[0.08] pt-2.5">
                                                                <span className="text-zinc-500">Change</span>
                                                                <span className="font-mono font-semibold" style={{ color: tooltipTone.solid }}>
                                                                    {tooltipTrend}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={`prev_${displayedMetric.key}`}
                                            stroke={previousMetricColor}
                                            strokeOpacity={0.88}
                                            strokeWidth={2.1}
                                            dot={false}
                                            activeDot={{ r: 5, fill: '#07101a', stroke: '#d6e8ff', strokeWidth: 2.2 }}
                                            isAnimationActive={false}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey={displayedMetric.key}
                                            stroke="none"
                                            fill="url(#metricFill)"
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={displayedMetric.key}
                                            stroke={activeMetricColor}
                                            strokeOpacity={0.18}
                                            strokeWidth={6.5}
                                            activeDot={false}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={displayedMetric.key}
                                            stroke={activeMetricColor}
                                            strokeWidth={2.9}
                                            activeDot={{ r: 5.5, fill: activeMetricColor, stroke: '#e0f2fe', strokeWidth: 2.2 }}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            </DashboardHoverSurface>
        </div>
    );
}

function TopSourcesWidget() {
    const runtime = useOverviewRuntime();
    const {
        range,
        interval,
        startDate,
        endDate,
        filters,
        eventNames,
        addFilter,
        sourcesTab,
        setSourcesTab,
        view,
        setView,
        hasFilter,
    } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const genericQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic', sourcesTab, range, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, range, runtime.queryKey, sourcesTab, startDate],
    );
    const seriesQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic-series', sourcesTab, range, interval, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, interval, range, runtime.queryKey, sourcesTab, startDate],
    );

    const query = useQuery<TopGenericResponse, Error>({
        queryKey: genericQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic', { filters, events: eventNames, extra: {
            column: sourcesTab,
            range,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
    });
    const seriesQuery = useQuery<TopGenericSeriesResponse, Error>({
        queryKey: seriesQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic-series', { filters, events: eventNames, extra: {
            column: sourcesTab,
            range,
            overrideInterval: interval,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
        enabled: view === 'chart',
    });

    const rows = useMemo(() => {
        const data = query.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => `${item.prefix || ''} ${item.name}`.toLowerCase().includes(needle));
    }, [query.data?.items, searchQuery]);
    const chartItems = useMemo(() => {
        const data = seriesQuery.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => `${item.prefix || ''} ${item.name}`.toLowerCase().includes(needle));
    }, [seriesQuery.data?.items, searchQuery]);

    return (
        <>
            <Widget className="col-span-6 md:col-span-3">
                <WidgetHeadSearchable
                    tabs={SOURCES_WIDGETS}
                    activeTab={sourcesTab}
                    onTabChange={setSourcesTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={`Search ${SOURCES_WIDGETS.find((item) => item.key === sourcesTab)?.label.toLowerCase() || 'sources'}`}
                />
            <QueryBoundaries
                title="sources"
                loading={view === 'chart' ? (seriesQuery.isLoading && !seriesQuery.data) : (query.isLoading && !query.data)}
                error={(view === 'chart' ? seriesQuery.error : query.error) || null}
                empty={view === 'chart' ? !chartItems.length : !rows.length}
            >
                {view === 'chart' ? (
                    <MultiSeriesLineChart items={chartItems} interval={interval} metric={query.data?.primaryMetric || 'sessions'} />
                ) : (
                    <GenericTable
                        rows={rows}
                        column={sourcesTab}
                        onRowClick={(row) => addFilter(sourcesTab, row.name)}
                        primaryMetric={query.data?.primaryMetric || 'sessions'}
                        secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                        valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                        secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                        isSelected={(row) => hasFilter(sourcesTab, row.name)}
                    />
                )}
            </QueryBoundaries>
            <WidgetFooter className="justify-between">
                <FooterDetailsButton onClick={() => setDetailsOpen(true)} />
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">
                        {query.data?.supported === false ? 'Limited' : runtime.mode === 'share' ? 'Shared view' : 'Dashboard view'}
                    </span>
                    <OverviewViewToggle view={view} setView={setView} disabled={query.data?.supported === false} />
                </div>
            </WidgetFooter>
            </Widget>
            <DetailModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={`Sources — ${SOURCES_WIDGETS.find((item) => item.key === sourcesTab)?.label || 'Details'}`}
                description="Expanded breakdown with the same global dashboard filters applied."
            >
                <GenericTable
                    rows={rows}
                    column={sourcesTab}
                    onRowClick={(row) => addFilter(sourcesTab, row.name)}
                    primaryMetric={query.data?.primaryMetric || 'sessions'}
                    secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                    valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                    secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                    isSelected={(row) => hasFilter(sourcesTab, row.name)}
                    limitRows={null}
                />
            </DetailModal>
        </>
    );
}

function TopPagesWidget() {
    const runtime = useOverviewRuntime();
    const siteUrl = runtime.siteUrl;
    const { range, startDate, endDate, filters, eventNames, addFilter, hasFilter, pagesTab, setPagesTab, showDomain, setShowDomain } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [sortColumn, setSortColumn] = useState<'label' | 'primary' | 'secondary' | 'revenue' | null>('primary');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const query = useQuery<TopPagesResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, 'top-pages', pagesTab, range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-pages', {
            filters,
            events: eventNames,
            extra: {
                mode: pagesTab,
                range,
                start: startDate || undefined,
                end: endDate || undefined,
            },
        })),
    });

    const rows = useMemo(() => {
        const data = query.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => `${item.path} ${item.title}`.toLowerCase().includes(needle));
    }, [query.data?.items, searchQuery]);
    const showRevenue = rows.some((item) => Number(item.revenue || 0) > 0);
    const desktopGridTemplate = showRevenue
        ? 'md:grid-cols-[minmax(0,1fr)_84px_84px_96px]'
        : 'md:grid-cols-[minmax(0,1fr)_84px_84px]';
    const sortedRows = useMemo(() => {
        if (!sortColumn || !sortDirection) {
            return rows;
        }

        const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
        const multiplier = sortDirection === 'desc' ? -1 : 1;

        return [...rows].sort((left, right) => {
            if (sortColumn === 'label') {
                return collator.compare(left.path, right.path) * multiplier;
            }
            if (sortColumn === 'primary') {
                return ((pagesTab === 'page' ? left.pageviews : left.sessions) - (pagesTab === 'page' ? right.pageviews : right.sessions)) * multiplier;
            }
            if (sortColumn === 'revenue') {
                return (Number(left.revenue || 0) - Number(right.revenue || 0)) * multiplier;
            }

            const leftSecondary = pagesTab === 'page' ? left.sessions : left.bounceRate;
            const rightSecondary = pagesTab === 'page' ? right.sessions : right.bounceRate;
            return (leftSecondary - rightSecondary) * multiplier;
        });
    }, [pagesTab, rows, sortColumn, sortDirection]);
    const visibleRows = sortedRows.slice(0, OVERVIEW_TABLE_ROW_LIMIT);
    const maxSessions = Math.max(...visibleRows.map((row) => pagesTab === 'page' ? row.pageviews : row.sessions), 1);
    const maxDetailValue = Math.max(...sortedRows.map((row) => pagesTab === 'page' ? row.pageviews : row.sessions), 1);
    const filterName = pagesTab === 'page' ? 'path' : pagesTab === 'entry' ? 'entry_path' : 'exit_path';
    const primaryLabel = pagesTab === 'page' ? 'Views' : pagesTab === 'entry' ? 'Entries' : 'Exits';
    const secondaryLabel = pagesTab === 'page' ? 'Sess.' : 'Bounce';

    function toggleSort(columnName: 'label' | 'primary' | 'secondary' | 'revenue') {
        const next = nextSortState(columnName, sortColumn, sortDirection);
        setSortColumn(next.column as 'label' | 'primary' | 'secondary' | 'revenue' | null);
        setSortDirection(next.direction);
    }

    return (
        <>
            <Widget className="col-span-6 md:col-span-3">
                <WidgetHeadSearchable
                    tabs={PAGES_WIDGETS}
                    activeTab={pagesTab}
                    onTabChange={setPagesTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={`Search ${PAGES_WIDGETS.find((item) => item.key === pagesTab)?.label.toLowerCase() || 'pages'}`}
                />
                <QueryBoundaries title="pages" loading={query.isLoading && !query.data} error={query.error || null} empty={!sortedRows.length}>
                    <div className="min-h-[358px]">
                        <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2.5 border-b border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-zinc-350 md:hidden">
                            <span>Path</span>
                            <div className="text-right">
                                <div>{primaryLabel}</div>
                                <div className="mt-0.5 text-[10px] text-zinc-500">{secondaryLabel}</div>
                            </div>
                        </div>
                        <div className={cx(OVERVIEW_TABLE_HEADER_BASE_CLASS, 'hidden md:grid', desktopGridTemplate)}>
                            <SortableHeader
                                label="Path"
                                active={sortColumn === 'label'}
                                direction={sortDirection}
                                onClick={() => toggleSort('label')}
                            />
                            <SortableHeader
                                label={primaryLabel}
                                active={sortColumn === 'primary'}
                                direction={sortDirection}
                                onClick={() => toggleSort('primary')}
                                align="right"
                            />
                            <SortableHeader
                                label={secondaryLabel}
                                active={sortColumn === 'secondary'}
                                direction={sortDirection}
                                onClick={() => toggleSort('secondary')}
                                align="right"
                            />
                            {showRevenue ? (
                                <SortableHeader
                                    label="Revenue"
                                    active={sortColumn === 'revenue'}
                                    direction={sortDirection}
                                    onClick={() => toggleSort('revenue')}
                                    align="right"
                                />
                            ) : null}
                        </div>
                        {visibleRows.map((row) => {
                            const hasOrigin = Boolean(row.origin && row.origin !== '(not set)');
                            const selected = hasFilter(filterName, row.path) && (!hasOrigin || hasFilter('origin', row.origin));
                            const href = buildPageHref(row.origin, row.path, siteUrl);

                            return (
                                <button
                                    key={`${pagesTab}:${row.origin}:${row.path}`}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => {
                                        addFilter(filterName, row.path);
                                        if (hasOrigin) {
                                            addFilter('origin', row.origin);
                                        }
                                    }}
                                    className={cx(
                                        OVERVIEW_TABLE_ROW_BASE_CLASS,
                                        'h-auto min-h-[42px] grid-cols-[minmax(0,1fr)_104px] px-3 py-1.5 md:h-8 md:min-h-8 md:px-4 md:py-0',
                                        desktopGridTemplate,
                                        selected ? 'bg-blue-500/[0.14]' : '',
                                    )}
                                >
                                    <div
                                        className={cx(
                                            OVERVIEW_TABLE_FILL_BASE_CLASS,
                                            'group-hover:bg-blue-500/[0.10]',
                                            selected ? 'bg-blue-500/[0.18]' : 'bg-white/[0.035]',
                                        )}
                                        style={{ width: `${(((pagesTab === 'page' ? row.pageviews : row.sessions) || 0) / maxSessions) * 100}%` }}
                                    />
                                    <div className="relative z-10 min-w-0">
                                        <OverviewInlineLabel
                                            icon={<OverviewValueIcon column="origin" value={hasOrigin ? row.origin : row.path} />}
                                            prefix={showDomain && hasOrigin ? formatOverviewValueLabel('origin', row.origin) : null}
                                            label={row.path}
                                            selected={selected}
                                            trailing={href.startsWith('http') ? (
                                                <a
                                                    href={href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="inline-flex text-zinc-500 hover:text-zinc-200"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            ) : null}
                                        />
                                    </div>
                                    <div className="relative z-10 flex flex-col items-end text-right md:hidden">
                                        <span className={cx('font-mono text-[12px] leading-none', selected ? 'text-white' : 'text-zinc-100')}>
                                            {pagesTab === 'page' ? shortNumber(row.pageviews) : shortNumber(row.sessions)}
                                        </span>
                                        <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-blue-50' : 'text-zinc-500')}>
                                            {pagesTab === 'page' ? `${secondaryLabel}: ${shortNumber(row.sessions)}` : `${secondaryLabel}: ${row.bounceRate.toFixed(1)}%`}
                                        </span>
                                        {showRevenue ? (
                                            <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-amber-200' : 'text-amber-300')}>
                                                {row.revenue ? formatMetricValue(row.revenue, 'currency') : '-'}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-white' : 'text-zinc-100')}>
                                        {pagesTab === 'page' ? shortNumber(row.pageviews) : shortNumber(row.sessions)}
                                    </div>
                                    <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-blue-50' : 'text-zinc-300')}>
                                        {pagesTab === 'page' ? shortNumber(row.sessions) : `${row.bounceRate.toFixed(1)}%`}
                                    </div>
                                    {showRevenue ? (
                                        <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-amber-200' : 'text-amber-300')}>
                                            {row.revenue ? formatMetricValue(row.revenue, 'currency') : '-'}
                                        </div>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </QueryBoundaries>
                <WidgetFooter className="justify-between">
                    <FooterDetailsButton onClick={() => setDetailsOpen(true)} />
                    <button
                        type="button"
                        onClick={() => setShowDomain(!showDomain)}
                        className={cx(
                            'inline-flex h-7 items-center rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 text-[11px] transition',
                            showDomain ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100',
                        )}
                    >
                        {showDomain ? 'Hide domain' : 'Show domain'}
                    </button>
                </WidgetFooter>
            </Widget>
            <DetailModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={`Pages — ${PAGES_WIDGETS.find((item) => item.key === pagesTab)?.label || 'Details'}`}
                description="Expanded page breakdown using the same share-safe filters and date state."
            >
                <div className="min-h-[358px]">
                    <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2.5 border-b border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-zinc-350 md:hidden">
                        <span>Path</span>
                        <div className="text-right">
                            <div>{primaryLabel}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-500">{secondaryLabel}</div>
                        </div>
                    </div>
                    <div className={cx(OVERVIEW_TABLE_HEADER_BASE_CLASS, 'hidden md:grid', desktopGridTemplate)}>
                        <SortableHeader
                            label="Path"
                            active={sortColumn === 'label'}
                            direction={sortDirection}
                            onClick={() => toggleSort('label')}
                        />
                        <SortableHeader
                            label={primaryLabel}
                            active={sortColumn === 'primary'}
                            direction={sortDirection}
                            onClick={() => toggleSort('primary')}
                            align="right"
                        />
                        <SortableHeader
                            label={secondaryLabel}
                            active={sortColumn === 'secondary'}
                            direction={sortDirection}
                            onClick={() => toggleSort('secondary')}
                            align="right"
                        />
                        {showRevenue ? (
                            <SortableHeader
                                label="Revenue"
                                active={sortColumn === 'revenue'}
                                direction={sortDirection}
                                onClick={() => toggleSort('revenue')}
                                align="right"
                            />
                        ) : null}
                    </div>
                    {sortedRows.map((row) => {
                        const hasOrigin = Boolean(row.origin && row.origin !== '(not set)');
                        const selected = hasFilter(filterName, row.path) && (!hasOrigin || hasFilter('origin', row.origin));

                        return (
                            <button
                                key={`details:${pagesTab}:${row.origin}:${row.path}`}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => {
                                    addFilter(filterName, row.path);
                                    if (hasOrigin) {
                                        addFilter('origin', row.origin);
                                    }
                                }}
                                className={cx(
                                    OVERVIEW_TABLE_ROW_BASE_CLASS,
                                    'h-auto min-h-[42px] grid-cols-[minmax(0,1fr)_104px] px-3 py-1.5 md:h-8 md:min-h-8 md:px-4 md:py-0',
                                    desktopGridTemplate,
                                    selected ? 'bg-blue-500/[0.14]' : '',
                                )}
                            >
                                <div
                                    className={cx(
                                        OVERVIEW_TABLE_FILL_BASE_CLASS,
                                        'group-hover:bg-blue-500/[0.10]',
                                        selected ? 'bg-blue-500/[0.18]' : 'bg-white/[0.035]',
                                    )}
                                    style={{ width: `${(((pagesTab === 'page' ? row.pageviews : row.sessions) || 0) / maxDetailValue) * 100}%` }}
                                />
                                <div className="relative z-10 min-w-0">
                                    <OverviewInlineLabel
                                        icon={<OverviewValueIcon column="origin" value={hasOrigin ? row.origin : row.path} />}
                                        prefix={showDomain && hasOrigin ? formatOverviewValueLabel('origin', row.origin) : null}
                                        label={row.path}
                                        selected={selected}
                                    />
                                </div>
                                <div className="relative z-10 flex flex-col items-end text-right md:hidden">
                                    <span className={cx('font-mono text-[12px] leading-none', selected ? 'text-white' : 'text-zinc-100')}>
                                        {pagesTab === 'page' ? shortNumber(row.pageviews) : shortNumber(row.sessions)}
                                    </span>
                                    <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-blue-50' : 'text-zinc-500')}>
                                        {pagesTab === 'page' ? `${secondaryLabel}: ${shortNumber(row.sessions)}` : `${secondaryLabel}: ${row.bounceRate.toFixed(1)}%`}
                                    </span>
                                    {showRevenue ? (
                                        <span className={cx('mt-0.5 font-mono text-[9px] leading-none', selected ? 'text-amber-200' : 'text-amber-300')}>
                                            {row.revenue ? formatMetricValue(row.revenue, 'currency') : '-'}
                                        </span>
                                    ) : null}
                                </div>
                                <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-white' : 'text-zinc-100')}>
                                    {pagesTab === 'page' ? shortNumber(row.pageviews) : shortNumber(row.sessions)}
                                </div>
                                <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-blue-50' : 'text-zinc-300')}>
                                    {pagesTab === 'page' ? shortNumber(row.sessions) : `${row.bounceRate.toFixed(1)}%`}
                                </div>
                                {showRevenue ? (
                                    <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, 'hidden md:block', selected ? 'text-amber-200' : 'text-amber-300')}>
                                        {row.revenue ? formatMetricValue(row.revenue, 'currency') : '-'}
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </DetailModal>
        </>
    );
}

function TopDevicesWidget() {
    const runtime = useOverviewRuntime();
    const {
        range,
        interval,
        startDate,
        endDate,
        filters,
        eventNames,
        addFilter,
        techTab,
        setTechTab,
        view,
        setView,
        hasFilter,
    } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const genericQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic', techTab, range, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, range, runtime.queryKey, startDate, techTab],
    );
    const seriesQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic-series', techTab, range, interval, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, interval, range, runtime.queryKey, startDate, techTab],
    );

    const query = useQuery<TopGenericResponse, Error>({
        queryKey: genericQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic', { filters, events: eventNames, extra: {
            column: techTab,
            range,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
    });
    const seriesQuery = useQuery<TopGenericSeriesResponse, Error>({
        queryKey: seriesQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic-series', { filters, events: eventNames, extra: {
            column: techTab,
            range,
            overrideInterval: interval,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
        enabled: view === 'chart',
    });

    const rows = useMemo(() => {
        const data = query.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => item.name.toLowerCase().includes(needle));
    }, [query.data?.items, searchQuery]);
    const chartItems = useMemo(() => {
        const data = seriesQuery.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => item.name.toLowerCase().includes(needle));
    }, [seriesQuery.data?.items, searchQuery]);

    return (
        <>
            <Widget className="col-span-6 md:col-span-3">
                <WidgetHeadSearchable
                    tabs={TECH_WIDGETS}
                    activeTab={techTab}
                    onTabChange={setTechTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={`Search ${TECH_WIDGETS.find((item) => item.key === techTab)?.label.toLowerCase() || 'devices'}`}
                />
            <QueryBoundaries
                title="devices"
                loading={view === 'chart' ? (seriesQuery.isLoading && !seriesQuery.data) : (query.isLoading && !query.data)}
                error={(view === 'chart' ? seriesQuery.error : query.error) || null}
                empty={view === 'chart' ? !chartItems.length : !rows.length}
            >
                {view === 'chart' ? (
                    <MultiSeriesLineChart items={chartItems} interval={interval} metric={query.data?.primaryMetric || 'sessions'} />
                ) : (
                    <GenericTable
                        rows={rows}
                        column={techTab}
                        onRowClick={(row) => addFilter(techTab, row.name)}
                        primaryMetric={query.data?.primaryMetric || 'sessions'}
                        secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                        valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                        secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                        isSelected={(row) => hasFilter(techTab, row.name)}
                        renderLabel={(row) => (
                            <OverviewInlineLabel
                                icon={iconForGenericValue(techTab, row.prefix || row.name)}
                                prefix={row.prefix ? formatOverviewValueLabel(techTab, row.prefix) : null}
                                label={formatOverviewValueLabel(techTab, row.name)}
                                selected={hasFilter(techTab, row.name)}
                            />
                        )}
                    />
                )}
            </QueryBoundaries>
            <WidgetFooter className="justify-between">
                <FooterDetailsButton onClick={() => setDetailsOpen(true)} />
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                    <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500">
                        {query.data?.supported === false ? 'Limited' : runtime.mode === 'share' ? 'Shared view' : 'Dashboard view'}
                    </span>
                    <OverviewViewToggle view={view} setView={setView} disabled={query.data?.supported === false} />
                </div>
            </WidgetFooter>
            </Widget>
            <DetailModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={`Devices — ${TECH_WIDGETS.find((item) => item.key === techTab)?.label || 'Details'}`}
                description="Expanded device breakdown with version, brand, and model aware labels where GA4 supports them."
            >
                <GenericTable
                    rows={rows}
                    column={techTab}
                    onRowClick={(row) => addFilter(techTab, row.name)}
                    primaryMetric={query.data?.primaryMetric || 'sessions'}
                    secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                    valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                    secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                    isSelected={(row) => hasFilter(techTab, row.name)}
                    limitRows={null}
                />
            </DetailModal>
        </>
    );
}

function TopEventsWidget({ token }: { token: string }) {
    const router = useRouter();
    const {
        range,
        startDate,
        endDate,
        filters,
        eventNames,
        eventTab,
        setEventTab,
    } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState<'label' | 'count' | null>('count');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const query = useQuery<TopEventsResponse, Error>({
        queryKey: ['share-overview', token, 'top-events', range, startDate, endDate, filters, eventNames],
        queryFn: () => fetchJson(`/api/share/${token}/overview/top-events?${buildSearch({
            filters,
            events: eventNames,
            extra: {
                range,
                start: startDate || undefined,
                end: endDate || undefined,
            },
        })}`),
    });

    const items = useMemo(() => {
        if (!query.data) return [];
        if (eventTab === 'conversions') return query.data.conversions;
        if (eventTab === 'link_out') return query.data.linkOut;
        return query.data.events;
    }, [eventTab, query.data]);
    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const needle = searchQuery.toLowerCase();
        return items.filter((item) => item.name.toLowerCase().includes(needle));
    }, [items, searchQuery]);
    const sortedItems = useMemo(() => {
        if (!sortColumn || !sortDirection) {
            return filteredItems;
        }

        const multiplier = sortDirection === 'desc' ? -1 : 1;
        const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

        return [...filteredItems].sort((left, right) => {
            if (sortColumn === 'label') {
                return collator.compare(left.name, right.name) * multiplier;
            }

            return (left.count - right.count) * multiplier;
        });
    }, [filteredItems, sortColumn, sortDirection]);
    const visibleItems = sortedItems.slice(0, OVERVIEW_TABLE_ROW_LIMIT);
    const maxCount = Math.max(...visibleItems.map((item) => item.count), 1);
    const limitedMessage =
        eventTab === 'conversions' && query.data?.supported.conversions === false
            ? 'Conversions are unavailable for this property in share mode'
            : eventTab === 'link_out' && query.data?.supported.linkOut === false
                ? 'Link-out events are unavailable for this property in share mode'
                : 'Event rows open the share-safe event report with the current overview state preserved';

    function openEventReport(eventName?: string) {
        const nextEvents = eventName
            ? Array.from(new Set([...eventNames, eventName]))
            : eventNames;
        const search = buildSearch({
            filters,
            events: nextEvents,
            extra: {
                range,
                start: startDate || undefined,
                end: endDate || undefined,
                ev: eventTab,
            },
        });
        router.push(`/share/${token}/events${search ? `?${search}` : ''}`);
    }

    function toggleSort(columnName: 'label' | 'count') {
        const next = nextSortState(columnName, sortColumn, sortDirection);
        setSortColumn(next.column as 'label' | 'count' | null);
        setSortDirection(next.direction);
    }

    return (
        <>
            <Widget className="col-span-6 md:col-span-3">
                <WidgetHeadSearchable
                    tabs={EVENT_WIDGETS.map((tab) => ({
                        ...tab,
                        disabled: (tab.key === 'conversions' && !query.data?.supported.conversions) || (tab.key === 'link_out' && !query.data?.supported.linkOut),
                    }))}
                    activeTab={eventTab}
                    onTabChange={setEventTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={`Search ${EVENT_WIDGETS.find((item) => item.key === eventTab)?.label.toLowerCase() || 'events'}`}
                />
            <QueryBoundaries title="events" loading={query.isLoading && !query.data} error={query.error || null} empty={!sortedItems.length}>
                <div className="min-h-[358px]">
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2.5 border-b border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-zinc-350 md:hidden">
                        <span>{eventTab === 'events' ? 'Event' : eventTab === 'conversions' ? 'Conversion' : 'Link out'}</span>
                        <span className="text-right">Count</span>
                    </div>
                    <div className={cx(OVERVIEW_TABLE_HEADER_BASE_CLASS, 'hidden md:grid md:grid-cols-[minmax(0,1fr)_84px]')}>
                        <SortableHeader
                            label={eventTab === 'events' ? 'Event' : eventTab === 'conversions' ? 'Conversion' : 'Link out'}
                            active={sortColumn === 'label'}
                            direction={sortDirection}
                            onClick={() => toggleSort('label')}
                        />
                        <SortableHeader
                            label="Count"
                            active={sortColumn === 'count'}
                            direction={sortDirection}
                            onClick={() => toggleSort('count')}
                            align="right"
                        />
                    </div>
                    {visibleItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={eventNames.includes(item.name)}
                            onClick={() => openEventReport(item.name)}
                            className={cx(
                                OVERVIEW_TABLE_ROW_BASE_CLASS,
                                'h-auto min-h-[40px] grid-cols-[minmax(0,1fr)_72px] px-3 py-1.5 md:h-8 md:min-h-8 md:grid-cols-[minmax(0,1fr)_84px] md:px-4 md:py-0',
                                eventNames.includes(item.name) ? 'bg-blue-500/[0.14]' : '',
                            )}
                        >
                            <div
                                className={cx(
                                    OVERVIEW_TABLE_FILL_BASE_CLASS,
                                    'group-hover:bg-blue-500/[0.10]',
                                    eventNames.includes(item.name) ? 'bg-blue-500/[0.18]' : 'bg-white/[0.035]',
                                )}
                                style={{ width: `${(item.count / maxCount) * 100}%` }}
                            />
                            <div className="relative z-10 min-w-0">
                                <OverviewInlineLabel
                                    icon={<OverviewValueIcon column={eventTab === 'link_out' ? 'link_out' : eventTab === 'conversions' ? 'conversions' : 'event'} value={item.name} />}
                                    label={item.name}
                                    selected={eventNames.includes(item.name)}
                                />
                            </div>
                            <div className={cx(OVERVIEW_TABLE_VALUE_BASE_CLASS, eventNames.includes(item.name) ? 'text-white' : 'text-zinc-100')}>{shortNumber(item.count)}</div>
                        </button>
                    ))}
                </div>
            </QueryBoundaries>
            <WidgetFooter className="justify-between">
                <FooterDetailsButton onClick={() => openEventReport()} disabled={!sortedItems.length} label="Open event report" />
                <span className="w-full text-left text-zinc-600 sm:w-auto sm:text-right">{limitedMessage}</span>
            </WidgetFooter>
            </Widget>
        </>
    );
}

function TopGeoTableWidget() {
    const runtime = useOverviewRuntime();
    const {
        range,
        interval,
        startDate,
        endDate,
        filters,
        eventNames,
        addFilter,
        geoTab,
        setGeoTab,
        view,
        setView,
        hasFilter,
    } = useShareOverviewState();
    const [searchQuery, setSearchQuery] = useState('');
    const [detailsOpen, setDetailsOpen] = useState(false);
    const genericQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic', geoTab, range, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, geoTab, range, runtime.queryKey, startDate],
    );
    const seriesQueryKey = useMemo(
        () => ['share-overview', runtime.queryKey, 'top-generic-series', geoTab, range, interval, startDate, endDate, filters, eventNames] as const,
        [endDate, eventNames, filters, geoTab, interval, range, runtime.queryKey, startDate],
    );

    const query = useQuery<TopGenericResponse, Error>({
        queryKey: genericQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic', { filters, events: eventNames, extra: {
            column: geoTab,
            range,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
    });
    const seriesQuery = useQuery<TopGenericSeriesResponse, Error>({
        queryKey: seriesQueryKey,
        queryFn: () => fetchJson(buildOverviewUrl(runtime, 'top-generic-series', { filters, events: eventNames, extra: {
            column: geoTab,
            range,
            overrideInterval: interval,
            start: startDate || undefined,
            end: endDate || undefined,
        } })),
        enabled: view === 'chart',
    });

    const rows = useMemo(() => {
        const data = query.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => `${item.prefix || ''} ${item.name}`.toLowerCase().includes(needle));
    }, [query.data?.items, searchQuery]);
    const chartItems = useMemo(() => {
        const data = seriesQuery.data?.items || [];
        if (!searchQuery.trim()) return data;
        const needle = searchQuery.toLowerCase();
        return data.filter((item) => `${item.prefix || ''} ${item.name}`.toLowerCase().includes(needle));
    }, [seriesQuery.data?.items, searchQuery]);

    return (
        <>
            <Widget className="col-span-6 md:col-span-3">
                <WidgetHeadSearchable
                    tabs={GEO_WIDGETS}
                    activeTab={geoTab}
                    onTabChange={setGeoTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={`Search ${GEO_WIDGETS.find((item) => item.key === geoTab)?.label.toLowerCase() || 'geo'}`}
                />
                <QueryBoundaries
                    title="geo"
                    loading={view === 'chart' ? (seriesQuery.isLoading && !seriesQuery.data) : (query.isLoading && !query.data)}
                    error={(view === 'chart' ? seriesQuery.error : query.error) || null}
                    empty={view === 'chart' ? !chartItems.length : !rows.length}
                >
                    {view === 'chart' ? (
                        <MultiSeriesLineChart items={chartItems} interval={interval} metric={query.data?.primaryMetric || 'sessions'} />
                    ) : (
                        <GenericTable
                            rows={rows}
                            column={geoTab}
                            onRowClick={(row) => {
                                addFilter(geoTab, row.name);
                                if (geoTab === 'country') setGeoTab('region');
                                else if (geoTab === 'region') setGeoTab('city');
                            }}
                            primaryMetric={query.data?.primaryMetric || 'sessions'}
                            secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                            valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                            secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                            isSelected={(row) => hasFilter(geoTab, row.name)}
                            renderLabel={(row) => (
                                <OverviewInlineLabel
                                    icon={<OverviewCountryFlag country={row.prefix || row.name} />}
                                    prefix={row.prefix ? formatOverviewValueLabel('country', row.prefix) : null}
                                    label={formatOverviewValueLabel(geoTab, row.name)}
                                    selected={hasFilter(geoTab, row.name)}
                                />
                            )}
                        />
                    )}
                </QueryBoundaries>
                <WidgetFooter className="justify-between">
                    <FooterDetailsButton onClick={() => setDetailsOpen(true)} />
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                        <span className="hidden rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-zinc-500 md:inline">
                            Geo data from share-safe GA4 totals
                        </span>
                        <OverviewViewToggle view={view} setView={setView} disabled={query.data?.supported === false} />
                    </div>
                </WidgetFooter>
            </Widget>
            <DetailModal
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={`Geo — ${GEO_WIDGETS.find((item) => item.key === geoTab)?.label || 'Details'}`}
                description="Expanded geography detail with drilldown-compatible labels."
            >
                <GenericTable
                    rows={rows}
                    column={geoTab}
                    onRowClick={(row) => {
                        addFilter(geoTab, row.name);
                        if (geoTab === 'country') setGeoTab('region');
                        else if (geoTab === 'region') setGeoTab('city');
                    }}
                    primaryMetric={query.data?.primaryMetric || 'sessions'}
                    secondaryMetric={query.data?.primaryMetric === 'pageviews' ? 'sessions' : 'pageviews'}
                    valueLabel={query.data?.primaryMetric === 'pageviews' ? 'Pageviews' : 'Sessions'}
                    secondaryLabel={query.data?.primaryMetric === 'pageviews' ? 'Sessions' : 'Pageviews'}
                    isSelected={(row) => hasFilter(geoTab, row.name)}
                    limitRows={null}
                    renderLabel={(row) => (
                        <OverviewInlineLabel
                            icon={<OverviewCountryFlag country={row.prefix || row.name} />}
                            prefix={row.prefix ? formatOverviewValueLabel('country', row.prefix) : null}
                            label={formatOverviewValueLabel(geoTab, row.name)}
                            selected={hasFilter(geoTab, row.name)}
                        />
                    )}
                />
            </DetailModal>
        </>
    );
}

function TopGeoMapWidget({
    liveData,
    loading,
    error,
}: {
    liveData?: LiveResponse;
    loading: boolean;
    error: Error | null;
}) {
    const { addFilter, setGeoTab, getFilterValues } = useShareOverviewState();
    const [visualization, setVisualization] = useState<GeoVisualizationMode>('globe');
    const geoVisualizationData = useMemo(() => buildRealtimeGeoVisualizationData(liveData), [liveData]);
    const geoInsights = useMemo(() => buildShareGeoInsights(liveData), [liveData]);
    const activeCountry = getFilterValues('country')[0] || null;

    function handleGeoSelection(name: string, type: 'country' | 'city') {
        if (type === 'city') {
            addFilter('city', name);
            setGeoTab('city');
            return;
        }

        addFilter('country', name);
        setGeoTab('region');
    }

    return (
        <Widget className="col-span-6 md:col-span-3" tone="cyan">
            <WidgetHead title="Live Geo">
                <div className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
                    <button
                        type="button"
                        onClick={() => setVisualization('globe')}
                        aria-pressed={visualization === 'globe'}
                        className={cx(
                            'dashboard-hover-chip inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition',
                            visualization === 'globe'
                                ? 'border-cyan-400/20 bg-cyan-400/[0.14] text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05)]'
                                : 'border-transparent text-zinc-500 hover:text-zinc-100',
                        )}
                    >
                        <Globe2 className="h-3.5 w-3.5" />
                        Globe
                    </button>
                    <button
                        type="button"
                        onClick={() => setVisualization('map')}
                        aria-pressed={visualization === 'map'}
                        className={cx(
                            'dashboard-hover-chip inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition',
                            visualization === 'map'
                                ? 'border-cyan-400/20 bg-cyan-400/[0.14] text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.05)]'
                                : 'border-transparent text-zinc-500 hover:text-zinc-100',
                        )}
                    >
                        <MapIcon className="h-3.5 w-3.5" />
                        Map
                    </button>
                </div>
            </WidgetHead>
            <div className="min-h-[358px] p-3">
                <QueryBoundaries
                    title="live geo"
                    loading={loading && !liveData}
                    error={error}
                    empty={!geoVisualizationData.byCountry.length && !geoVisualizationData.byCity.length}
                >
                    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#091118] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                        <div className="h-[296px] overflow-hidden border-b border-white/[0.08] bg-[#091118]">
                            {visualization === 'globe' ? (
                                <RealtimeGlobeMaplibre
                                    visitors={geoVisualizationData.visitors}
                                    byCountry={geoVisualizationData.byCountry}
                                    byCity={geoVisualizationData.byCity}
                                    autoPan={false}
                                    initialZoom={1.55}
                                />
                            ) : (
                                <WorldMap
                                    byCountry={geoVisualizationData.byCountry}
                                    byCity={geoVisualizationData.byCity}
                                    activeCountry={activeCountry}
                                    onBubbleClick={handleGeoSelection}
                                />
                            )}
                        </div>
                        <div className="grid border-t border-white/[0.04] bg-[linear-gradient(180deg,rgba(12,17,23,0.98),rgba(10,15,21,0.98))] lg:grid-cols-[0.95fr_1.05fr]">
                            <div className="border-b border-white/[0.06] lg:border-b-0 lg:border-r lg:border-white/[0.06]">
                                <ShareGeoStatsCard
                                    activeUsers={liveData?.activeUsers || 0}
                                    estTotalValue={geoInsights.estTotalValue}
                                    topCountries={geoInsights.topCountries}
                                    topReferrers={geoInsights.topReferrers}
                                />
                            </div>
                            <div className="min-w-0">
                                <ShareGeoActivityFeed items={geoInsights.activityFeed} />
                            </div>
                        </div>
                    </div>
                </QueryBoundaries>
            </div>
        </Widget>
    );
}

function ShareOverviewPage() {
    const runtime = useOverviewRuntime();
    const isEmbeddedShare = runtime.mode === 'share' && runtime.embedMode;
    const searchParams = useSearchParams();
    const {
        range,
        setRange,
        setInterval,
        setMetric,
        filters,
        eventNames,
        upsertFilter,
        getFilterValues,
    } = useShareOverviewState();
    const didHydrateRangeRef = useRef(false);
    const didSeedDefaultsRef = useRef(false);
    const handleRangeChange = (value: string) => setRange(value as ShareOverviewRange);

    /* ─── Live-preview overrides (Share Studio postMessage) ─── */
    const [previewOverrides, setPreviewOverrides] = useState<StudioPreviewOverrides>({});

    useEffect(() => {
        if (runtime.mode !== 'share') return;
        function onMessage(event: MessageEvent) {
            // Only same-origin (Studio runs on the same domain as the iframe).
            if (typeof window === 'undefined' || event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || typeof data !== 'object' || data.type !== STUDIO_PREVIEW_MESSAGE_TYPE) return;
            const next: StudioPreviewOverrides = {};
            if ('accentColor' in data) next.accentColor = data.accentColor;
            if (data.branding && typeof data.branding === 'object') next.branding = data.branding;
            if (Array.isArray(data.sectionOrder)) next.sectionOrder = data.sectionOrder;
            if (data.sectionVisibility && typeof data.sectionVisibility === 'object') {
                next.sectionVisibility = data.sectionVisibility;
            }
            setPreviewOverrides(next);
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [runtime.mode]);

    /* Resolve accent + branding + section settings from share config (share mode only),
     * with Studio postMessage overrides taking precedence when present. */
    const accentColor =
        previewOverrides.accentColor ?? runtime.config?.theme.accentColor ?? DEFAULT_SHARE_ACCENT;
    const branding = {
        logoUrl: previewOverrides.branding?.logoUrl ?? runtime.config?.branding.logoUrl ?? null,
        companyName:
            previewOverrides.branding?.companyName ?? runtime.config?.branding.companyName ?? null,
        showWatermark:
            previewOverrides.branding?.showWatermark ??
            runtime.config?.branding.showWatermark ??
            true,
    };
    const showWatermark = branding.showWatermark;
    const sectionOrder: ShareSectionId[] = previewOverrides.sectionOrder?.length
        ? previewOverrides.sectionOrder
        : runtime.config?.sectionOrder?.length
            ? runtime.config.sectionOrder
            : DEFAULT_SECTION_ORDER;
    const sectionVisibility = previewOverrides.sectionVisibility
        ?? runtime.config?.sectionVisibility
        ?? null;

    useEffect(() => {
        if (runtime.mode !== 'dashboard' || didHydrateRangeRef.current) {
            return;
        }

        didHydrateRangeRef.current = true;
        const hasExplicitRange = searchParams.has('range') || searchParams.has('start') || searchParams.has('end');
        if (!hasExplicitRange && runtime.initialRange && runtime.initialRange !== range) {
            setRange(runtime.initialRange as ShareOverviewRange);
        }
    }, [range, runtime.initialRange, runtime.mode, searchParams, setRange]);

    /* Seed Studio-defined defaults (range / interval / metric / filter) once on first mount,
     * only when the visitor has no URL params for them yet. */
    useEffect(() => {
        if (runtime.mode !== 'share' || didSeedDefaultsRef.current) return;
        const cfgDefaults = runtime.config?.defaults;
        if (!cfgDefaults) return;
        didSeedDefaultsRef.current = true;

        if (cfgDefaults.range && !searchParams.has('range') && !searchParams.has('start') && !searchParams.has('end')) {
            setRange(cfgDefaults.range as ShareOverviewRange);
        }
        if (cfgDefaults.interval && cfgDefaults.interval !== 'auto' && !searchParams.has('overrideInterval') && !searchParams.has('interval')) {
            setInterval(cfgDefaults.interval);
        }
        if (typeof cfgDefaults.metricIndex === 'number' && cfgDefaults.metricIndex >= 0 && !searchParams.has('metric')) {
            setMetric(cfgDefaults.metricIndex);
        }
        if (cfgDefaults.filter && !searchParams.has('f') && !searchParams.has('filters')) {
            const dim = cfgDefaults.filter.dimension as ShareOverviewFilter['name'];
            if (SHARE_OVERVIEW_FILTER_NAMES.includes(dim) && !getFilterValues(dim).includes(cfgDefaults.filter.value)) {
                upsertFilter({ name: dim, operator: 'is', value: [cfgDefaults.filter.value] });
            }
        }
    }, [runtime.mode, runtime.config, searchParams, setRange, setInterval, setMetric, upsertFilter, getFilterValues]);

    useEffect(() => {
        if (runtime.mode === 'dashboard' && runtime.onRangeChange) {
            runtime.onRangeChange(range);
        }
    }, [range, runtime]);

    const liveEndpoint = runtime.mode === 'dashboard' ? 'live-visitors' : 'live';
    const liveRefreshInterval = runtime.mode === 'dashboard' ? 30_000 : LIVE_DATA_POLL_INTERVAL_MS;

    const liveQuery = useQuery<LiveOverviewResponse, Error>({
        queryKey: ['share-overview', runtime.queryKey, liveEndpoint, filters, eventNames],
        queryFn: () => fetchJson(buildOverviewUrl(runtime, liveEndpoint, { filters, events: eventNames })),
        placeholderData: keepPreviousData,
        staleTime: liveRefreshInterval,
        refetchInterval: liveRefreshInterval,
    });
    const debouncedLiveVisitors = useDebouncedLiveValue(liveQuery.data?.activeUsers || 0, 1_000, LIVE_RECONCILE_INTERVAL_MS);

    // OpenPanel-style minimal controls: just a date picker (with the
    // "Time window" dropdown) and the LiveNowPill. The granularity tabs
    // (Hour/Day/Week/Month) and Filters button were removed — granularity
    // falls back to the default `interval` from useShareOverviewState, and
    // any filters that arrive via the `?f=` URL param are still applied
    // server-side, just not exposed in the UI. The branded [Logo]
    // TrafficClaw strip on top is shown ONLY for iframe embeds — the full
    // /share/[token] page already has its own richer header above this.
    const controls = (
        <div className={cx(
            isEmbeddedShare
                ? 'border-b border-white/[0.08] bg-[#080b0e]/92'
                : runtime.mode === 'share'
                ? 'sticky top-0 z-30 border-b border-white/[0.08] bg-[#080b0e]/92 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-xl'
                : 'sticky top-0 z-20 rounded-[14px] border border-white/[0.08] bg-[#070a0d]/94 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl',
        )}>
            <div className={cx(runtime.mode === 'share' && !isEmbeddedShare ? 'mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4' : 'px-3 py-3 sm:px-4 sm:py-4')}>
                {isEmbeddedShare && !runtime.hideOwnerLogo ? (
                    <div className="mb-5 flex items-center">
                        <a
                            href="https://trafficclaw.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-md transition hover:opacity-90"
                            aria-label="TrafficClaw home"
                        >
                            <Logo size="sm" />
                        </a>
                    </div>
                ) : null}
                <div className="hidden items-center justify-between gap-3 md:flex">
                    <DatePicker range={range} setRange={handleRangeChange} chevrons={false} />
                    <div className="flex items-center gap-2">
                        {runtime.mode === 'dashboard' && runtime.onShareDashboard ? (
                            <ShareDashboardButton onClick={runtime.onShareDashboard} />
                        ) : null}
                        <LiveNowPill activeUsers={debouncedLiveVisitors} />
                    </div>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:hidden">
                    <DatePicker range={range} setRange={handleRangeChange} compact chevrons={false} />
                    <div className="flex items-center gap-2">
                        {runtime.mode === 'dashboard' && runtime.onShareDashboard ? (
                            <ShareDashboardButton onClick={runtime.onShareDashboard} compact />
                        ) : null}
                        <LiveNowPill activeUsers={debouncedLiveVisitors} compact />
                    </div>
                </div>
            </div>
        </div>
    );

    /* Render registry — each section block is keyed by ShareSectionId. */
    const renderSection = (id: ShareSectionId) => {
        switch (id) {
            case 'metrics':
                return <OverviewMetrics key={id} liveData={liveQuery.data} />;
            case 'sources':
                return <TopSourcesWidget key={id} />;
            case 'geo':
                return <TopGeoTableWidget key={id} />;
            case 'devices':
                return <TopDevicesWidget key={id} />;
            case 'pages':
                return <TopPagesWidget key={id} />;
            case 'events':
                return runtime.mode === 'share' ? <TopEventsWidget key={id} token={runtime.queryKey} /> : null;
            case 'liveGeo':
                return runtime.mode === 'share'
                    ? <TopGeoMapWidget key={id} liveData={liveQuery.data as LiveResponse | undefined} loading={liveQuery.isLoading} error={liveQuery.error || null} />
                    : null;
            default:
                return null;
        }
    };

    const isVisible = (id: ShareSectionId) =>
        sectionVisibility ? sectionVisibility[id] !== false : true;

    const contentGrid = (
        <div className={cx(
            runtime.mode === 'share'
                ? isEmbeddedShare
                    ? 'grid grid-cols-6 gap-3 p-3 sm:gap-4 sm:p-4'
                    : 'mx-auto grid max-w-7xl grid-cols-6 gap-3 p-3 sm:gap-4 sm:p-4'
                : 'grid grid-cols-6 gap-3 pt-4 sm:gap-4',
        )}>
            {sectionOrder.map((id) => (isVisible(id) ? renderSection(id) : null))}
        </div>
    );

    /* Apply Studio accent color via CSS variable for descendants that use var(--share-accent). */
    const accentStyle: React.CSSProperties & Record<string, string> = {
        ['--share-accent' as string]: accentColor,
    };

    const watermarkFooter = runtime.mode === 'share' && showWatermark ? (
        <div className={cx('text-center', isEmbeddedShare ? 'pb-4' : 'pb-8')}>
            <a
                href="https://trafficclaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
                Built with TrafficClaw
            </a>
        </div>
    ) : null;

    return (
        <ShareAccentContext.Provider value={accentColor}>
            {runtime.mode === 'share' ? (
                <div
                    className="min-h-screen overflow-x-hidden bg-[#080b0e] text-zinc-100"
                    style={accentStyle}
                >
                    {isEmbeddedShare ? null : (
                        <div className="border-b border-white/[0.06] bg-[#07090c]">
                            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                <div className="min-w-0">
                                    <div className="mb-1 flex items-center gap-3">
                                        {branding?.logoUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={branding.logoUrl}
                                                alt={branding.companyName || 'Logo'}
                                                className="h-7 w-auto shrink-0 object-contain"
                                            />
                                        ) : (
                                            <Logo size="sm" className="shrink-0" />
                                        )}
                                        <span className="dashboard-hover-chip inline-flex items-center rounded-full border border-cyan-400/15 bg-cyan-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                                            {branding?.companyName || 'Shared analytics'}
                                        </span>
                                    </div>
                                    {runtime.siteUrl ? <div className="truncate text-xs text-zinc-500">Analytics for <span className="font-mono text-zinc-300">{runtime.siteUrl}</span></div> : null}
                                </div>
                                <div className="shrink-0 sm:text-right">
                                    <div className="text-xs text-zinc-500">Share visits</div>
                                    <div className="font-mono text-lg text-zinc-100">{shortNumber(runtime.views)}</div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className={cx(isEmbeddedShare ? 'mx-auto w-full max-w-7xl' : '')}>
                        {controls}
                        {contentGrid}
                        {watermarkFooter}
                    </div>
                </div>
            ) : (
                <div className="space-y-4 text-zinc-100" style={accentStyle}>
                    {controls}
                    {contentGrid}
                </div>
            )}
        </ShareAccentContext.Provider>
    );
}

export default function SharedOverviewClient({
    mode = 'share',
    token,
    propertyId,
    siteUrl,
    demoMode = false,
    views = 0,
    initialRange,
    onRangeChange,
    onShareDashboard,
    embedMode = false,
    config = null,
    hideOwnerLogo = false,
}: {
    mode?: SharedOverviewMode;
    token?: string;
    propertyId?: string;
    siteUrl?: string;
    demoMode?: boolean;
    views?: number;
    initialRange?: string;
    onRangeChange?: (value: string) => void;
    onShareDashboard?: () => void;
    embedMode?: boolean;
    config?: NormalizedShareConfig | null;
    hideOwnerLogo?: boolean;
}) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: OVERVIEW_QUERY_STALE_MS,
                gcTime: 10 * 60 * 1000,
                placeholderData: keepPreviousData,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    }));
    const runtime = useMemo<OverviewRuntime | null>(() => {
        if (mode === 'dashboard') {
            if (!propertyId && !demoMode) {
                return null;
            }

            return {
                mode,
                queryKey: propertyId || 'demo-workspace',
                apiBasePath: '/api/analytics/overview',
                baseParams: { propertyId, demo: demoMode ? '1' : undefined },
                siteUrl,
                demoMode,
                views,
                embedMode: false,
                initialRange,
                onRangeChange,
                onShareDashboard,
                config: null,
            };
        }

        if (!token) {
            return null;
        }

        return {
            mode: 'share',
            queryKey: token,
            apiBasePath: `/api/share/${token}/overview`,
            siteUrl,
            views,
            embedMode,
            config,
            hideOwnerLogo,
        };
    }, [config, demoMode, embedMode, hideOwnerLogo, initialRange, mode, onRangeChange, onShareDashboard, propertyId, siteUrl, token, views]);

    if (!runtime) {
        return null;
    }

    return (
        <QueryClientProvider client={queryClient}>
            <NuqsAdapter>
                <OverviewRuntimeContext.Provider value={runtime}>
                    <ShareOverviewPage />
                </OverviewRuntimeContext.Provider>
            </NuqsAdapter>
        </QueryClientProvider>
    );
}
