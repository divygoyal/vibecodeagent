'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Clock3,
    Eye,
    FileText,
    Globe2,
    MonitorSmartphone,
    RefreshCw,
    Users,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import DatePicker from '@/components/DatePicker';
import DataRow from '@/components/analytics/DataRow';
import {
    BrowserIcon,
    CountryFlag,
    DeviceIcon,
    OSIcon,
    ReferrerIcon,
} from '@/components/analytics/AnalyticsIcons';

interface ShareConfig {
    traffic: boolean;
    sources: boolean;
    pages: boolean;
    geo: boolean;
    technology?: boolean;
    seo: boolean;
}

interface GaKpis {
    totalUsers: number;
    totalSessions: number;
    totalPageViews: number;
    avgBounceRate: number;
    avgSessionDuration: number;
    newUsers: number;
    returningUsers: number;
    pagesPerSession: number;
    changeUsers: number;
    changeSessions: number;
    changePageViews: number;
    changeBounceRate: number;
}

interface TrafficPointRaw {
    date: string;
    activeUsers: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
}

interface SourceItem {
    source: string;
    sessions: number;
    users: number;
    percentage: number;
}

interface PageItem {
    page: string;
    title: string;
    views: number;
    uniqueViews: number;
    avgTime: string;
    bounceRate: number;
}

interface CountryItem {
    country: string;
    users: number;
    sessions: number;
    percentage: number;
}

interface DeviceItem {
    device: string;
    sessions: number;
    users: number;
    percentage: number;
}

interface NamedMetricItem {
    name: string;
    value: number;
    users?: number;
    percentage: number;
}

interface CityItem {
    city: string;
    country: string;
    users: number;
}

interface RegionItem {
    region: string;
    country: string;
    users: number;
}

interface EntryPageItem {
    page: string;
    sessions: number;
    users: number;
    bounceRate: number;
    percentage: number;
}

interface SeoKpis {
    totalClicks: number;
    totalImpressions: number;
    avgCTR: number;
    avgPosition: number;
    changeClicks: number;
    changeImpressions: number;
    changeCTR: number;
    changePosition: number;
}

interface SeoQuery {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

interface SeoData {
    kpis: SeoKpis;
    queries: SeoQuery[];
}

interface RawApiResponse {
    kpis?: GaKpis;
    traffic?: TrafficPointRaw[];
    sources?: SourceItem[];
    pages?: PageItem[];
    countries?: CountryItem[];
    devices?: DeviceItem[];
    browsers?: NamedMetricItem[];
    operatingSystems?: NamedMetricItem[];
    channels?: NamedMetricItem[];
    referrers?: NamedMetricItem[];
    cities?: CityItem[];
    regions?: RegionItem[];
    entryPages?: EntryPageItem[];
    languages?: NamedMetricItem[];
    seo?: SeoData | null;
    seoError?: string;
}

type PageListItem = PageItem & { percentage: number };
type CityListItem = CityItem & { percentage: number };
type RegionListItem = RegionItem & { percentage: number };

interface TrendPoint {
    date: string;
    fullDate: string;
    users: number;
    sessions: number;
    views: number;
    bounceRate: number;
}

interface DashboardData {
    kpis: GaKpis | null;
    trafficTrend: TrendPoint[];
    sourceMedium: SourceItem[];
    referrers: NamedMetricItem[];
    channels: NamedMetricItem[];
    pages: PageListItem[];
    entryPages: EntryPageItem[];
    devices: DeviceItem[];
    browsers: NamedMetricItem[];
    operatingSystems: NamedMetricItem[];
    countries: CountryItem[];
    cities: CityListItem[];
    regions: RegionListItem[];
    languages: NamedMetricItem[];
    seo: SeoData | null;
    seoError: string | null;
    peakDay: TrendPoint | null;
    topChannel: NamedMetricItem | null;
    topBrowser: NamedMetricItem | null;
    topCountry: CountryItem | null;
}

interface PanelRow {
    key: string;
    label: string;
    value: number;
    percentage: number;
    icon?: ReactNode;
    href?: string;
    barColor: string;
}

interface PanelSection {
    leftLabel: string;
    rightLabel: string;
    rows: PanelRow[];
}

interface SharedDashboardClientProps {
    token: string;
    config: ShareConfig;
    siteUrl?: string;
    views?: number;
}

type SourceTab = 'referrers' | 'channels' | 'sources';
type PageTab = 'pages' | 'entries';
type TechnologyTab = 'browsers' | 'devices' | 'os';
type GeographyTab = 'countries' | 'regions' | 'cities' | 'languages';
type OverviewTone = 'emerald' | 'teal' | 'amber' | 'violet' | 'red';

const RANGE_LABELS: Record<string, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    '7d': 'Last 7 days',
    '14d': 'Last 14 days',
    '30d': 'Last 30 days',
    '60d': 'Last 60 days',
    '90d': 'Last 90 days',
    this_week: 'This week',
    last_week: 'Last week',
    this_month: 'This month',
    last_month: 'Last month',
    this_year: 'This year',
    last_year: 'Last year',
    '6m': 'Last 6 months',
    '12m': 'Last 12 months',
    all: 'All time',
};

const PANEL_COLORS = [
    '#34d399', '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24',
    '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#38bdf8',
    '#f87171', '#a3e635', '#c084fc', '#2dd4bf', '#facc15',
];

const CHANNEL_COLORS: Record<string, string> = {
    'Organic Search': '#34d399',
    Direct: '#22d3ee',
    Referral: '#fb923c',
    Social: '#a78bfa',
    'Paid Search': '#f472b6',
    Email: '#fbbf24',
    Display: '#60a5fa',
    Affiliates: '#4ade80',
    Video: '#e879f9',
    'Organic Social': '#2dd4bf',
};

const REFERRER_COLORS: Record<string, string> = {
    google: '#34d399',
    '(direct)': '#22d3ee',
    bing: '#60a5fa',
    yahoo: '#a78bfa',
    duckduckgo: '#fb923c',
    facebook: '#3b82f6',
    twitter: '#38bdf8',
    linkedin: '#0ea5e9',
    reddit: '#f87171',
    youtube: '#f472b6',
    instagram: '#e879f9',
    pinterest: '#f472b6',
    baidu: '#fbbf24',
};

function formatNumber(value: number): string {
    return value.toLocaleString('en-US');
}

function formatCompactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString('en-US');
}

function formatDuration(seconds: number): string {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatIsoDate(isoDate: string, options: Intl.DateTimeFormatOptions): string {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', options);
}

function addPercentages<T extends object>(items: T[], getValue: (item: T) => number): Array<T & { percentage: number }> {
    const total = items.reduce((sum, item) => sum + getValue(item), 0);
    return items.map((item) => ({
        ...item,
        percentage: total > 0 ? +((getValue(item) / total) * 100).toFixed(1) : 0,
    }));
}

function getItemColor(name: string, index: number, colorMap?: Record<string, string>): string {
    if (colorMap) {
        const matchedKey = Object.keys(colorMap).find((key) => name.toLowerCase().includes(key.toLowerCase()));
        if (matchedKey) return colorMap[matchedKey];
    }
    return PANEL_COLORS[index % PANEL_COLORS.length];
}

function getMaxPercentage(items: Array<{ percentage: number }>): number {
    return items.reduce((max, item) => Math.max(max, item.percentage), 0) || 100;
}

function sharedToneStyles(tone: OverviewTone) {
    if (tone === 'red') {
        return {
            accent: 'text-red-300',
            chip: 'border-red-500/18 bg-red-500/10 text-red-200',
            iconWrap: 'border-red-500/16 bg-red-500/10',
            barGradient: 'linear-gradient(180deg,#fda4af 0%,#f87171 42%,#7f1d1d 100%)',
            barShadow: '0 0 18px rgba(248,113,113,0.18)',
        };
    }
    if (tone === 'amber') {
        return {
            accent: 'text-amber-300',
            chip: 'border-amber-500/18 bg-amber-500/10 text-amber-200',
            iconWrap: 'border-amber-500/16 bg-amber-500/10',
            barGradient: 'linear-gradient(180deg,#fde68a 0%,#fbbf24 42%,#854d0e 100%)',
            barShadow: '0 0 18px rgba(251,191,36,0.18)',
        };
    }
    if (tone === 'violet') {
        return {
            accent: 'text-violet-300',
            chip: 'border-violet-500/18 bg-violet-500/10 text-violet-200',
            iconWrap: 'border-violet-500/16 bg-violet-500/10',
            barGradient: 'linear-gradient(180deg,#c4b5fd 0%,#8b5cf6 42%,#4c1d95 100%)',
            barShadow: '0 0 18px rgba(139,92,246,0.18)',
        };
    }
    if (tone === 'teal') {
        return {
            accent: 'text-cyan-300',
            chip: 'border-cyan-500/18 bg-cyan-500/10 text-cyan-200',
            iconWrap: 'border-cyan-500/16 bg-cyan-500/10',
            barGradient: 'linear-gradient(180deg,#67e8f9 0%,#22d3ee 42%,#155e75 100%)',
            barShadow: '0 0 18px rgba(34,211,238,0.18)',
        };
    }

    return {
        accent: 'text-emerald-300',
        chip: 'border-emerald-500/18 bg-emerald-500/10 text-emerald-200',
        iconWrap: 'border-emerald-500/16 bg-emerald-500/10',
        barGradient: 'linear-gradient(180deg,#86efac 0%,#34d399 42%,#065f46 100%)',
        barShadow: '0 0 18px rgba(52,211,153,0.18)',
    };
}

function inferOverviewTone(label: string): OverviewTone {
    if (label === 'Users' || label === 'Clicks') return 'emerald';
    if (label === 'Sessions' || label === 'Page Views' || label === 'Impressions') return 'teal';
    if (label === 'Bounce Rate' || label === 'Avg. Position') return 'amber';
    if (label === 'Avg. CTR') return 'violet';
    return 'teal';
}

function buildMetricBars(values: number[]) {
    const fallback = [22, 18, 28, 30, 34, 26, 38, 44, 40, 52, 48, 58];
    const source = values.length > 1 ? values : fallback;
    const min = Math.min(...source);
    const max = Math.max(...source);
    const range = max - min || 1;

    return source.map((value, index) => {
        const normalized = 20 + ((value - min) / range) * 56;
        return {
            height: `${Math.round(normalized)}%`,
            opacity: index < Math.max(source.length - 4, 1) ? 0.58 : 1,
        };
    });
}

function getReferrerHref(referrer: string): string | undefined {
    if (!referrer || referrer === '(direct)' || referrer === '(not set)' || !referrer.includes('.')) {
        return undefined;
    }

    const normalized = referrer.startsWith('http://') || referrer.startsWith('https://')
        ? referrer
        : `https://${referrer}`;
    return normalized;
}

function transformData(raw: RawApiResponse): DashboardData {
    const trafficTrend = (raw.traffic || []).map((point) => ({
        date: formatIsoDate(point.date, { month: 'short', day: 'numeric' }),
        fullDate: formatIsoDate(point.date, { month: 'long', day: 'numeric', year: 'numeric' }),
        users: point.activeUsers,
        sessions: point.sessions,
        views: point.pageViews,
        bounceRate: point.bounceRate,
    }));

    const pages = addPercentages(raw.pages || [], (page) => page.views);
    const cities = addPercentages(raw.cities || [], (city) => city.users);
    const regions = addPercentages(raw.regions || [], (region) => region.users);

    const peakDay = trafficTrend.reduce<TrendPoint | null>((best, day) => {
        if (!best || day.sessions > best.sessions) return day;
        return best;
    }, null);

    return {
        kpis: raw.kpis || null,
        trafficTrend,
        sourceMedium: raw.sources || [],
        referrers: raw.referrers || [],
        channels: raw.channels || [],
        pages,
        entryPages: raw.entryPages || [],
        devices: raw.devices || [],
        browsers: raw.browsers || [],
        operatingSystems: raw.operatingSystems || [],
        countries: raw.countries || [],
        cities,
        regions,
        languages: raw.languages || [],
        seo: raw.seo || null,
        seoError: raw.seoError || null,
        peakDay,
        topChannel: (raw.channels || [])[0] || null,
        topBrowser: (raw.browsers || [])[0] || null,
        topCountry: (raw.countries || [])[0] || null,
    };
}

function hasRenderableData(data: DashboardData | null): boolean {
    if (!data) return false;
    return Boolean(
        data.kpis ||
        data.trafficTrend.length ||
        data.sourceMedium.length ||
        data.referrers.length ||
        data.channels.length ||
        data.pages.length ||
        data.entryPages.length ||
        data.devices.length ||
        data.browsers.length ||
        data.operatingSystems.length ||
        data.countries.length ||
        data.cities.length ||
        data.regions.length ||
        data.languages.length ||
        data.seo?.kpis ||
        data.seo?.queries.length
    );
}

function TrendTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ value: number; dataKey: string; color: string; payload: TrendPoint }>;
}) {
    if (!active || !payload?.length) return null;

    const point = payload[0]?.payload;
    if (!point) return null;

    return (
        <div className="rounded-2xl border border-white/[0.1] bg-[#050507]/95 px-4 py-3 shadow-2xl backdrop-blur">
            <p className="mb-2 text-xs font-semibold text-white">{point.fullDate}</p>
            <div className="space-y-1.5 text-xs">
                {payload.map((entry) => (
                    <div key={entry.dataKey} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-zinc-400">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            {entry.dataKey === 'sessions' ? 'Sessions' : 'Users'}
                        </span>
                        <span className="font-medium text-zinc-100">{formatNumber(entry.value)}</span>
                    </div>
                ))}
                <div className="flex items-center justify-between gap-6 border-t border-white/[0.06] pt-2 text-xs">
                    <span className="text-zinc-500">Page views</span>
                    <span className="font-medium text-zinc-300">{formatNumber(point.views)}</span>
                </div>
            </div>
        </div>
    );
}

function ChangeBadge({ value, inverse = false, suffix = '%' }: { value?: number; inverse?: boolean; suffix?: string }) {
    if (value === undefined || value === null) {
        return <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-zinc-400">No comparison</span>;
    }

    if (value === 0) {
        return <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-zinc-400">Flat vs previous</span>;
    }

    const positive = inverse ? value < 0 : value > 0;
    const Icon = positive ? ArrowUpRight : ArrowDownRight;
    const tone = positive
        ? 'border-emerald-500/18 bg-emerald-500/10 text-emerald-200'
        : 'border-rose-500/18 bg-rose-500/10 text-rose-200';

    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {Math.abs(value).toFixed(1)}{suffix}
        </span>
    );
}

function OverviewBars({ values, tone }: { values?: number[]; tone: OverviewTone }) {
    const style = sharedToneStyles(tone);
    const bars = buildMetricBars(values || []);

    return (
        <div className="flex h-14 items-end gap-1.5">
            {bars.map((bar, index) => (
                <span
                    key={`${tone}-${index}`}
                    className="block h-full flex-1 rounded-[5px]"
                    style={{
                        height: bar.height,
                        opacity: bar.opacity,
                        background: style.barGradient,
                        boxShadow: style.barShadow,
                    }}
                />
            ))}
        </div>
    );
}

function OverviewCard({
    label,
    value,
    icon,
    helper,
    change,
    changeInverse = false,
    changeSuffix,
    values,
    tone,
}: {
    label: string;
    value: string;
    icon: ReactNode;
    helper: string;
    change?: number;
    changeInverse?: boolean;
    changeSuffix?: string;
    values?: number[];
    tone?: OverviewTone;
}) {
    const resolvedTone = tone || inferOverviewTone(label);
    const style = sharedToneStyles(resolvedTone);

    return (
        <div className="premium-card relative overflow-hidden rounded-[24px] p-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.08),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.06),transparent_28%)]" />
            <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${style.iconWrap} ${style.accent}`}>
                                {icon}
                            </div>
                            <span className="truncate">{label}</span>
                        </div>
                        <p className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</p>
                    </div>
                    {change !== undefined ? <ChangeBadge value={change} inverse={changeInverse} suffix={changeSuffix} /> : null}
                </div>
                <OverviewBars values={values} tone={resolvedTone} />
                <p className="mt-3 text-xs leading-6 text-zinc-500">{helper}</p>
            </div>
        </div>
    );
}

function SignalCard({
    label,
    value,
    helper,
    icon,
}: {
    label: string;
    value: string;
    helper: string;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-[22px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(10,16,22,0.95),rgba(5,9,13,0.98))] p-4 shadow-[0_18px_36px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
                <span className="text-zinc-400">{icon}</span>
            </div>
            <p className="text-sm font-semibold text-zinc-100">{value}</p>
            <p className="mt-1 text-xs text-zinc-500">{helper}</p>
        </div>
    );
}

function PanelFrame({
    title,
    tabs,
    activeTab,
    onTabChange,
    leftLabel,
    rightLabel,
    rightSlot,
    children,
}: {
    title: string;
    tabs: Array<{ value: string; label: string }>;
    activeTab: string;
    onTabChange: (value: string) => void;
    leftLabel: string;
    rightLabel: string;
    rightSlot?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="premium-card overflow-hidden rounded-3xl">
            <div className="border-b border-white/[0.06] px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">{title}</h3>
                            <div className="flex flex-wrap gap-1">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.value}
                                        onClick={() => onTabChange(tab.value)}
                                        className={`rounded-lg px-3 py-1.5 text-sm transition ${
                                            activeTab === tab.value
                                                ? 'border border-cyan-500/18 bg-cyan-500/10 font-semibold text-cyan-100'
                                                : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {rightSlot ? <div className="flex items-center gap-1">{rightSlot}</div> : null}
                </div>
            </div>
            <div className="flex items-center justify-between px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                <span>{leftLabel}</span>
                <div className="flex items-center gap-4">
                    <span>{rightLabel}</span>
                    <span className="text-zinc-700">Share</span>
                </div>
            </div>
            {children}
        </section>
    );
}

function PanelEmpty({ title }: { title: string }) {
    return (
        <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-center">
            <div>
                <p className="text-sm font-medium text-zinc-300">No {title.toLowerCase()} data in this range</p>
                <p className="mt-1 text-xs text-zinc-500">Try a broader date range to surface more detail.</p>
            </div>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="space-y-4">
            <div className="premium-card animate-pulse rounded-3xl p-6">
                <div className="h-4 w-32 rounded bg-white/[0.08]" />
                <div className="mt-4 h-9 w-72 rounded bg-white/[0.08]" />
                <div className="mt-3 h-4 w-full max-w-2xl rounded bg-white/[0.05]" />
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((item) => (
                        <div key={item} className="h-28 rounded-2xl bg-white/[0.04]" />
                    ))}
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                    <div key={item} className="premium-card h-40 animate-pulse rounded-2xl bg-white/[0.03]" />
                ))}
            </div>
            <div className="premium-card h-[420px] animate-pulse rounded-3xl bg-white/[0.03]" />
        </div>
    );
}

export default function SharedDashboardClient({
    token,
    config,
    siteUrl,
    views,
}: SharedDashboardClientProps) {
    const [range, setRange] = useState('30d');
    const [rawData, setRawData] = useState<RawApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sourceTab, setSourceTab] = useState<SourceTab>('referrers');
    const [pageTab, setPageTab] = useState<PageTab>('pages');
    const [technologyTab, setTechnologyTab] = useState<TechnologyTab>('browsers');
    const [geographyTab, setGeographyTab] = useState<GeographyTab>('countries');

    const showTechnology = config.technology ?? true;

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        async function loadData() {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/share/${token}/data?range=${encodeURIComponent(range)}`, {
                    cache: 'no-store',
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    throw new Error((body as { error?: string }).error || 'Failed to load analytics data');
                }

                const nextData = await response.json() as RawApiResponse;
                if (!active) return;
                setRawData(nextData);
            } catch (err) {
                if (!active || controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : 'Failed to load analytics data');
            } finally {
                if (active) setLoading(false);
            }
        }

        loadData();

        return () => {
            active = false;
            controller.abort();
        };
    }, [token, range]);

    const data = useMemo(() => (rawData ? transformData(rawData) : null), [rawData]);

    const overviewCards = useMemo(() => {
        if (!data?.kpis) return [];

        return [
            {
                label: 'Users',
                value: formatNumber(data.kpis.totalUsers),
                helper: `${formatNumber(data.kpis.newUsers)} new visitors`,
                change: data.kpis.changeUsers,
                icon: <Users className="h-5 w-5" />,
                values: data.trafficTrend.map((point) => point.users).slice(-12),
                tone: 'emerald' as const,
            },
            {
                label: 'Sessions',
                value: formatNumber(data.kpis.totalSessions),
                helper: `${formatNumber(data.kpis.returningUsers)} returning visitors`,
                change: data.kpis.changeSessions,
                icon: <Activity className="h-5 w-5" />,
                values: data.trafficTrend.map((point) => point.sessions).slice(-12),
                tone: 'teal' as const,
            },
            {
                label: 'Page Views',
                value: formatNumber(data.kpis.totalPageViews),
                helper: `${data.kpis.pagesPerSession.toFixed(1)} pages per session`,
                change: data.kpis.changePageViews,
                icon: <Eye className="h-5 w-5" />,
                values: data.trafficTrend.map((point) => point.views).slice(-12),
                tone: 'teal' as const,
            },
            {
                label: 'Bounce Rate',
                value: `${data.kpis.avgBounceRate.toFixed(1)}%`,
                helper: 'Lower is better for engagement',
                change: data.kpis.changeBounceRate,
                changeInverse: true,
                changeSuffix: ' pts',
                icon: <ArrowDownRight className="h-5 w-5" />,
                values: data.trafficTrend.map((point) => point.bounceRate).slice(-12),
                tone: 'amber' as const,
            },
            {
                label: 'Avg. Session',
                value: formatDuration(data.kpis.avgSessionDuration),
                helper: 'Average visit duration',
                icon: <Clock3 className="h-5 w-5" />,
                tone: 'violet' as const,
            },
            {
                label: 'Pages / Session',
                value: data.kpis.pagesPerSession.toFixed(1),
                helper: 'Average content depth',
                icon: <FileText className="h-5 w-5" />,
                values: data.trafficTrend.map((point) => point.views / Math.max(point.sessions || 1, 1)).slice(-12),
                tone: 'violet' as const,
            },
        ];
    }, [data]);

    const signalCards = useMemo(() => {
        if (!data) return [];

        const items: Array<{ label: string; value: string; helper: string; icon: ReactNode }> = [];

        if (data.peakDay) {
            items.push({
                label: 'Peak Traffic Day',
                value: data.peakDay.fullDate,
                helper: `${formatCompactNumber(data.peakDay.sessions)} sessions`,
                icon: <BarChart3 className="h-4 w-4" />,
            });
        }

        if (config.sources && data.topChannel) {
            items.push({
                label: 'Leading Channel',
                value: data.topChannel.name,
                helper: `${data.topChannel.percentage.toFixed(1)}% of sessions`,
                icon: <Activity className="h-4 w-4" />,
            });
        }

        if (showTechnology && data.topBrowser) {
            items.push({
                label: 'Top Browser',
                value: data.topBrowser.name,
                helper: `${data.topBrowser.percentage.toFixed(1)}% of sessions`,
                icon: <MonitorSmartphone className="h-4 w-4" />,
            });
        }

        if (config.geo && data.topCountry) {
            items.push({
                label: 'Top Country',
                value: data.topCountry.country,
                helper: `${formatCompactNumber(data.topCountry.users)} users`,
                icon: <Globe2 className="h-4 w-4" />,
            });
        }

        return items.slice(0, 4);
    }, [config.geo, config.sources, data, showTechnology]);

    const sourcePanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (sourceTab === 'channels') {
            return {
                leftLabel: 'Channel',
                rightLabel: 'Sessions',
                rows: data.channels.map((item, index) => ({
                    key: item.name,
                    label: item.name,
                    value: item.value,
                    percentage: item.percentage,
                    barColor: getItemColor(item.name, index, CHANNEL_COLORS),
                } satisfies PanelRow)),
            };
        }

        if (sourceTab === 'sources') {
            return {
                leftLabel: 'Source / Medium',
                rightLabel: 'Sessions',
                rows: data.sourceMedium.map((item, index) => ({
                    key: item.source,
                    label: item.source,
                    value: item.sessions,
                    percentage: item.percentage,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        return {
            leftLabel: 'Referrer',
            rightLabel: 'Sessions',
            rows: data.referrers.map((item, index) => ({
                key: item.name,
                label: item.name,
                value: item.value,
                percentage: item.percentage,
                icon: <ReferrerIcon referrer={item.name} />,
                href: getReferrerHref(item.name),
                barColor: getItemColor(item.name, index, REFERRER_COLORS),
            } satisfies PanelRow)),
        };
    }, [data, sourceTab]);

    const pagesPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (pageTab === 'entries') {
            return {
                leftLabel: 'Entry Page',
                rightLabel: 'Sessions',
                rows: data.entryPages.map((item, index) => ({
                    key: item.page,
                    label: item.page,
                    value: item.sessions,
                    percentage: item.percentage,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        return {
            leftLabel: 'Page',
            rightLabel: 'Views',
            rows: data.pages.map((item, index) => ({
                key: item.page,
                label: item.page,
                value: item.views,
                percentage: item.percentage,
                barColor: PANEL_COLORS[index % PANEL_COLORS.length],
            } satisfies PanelRow)),
        };
    }, [data, pageTab]);

    const technologyPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (technologyTab === 'devices') {
            return {
                leftLabel: 'Device',
                rightLabel: 'Sessions',
                rows: data.devices.map((item, index) => ({
                    key: item.device,
                    label: item.device,
                    value: item.sessions,
                    percentage: item.percentage,
                    icon: <DeviceIcon device={item.device} />,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        if (technologyTab === 'os') {
            return {
                leftLabel: 'Operating System',
                rightLabel: 'Sessions',
                rows: data.operatingSystems.map((item, index) => ({
                    key: item.name,
                    label: item.name,
                    value: item.value,
                    percentage: item.percentage,
                    icon: <OSIcon os={item.name} />,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        return {
            leftLabel: 'Browser',
            rightLabel: 'Sessions',
            rows: data.browsers.map((item, index) => ({
                key: item.name,
                label: item.name,
                value: item.value,
                percentage: item.percentage,
                icon: <BrowserIcon browser={item.name} />,
                barColor: PANEL_COLORS[index % PANEL_COLORS.length],
            } satisfies PanelRow)),
        };
    }, [data, technologyTab]);

    const geographyPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (geographyTab === 'regions') {
            return {
                leftLabel: 'Region',
                rightLabel: 'Users',
                rows: data.regions.map((item, index) => ({
                    key: `${item.region}-${item.country}-${index}`,
                    label: item.country && item.country !== '(not set)' ? `${item.region}, ${item.country}` : item.region,
                    value: item.users,
                    percentage: item.percentage,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        if (geographyTab === 'cities') {
            return {
                leftLabel: 'City',
                rightLabel: 'Users',
                rows: data.cities.map((item, index) => ({
                    key: `${item.city}-${item.country}-${index}`,
                    label: item.country && item.country !== '(not set)' ? `${item.city}, ${item.country}` : item.city,
                    value: item.users,
                    percentage: item.percentage,
                    icon: <CountryFlag country={item.country} />,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        if (geographyTab === 'languages') {
            return {
                leftLabel: 'Language',
                rightLabel: 'Users',
                rows: data.languages.map((item, index) => ({
                    key: item.name,
                    label: item.name,
                    value: item.users ?? item.value,
                    percentage: item.percentage,
                    barColor: PANEL_COLORS[index % PANEL_COLORS.length],
                } satisfies PanelRow)),
            };
        }

        return {
            leftLabel: 'Country',
            rightLabel: 'Users',
            rows: data.countries.map((item, index) => ({
                key: item.country,
                label: item.country,
                value: item.users,
                percentage: item.percentage,
                icon: <CountryFlag country={item.country} />,
                barColor: PANEL_COLORS[index % PANEL_COLORS.length],
            } satisfies PanelRow)),
        };
    }, [data, geographyTab]);

    const isRefreshing = loading && !!data;
    const showEmptyState = !loading && !error && data && !hasRenderableData(data);

    if (loading && !data) {
        return <LoadingState />;
    }

    if (error && !data) {
        return (
            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-6">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
                        <RefreshCw className="h-4 w-4" />
                    </div>
                    <div>
                        <p className="text-base font-semibold text-amber-200">Analytics data is temporarily unavailable</p>
                        <p className="mt-1 text-sm text-zinc-400">
                            {error}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="premium-card rounded-[28px] p-6 sm:p-7">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                            Public Analytics Snapshot
                        </div>
                        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Shared analytics overview</h2>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">
                            A read-only dashboard with acquisition, content, audience, and search insights across the period the owner chose to share.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {siteUrl ? (
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                                    <span className="text-zinc-500">Site</span>{' '}
                                    <span className="font-mono text-zinc-200">{siteUrl}</span>
                                </span>
                            ) : null}
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                                <span className="text-zinc-500">Range</span>{' '}
                                {RANGE_LABELS[range] || range}
                            </span>
                            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                                <span className="text-zinc-500">Compare</span>{' '}
                                Previous period
                            </span>
                            {typeof views === 'number' ? (
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                                    <span className="text-zinc-500">Views</span>{' '}
                                    {formatNumber(views)}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 pb-4 xl:items-end">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Date range</span>
                        <DatePicker range={range} setRange={setRange} />
                        <div className="flex min-h-[20px] items-center gap-2 text-xs text-zinc-500">
                            {isRefreshing ? (
                                <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Refreshing shared metrics...
                                </>
                            ) : (
                                'Metrics refresh automatically when the range changes.'
                            )}
                        </div>
                    </div>
                </div>

                {signalCards.length > 0 ? (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {signalCards.map((signal) => (
                            <SignalCard
                                key={signal.label}
                                label={signal.label}
                                value={signal.value}
                                helper={signal.helper}
                                icon={signal.icon}
                            />
                        ))}
                    </div>
                ) : null}
            </section>

            {error && data ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
                    Showing the last successfully loaded snapshot. {error}
                </div>
            ) : null}

            {config.traffic && overviewCards.length > 0 ? (
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {overviewCards.map((card) => (
                        <OverviewCard
                            key={card.label}
                            label={card.label}
                            value={card.value}
                            icon={card.icon}
                            helper={card.helper}
                            change={card.change}
                            changeInverse={card.changeInverse}
                            changeSuffix={card.changeSuffix}
                            values={card.values}
                            tone={card.tone}
                        />
                    ))}
                </section>
            ) : null}

            {config.traffic && data?.trafficTrend.length ? (
                <section className="premium-card rounded-[28px] p-6 sm:p-7">
                    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h3 className="text-xl font-semibold text-white">Traffic overview</h3>
                            <p className="mt-1 text-sm text-zinc-500">
                                Users and sessions trend for {RANGE_LABELS[range] || range}.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                                Avg. daily sessions {formatCompactNumber(Math.round(data.kpis ? data.kpis.totalSessions / Math.max(data.trafficTrend.length, 1) : 0))}
                            </span>
                            {data.peakDay ? (
                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-cyan-300">
                                    Peak {formatCompactNumber(data.peakDay.sessions)} on {data.peakDay.date}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.trafficTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="shared-users-gradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="shared-sessions-gradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
                                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 11, fill: '#71717a' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#71717a' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => formatCompactNumber(value)}
                                />
                                <Tooltip content={<TrendTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="users"
                                    stroke="#34d399"
                                    strokeWidth={2}
                                    fill="url(#shared-users-gradient)"
                                    fillOpacity={1}
                                    dot={false}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="sessions"
                                    stroke="#22d3ee"
                                    strokeWidth={2}
                                    fill="url(#shared-sessions-gradient)"
                                    fillOpacity={1}
                                    dot={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                        <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Users
                        </span>
                        <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" /> Sessions
                        </span>
                    </div>
                </section>
            ) : null}

            {(config.sources || config.pages) && data ? (
                <section className={`grid gap-4 ${config.sources && config.pages ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {config.sources ? (
                        <PanelFrame
                            title="Traffic Sources"
                            tabs={[
                                { value: 'referrers', label: 'Referrers' },
                                { value: 'channels', label: 'Channels' },
                                { value: 'sources', label: 'Source / Medium' },
                            ]}
                            activeTab={sourceTab}
                            onTabChange={(value) => setSourceTab(value as SourceTab)}
                            leftLabel={sourcePanel?.leftLabel || 'Source'}
                            rightLabel={sourcePanel?.rightLabel || 'Sessions'}
                        >
                            {sourcePanel && sourcePanel.rows.length > 0 ? (
                                <div className="max-h-[360px] space-y-0.5 overflow-y-auto px-2 pb-3">
                                    {sourcePanel.rows.slice(0, 15).map((row) => (
                                        <DataRow
                                            key={row.key}
                                            label={row.label}
                                            value={row.value}
                                            percentage={row.percentage}
                                            maxPercentage={getMaxPercentage(sourcePanel.rows)}
                                            icon={row.icon}
                                            href={row.href}
                                            barColor={row.barColor}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <PanelEmpty title="Traffic Sources" />
                            )}
                        </PanelFrame>
                    ) : null}

                    {config.pages ? (
                        <PanelFrame
                            title="Top Pages"
                            tabs={[
                                { value: 'pages', label: 'Pages' },
                                { value: 'entries', label: 'Entry Pages' },
                            ]}
                            activeTab={pageTab}
                            onTabChange={(value) => setPageTab(value as PageTab)}
                            leftLabel={pagesPanel?.leftLabel || 'Page'}
                            rightLabel={pagesPanel?.rightLabel || 'Views'}
                        >
                            {pagesPanel && pagesPanel.rows.length > 0 ? (
                                <div className="max-h-[360px] space-y-0.5 overflow-y-auto px-2 pb-3">
                                    {pagesPanel.rows.slice(0, 15).map((row) => (
                                        <DataRow
                                            key={row.key}
                                            label={row.label}
                                            value={row.value}
                                            percentage={row.percentage}
                                            maxPercentage={getMaxPercentage(pagesPanel.rows)}
                                            icon={row.icon}
                                            href={row.href}
                                            barColor={row.barColor}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <PanelEmpty title="Top Pages" />
                            )}
                        </PanelFrame>
                    ) : null}
                </section>
            ) : null}

            {(showTechnology || config.geo) && data ? (
                <section className={`grid gap-4 ${(showTechnology && config.geo) ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {showTechnology ? (
                        <PanelFrame
                            title="Technology"
                            tabs={[
                                { value: 'browsers', label: 'Browsers' },
                                { value: 'devices', label: 'Devices' },
                                { value: 'os', label: 'OS' },
                            ]}
                            activeTab={technologyTab}
                            onTabChange={(value) => setTechnologyTab(value as TechnologyTab)}
                            leftLabel={technologyPanel?.leftLabel || 'Technology'}
                            rightLabel={technologyPanel?.rightLabel || 'Sessions'}
                        >
                            {technologyPanel && technologyPanel.rows.length > 0 ? (
                                <div className="max-h-[360px] space-y-0.5 overflow-y-auto px-2 pb-3">
                                    {technologyPanel.rows.slice(0, 15).map((row) => (
                                        <DataRow
                                            key={row.key}
                                            label={row.label}
                                            value={row.value}
                                            percentage={row.percentage}
                                            maxPercentage={getMaxPercentage(technologyPanel.rows)}
                                            icon={row.icon}
                                            href={row.href}
                                            barColor={row.barColor}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <PanelEmpty title="Technology" />
                            )}
                        </PanelFrame>
                    ) : null}

                    {config.geo ? (
                        <PanelFrame
                            title="Geography"
                            tabs={[
                                { value: 'countries', label: 'Countries' },
                                { value: 'regions', label: 'Regions' },
                                { value: 'cities', label: 'Cities' },
                                { value: 'languages', label: 'Languages' },
                            ]}
                            activeTab={geographyTab}
                            onTabChange={(value) => setGeographyTab(value as GeographyTab)}
                            leftLabel={geographyPanel?.leftLabel || 'Country'}
                            rightLabel={geographyPanel?.rightLabel || 'Users'}
                            rightSlot={data.countries.slice(0, 4).map((country) => (
                                <CountryFlag key={country.country} country={country.country} />
                            ))}
                        >
                            {geographyPanel && geographyPanel.rows.length > 0 ? (
                                <div className="max-h-[360px] space-y-0.5 overflow-y-auto px-2 pb-3">
                                    {geographyPanel.rows.slice(0, 15).map((row) => (
                                        <DataRow
                                            key={row.key}
                                            label={row.label}
                                            value={row.value}
                                            percentage={row.percentage}
                                            maxPercentage={getMaxPercentage(geographyPanel.rows)}
                                            icon={row.icon}
                                            href={row.href}
                                            barColor={row.barColor}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <PanelEmpty title="Geography" />
                            )}
                        </PanelFrame>
                    ) : null}
                </section>
            ) : null}

            {config.seo && data?.seo ? (
                <section className="premium-card rounded-[28px] p-6 sm:p-7">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h3 className="text-xl font-semibold text-white">SEO Performance</h3>
                            <p className="mt-1 text-sm text-zinc-500">Search Console highlights for the shared property.</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <OverviewCard
                            label="Clicks"
                            value={formatNumber(data.seo.kpis.totalClicks)}
                            helper="Organic search clicks"
                            change={data.seo.kpis.changeClicks}
                            icon={<Activity className="h-5 w-5" />}
                            values={data.seo.queries.slice(0, 12).map((query) => query.clicks)}
                            tone="emerald"
                        />
                        <OverviewCard
                            label="Impressions"
                            value={formatNumber(data.seo.kpis.totalImpressions)}
                            helper="Search result appearances"
                            change={data.seo.kpis.changeImpressions}
                            icon={<Eye className="h-5 w-5" />}
                            values={data.seo.queries.slice(0, 12).map((query) => query.impressions)}
                            tone="teal"
                        />
                        <OverviewCard
                            label="Avg. CTR"
                            value={`${data.seo.kpis.avgCTR}%`}
                            helper="Click-through rate"
                            change={data.seo.kpis.changeCTR}
                            icon={<ArrowUpRight className="h-5 w-5" />}
                            values={data.seo.queries.slice(0, 12).map((query) => query.ctr)}
                            tone="violet"
                        />
                        <OverviewCard
                            label="Avg. Position"
                            value={`${data.seo.kpis.avgPosition}`}
                            helper="Lower is better"
                            change={data.seo.kpis.changePosition}
                            changeInverse
                            changeSuffix=""
                            icon={<BarChart3 className="h-5 w-5" />}
                            values={data.seo.queries.slice(0, 12).map((query) => query.position)}
                            tone="amber"
                        />
                    </div>

                    {data.seo.queries.length > 0 ? (
                        <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                            <div className="border-b border-white/[0.06] px-5 py-3">
                                <h4 className="text-sm font-semibold text-white">Top Queries</h4>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/[0.06] text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                                            <th className="px-5 py-3">Query</th>
                                            <th className="px-5 py-3 text-right">Clicks</th>
                                            <th className="px-5 py-3 text-right">Impressions</th>
                                            <th className="px-5 py-3 text-right">CTR</th>
                                            <th className="px-5 py-3 text-right">Position</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.seo.queries.slice(0, 10).map((query) => (
                                            <tr key={query.query} className="border-b border-white/[0.04] last:border-0">
                                                <td className="max-w-[360px] truncate px-5 py-3 text-zinc-200">{query.query}</td>
                                                <td className="px-5 py-3 text-right text-zinc-300">{formatNumber(query.clicks)}</td>
                                                <td className="px-5 py-3 text-right text-zinc-400">{formatNumber(query.impressions)}</td>
                                                <td className="px-5 py-3 text-right text-zinc-400">{query.ctr}%</td>
                                                <td className="px-5 py-3 text-right text-zinc-400">{query.position}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {config.seo && !data?.seo && data?.seoError ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
                    <h3 className="text-sm font-semibold text-white">SEO Performance</h3>
                    <p className="mt-1 text-sm text-zinc-500">{data.seoError}</p>
                </div>
            ) : null}

            {showEmptyState ? (
                <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-10 text-center">
                    <p className="text-base font-semibold text-zinc-200">No analytics data in this range</p>
                    <p className="mt-2 text-sm text-zinc-500">
                        This shared dashboard is live, but the selected period does not have enough data to render the detailed panels yet.
                    </p>
                </div>
            ) : null}
        </div>
    );
}
