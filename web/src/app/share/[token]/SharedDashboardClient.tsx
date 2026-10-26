'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Activity,
    BarChart3,
    ExternalLink,
    Globe2,
    Loader2,
    MonitorSmartphone,
    RefreshCw,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { fmtCompact, fmtDuration, fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { categoricalColor, channelColor, deviceColor, METRICS, type MetricKey } from '@/lib/metrics';
import DatePicker, { getRangeLabel } from '@/components/DatePicker';
import {
    BrowserIcon,
    CountryFlag,
    DeviceIcon,
    OSIcon,
    ReferrerIcon,
} from '@/components/analytics/AnalyticsIcons';
import { Banner } from '@/components/ui/Banner';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { DeltaArrow } from '@/components/ui/MetricDelta';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { BarList, type BarListItem } from '@/components/charts/BarList';
import { Sparkline } from '@/components/charts/Sparkline';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';

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
    /** 'YYYY-MM-DD' (chart rows). */
    iso: string;
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
    icon?: ReactNode;
    href?: string;
}

interface PanelSection {
    leftLabel: string;
    rightLabel: string;
    /** Heat-bar colour and value format of the list. */
    metric: MetricKey;
    rows: PanelRow[];
}

interface SharedDashboardClientProps {
    token: string;
    config: ShareConfig;
    /** Shown by the page header (ShareHeader); kept for callers. */
    siteUrl?: string;
    views?: number;
}

type SourceTab = 'referrers' | 'channels' | 'sources';
type PageTab = 'pages' | 'entries';
type TechnologyTab = 'browsers' | 'devices' | 'os';
type GeographyTab = 'countries' | 'regions' | 'cities' | 'languages';
type TrendMetric = 'users' | 'sessions' | 'pageviews';

/** Field of TrendPoint for each chart metric. */
const TREND_KEY: Record<TrendMetric, 'users' | 'sessions' | 'views'> = { users: 'users', sessions: 'sessions', pageviews: 'views' };

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
        iso: point.date,
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

// ─── Small pieces ───────────────────────────────────────────────────────────

type ChangeUnit = 'percent' | 'points' | 'absolute';

function trimZero(n: number): string {
    return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Change versus the previous period as the API reports it (percent for counts,
 * points for rates, absolute for position). Same look as MetricDelta's chip.
 */
function ChangeChip({ value, inverse = false, unit = 'percent' }: { value?: number | null; inverse?: boolean; unit?: ChangeUnit }) {
    if (value === undefined || value === null || !Number.isFinite(value)) return null;
    const suffix = unit === 'percent' ? '%' : unit === 'points' ? ' pt' : '';
    const abs = Math.abs(value);
    const base = 'inline-flex h-5 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-badge px-1.5 text-meta font-medium tabular-nums';
    if (abs < 0.05) {
        return <span className={cn(base, 'bg-subtle text-fg-muted')} title="No change versus the previous period">{`0${suffix}`}</span>;
    }
    const text = `${abs >= 99.95 ? Math.round(abs) : trimZero(abs)}${suffix}`;
    const rose = value > 0;
    const good = inverse ? !rose : rose;
    // Position: the arrow shows the way the rank moved (up = better), like MetricDelta.
    const direction: 'up' | 'down' = unit === 'absolute' && inverse ? (good ? 'up' : 'down') : rose ? 'up' : 'down';
    return (
        <span className={cn(base, good ? 'bg-up-soft text-up' : 'bg-down-soft text-down')} title="Versus the previous period">
            <DeltaArrow direction={direction} />
            <span aria-hidden>{text}</span>
            <span className="sr-only">{`${rose ? 'up' : 'down'} ${text} versus the previous period`}</span>
        </span>
    );
}

/** KPI tile: metric dot, label, value, change, helper, optional sparkline. */
function KpiTile({
    metric,
    label,
    value,
    title,
    change,
    changeInverse,
    changeUnit,
    helper,
    values,
}: {
    /** Colour family (DESIGN 2.3: bounce, duration and depth borrow sessions). */
    metric: MetricKey;
    label: string;
    value: string;
    /** Exact value for the tooltip. */
    title?: string;
    change?: number;
    changeInverse?: boolean;
    changeUnit?: ChangeUnit;
    helper?: string;
    values?: number[];
}) {
    const color = METRICS[metric].color;
    return (
        <Card padding="sm" className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-stat text-fg" title={title}>{value}</span>
                <ChangeChip value={change} inverse={changeInverse} unit={changeUnit} />
            </div>
            {helper ? <p className="text-meta text-fg-muted">{helper}</p> : null}
            {values && values.length > 1 ? (
                <div className="mt-2">
                    <Sparkline series={[{ metric, values }]} height={40} interactive={false} />
                </div>
            ) : null}
        </Card>
    );
}

function SignalCard({ label, value, helper, icon }: { label: string; value: string; helper: string; icon: ReactNode }) {
    return (
        <Card padding="sm" className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-3 text-body-sm text-fg-muted">
                <span className="truncate">{label}</span>
                <span aria-hidden className="shrink-0 text-fg-faint">{icon}</span>
            </div>
            <p className="truncate text-title-sm text-fg" title={value}>{value}</p>
            <p className="mt-0.5 text-meta text-fg-muted tabular-nums">{helper}</p>
        </Card>
    );
}

/** Breakdown card: title + pill tabs, column labels, heat-bar list. */
function PanelFrame<T extends string>({
    title,
    tabs,
    activeTab,
    onTabChange,
    panel,
    emptyLabel,
}: {
    title: string;
    tabs: Array<{ value: T; label: string }>;
    activeTab: T;
    onTabChange: (value: T) => void;
    panel: PanelSection | null;
    emptyLabel: string;
}) {
    const items: BarListItem[] = (panel?.rows ?? []).map((row) => ({
        key: row.key,
        text: row.label,
        value: row.value,
        icon: row.icon,
        label: row.href ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="truncate">{row.label}</span>
                <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${row.label}`}
                    className="shrink-0 text-fg-faint opacity-0 transition-opacity duration-120 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
                >
                    <ExternalLink aria-hidden size={12} strokeWidth={1.75} />
                </a>
            </span>
        ) : row.label,
    }));

    return (
        <Card as="section" padding="none" className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-subtle px-4 py-3">
                <h3 className="text-title-sm text-fg">{title}</h3>
                <Tabs<T>
                    variant="pills"
                    items={tabs}
                    value={activeTab}
                    onValueChange={onTabChange}
                    ariaLabel={`${title} breakdown`}
                    className="max-w-full"
                />
            </div>
            {items.length > 0 && panel ? (
                <div className="px-3 pt-2 pb-3">
                    <div className="flex items-center justify-between gap-3 px-2 pb-1 text-caption tracking-[0.04em] text-fg-muted uppercase">
                        <span className="truncate">{panel.leftLabel}</span>
                        <span className="flex shrink-0 gap-1">
                            <span>{panel.rightLabel}</span>
                            <span className="w-12 text-right">Share</span>
                        </span>
                    </div>
                    <BarList
                        items={items}
                        metric={panel.metric}
                        limit={10}
                        showShare
                        labelHeader={panel.leftLabel}
                        valueHeader={panel.rightLabel}
                        viewAllTitle={title}
                    />
                </div>
            ) : (
                <EmptyState
                    variant="inline"
                    title={`No ${emptyLabel} data in this range`}
                    description="Try a longer date range."
                    className="min-h-[220px] justify-center"
                />
            )}
        </Card>
    );
}

function LoadingState() {
    return (
        <div className="space-y-6" aria-busy aria-label="Loading shared analytics">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-9 w-56" rounded="md" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-[84px]" rounded="card" />
                ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                    <Skeleton key={item} className="h-[150px]" rounded="card" />
                ))}
            </div>
            <Skeleton className="h-[360px]" rounded="card" />
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SharedDashboardClient({
    token,
    config,
}: SharedDashboardClientProps) {
    const [range, setRange] = useState('30d');
    const [rawData, setRawData] = useState<RawApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sourceTab, setSourceTab] = useState<SourceTab>('referrers');
    const [pageTab, setPageTab] = useState<PageTab>('pages');
    const [technologyTab, setTechnologyTab] = useState<TechnologyTab>('browsers');
    const [geographyTab, setGeographyTab] = useState<GeographyTab>('countries');
    const [trendMetric, setTrendMetric] = useState<TrendMetric>('users');

    const showTechnology = config.technology ?? true;
    const rangeLabel = getRangeLabel(range);

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

    const kpiTiles = useMemo(() => {
        if (!data?.kpis) return [];
        const k = data.kpis;
        const trend = data.trafficTrend;

        return [
            {
                metric: 'users' as const,
                label: 'Users',
                value: fmtCompact(k.totalUsers),
                title: fmtFull(k.totalUsers),
                helper: `${fmtFull(k.newUsers)} new visitors`,
                change: k.changeUsers,
                values: trend.map((point) => point.users),
            },
            {
                metric: 'sessions' as const,
                label: 'Sessions',
                value: fmtCompact(k.totalSessions),
                title: fmtFull(k.totalSessions),
                helper: `${fmtFull(k.returningUsers)} returning visitors`,
                change: k.changeSessions,
                values: trend.map((point) => point.sessions),
            },
            {
                metric: 'pageviews' as const,
                label: 'Pageviews',
                value: fmtCompact(k.totalPageViews),
                title: fmtFull(k.totalPageViews),
                helper: `${k.pagesPerSession.toFixed(1)} pages per session`,
                change: k.changePageViews,
                values: trend.map((point) => point.views),
            },
            {
                metric: 'sessions' as const,
                label: 'Bounce rate',
                value: fmtPercent(k.avgBounceRate / 100, { tile: true }),
                helper: 'Lower is better',
                change: k.changeBounceRate,
                changeInverse: true,
                changeUnit: 'points' as const,
                values: trend.map((point) => point.bounceRate),
            },
            {
                metric: 'sessions' as const,
                label: 'Avg. session',
                value: fmtDuration(k.avgSessionDuration),
                helper: 'Average visit duration',
            },
            {
                metric: 'sessions' as const,
                label: 'Pages per session',
                value: k.pagesPerSession.toFixed(1),
                helper: 'Average content depth',
                values: trend.map((point) => point.views / Math.max(point.sessions || 1, 1)),
            },
        ];
    }, [data]);

    const signalCards = useMemo(() => {
        if (!data) return [];

        const items: Array<{ label: string; value: string; helper: string; icon: ReactNode }> = [];

        if (data.peakDay) {
            items.push({
                label: 'Peak traffic day',
                value: data.peakDay.fullDate,
                helper: `${fmtCompact(data.peakDay.sessions)} sessions`,
                icon: <BarChart3 size={16} strokeWidth={1.75} />,
            });
        }

        if (config.sources && data.topChannel) {
            items.push({
                label: 'Leading channel',
                value: data.topChannel.name,
                helper: `${fmtPercent(data.topChannel.percentage / 100)} of sessions`,
                icon: <Activity size={16} strokeWidth={1.75} />,
            });
        }

        if (showTechnology && data.topBrowser) {
            items.push({
                label: 'Top browser',
                value: data.topBrowser.name,
                helper: `${fmtPercent(data.topBrowser.percentage / 100)} of sessions`,
                icon: <MonitorSmartphone size={16} strokeWidth={1.75} />,
            });
        }

        if (config.geo && data.topCountry) {
            items.push({
                label: 'Top country',
                value: data.topCountry.country,
                helper: `${fmtCompact(data.topCountry.users)} users`,
                icon: <Globe2 size={16} strokeWidth={1.75} />,
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
                metric: 'sessions',
                rows: data.channels.map((item) => ({
                    key: item.name,
                    label: item.name,
                    value: item.value,
                    icon: <span aria-hidden className="size-2 rounded-full" style={{ background: channelColor(item.name) }} />,
                })),
            };
        }

        if (sourceTab === 'sources') {
            return {
                leftLabel: 'Source / medium',
                rightLabel: 'Sessions',
                metric: 'sessions',
                rows: data.sourceMedium.map((item) => ({
                    key: item.source,
                    label: item.source,
                    value: item.sessions,
                })),
            };
        }

        return {
            leftLabel: 'Referrer',
            rightLabel: 'Sessions',
            metric: 'sessions',
            rows: data.referrers.map((item) => ({
                key: item.name,
                label: item.name,
                value: item.value,
                icon: item.name.includes('.') ? <Favicon host={item.name} size={16} /> : <ReferrerIcon referrer={item.name} />,
                href: getReferrerHref(item.name),
            })),
        };
    }, [data, sourceTab]);

    const pagesPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (pageTab === 'entries') {
            return {
                leftLabel: 'Entry page',
                rightLabel: 'Sessions',
                metric: 'sessions',
                rows: data.entryPages.map((item) => ({
                    key: item.page,
                    label: item.page,
                    value: item.sessions,
                })),
            };
        }

        return {
            leftLabel: 'Page',
            rightLabel: 'Views',
            metric: 'pageviews',
            rows: data.pages.map((item) => ({
                key: item.page,
                label: item.page,
                value: item.views,
            })),
        };
    }, [data, pageTab]);

    const technologyPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (technologyTab === 'devices') {
            return {
                leftLabel: 'Device',
                rightLabel: 'Sessions',
                metric: 'sessions',
                rows: data.devices.map((item) => ({
                    key: item.device,
                    label: item.device,
                    value: item.sessions,
                    icon: (
                        <span className="flex items-center gap-1">
                            <span aria-hidden className="size-2 rounded-full" style={{ background: deviceColor(item.device) }} />
                            <DeviceIcon device={item.device} />
                        </span>
                    ),
                })),
            };
        }

        if (technologyTab === 'os') {
            return {
                leftLabel: 'Operating system',
                rightLabel: 'Sessions',
                metric: 'sessions',
                rows: data.operatingSystems.map((item) => ({
                    key: item.name,
                    label: item.name,
                    value: item.value,
                    icon: <OSIcon os={item.name} />,
                })),
            };
        }

        return {
            leftLabel: 'Browser',
            rightLabel: 'Sessions',
            metric: 'sessions',
            rows: data.browsers.map((item) => ({
                key: item.name,
                label: item.name,
                value: item.value,
                icon: <BrowserIcon browser={item.name} />,
            })),
        };
    }, [data, technologyTab]);

    const geographyPanel = useMemo<PanelSection | null>(() => {
        if (!data) return null;

        if (geographyTab === 'regions') {
            return {
                leftLabel: 'Region',
                rightLabel: 'Users',
                metric: 'users',
                rows: data.regions.map((item, index) => ({
                    key: `${item.region}-${item.country}-${index}`,
                    label: item.country && item.country !== '(not set)' ? `${item.region}, ${item.country}` : item.region,
                    value: item.users,
                    icon: <CountryFlag country={item.country} />,
                })),
            };
        }

        if (geographyTab === 'cities') {
            return {
                leftLabel: 'City',
                rightLabel: 'Users',
                metric: 'users',
                rows: data.cities.map((item, index) => ({
                    key: `${item.city}-${item.country}-${index}`,
                    label: item.country && item.country !== '(not set)' ? `${item.city}, ${item.country}` : item.city,
                    value: item.users,
                    icon: <CountryFlag country={item.country} />,
                })),
            };
        }

        if (geographyTab === 'languages') {
            return {
                leftLabel: 'Language',
                rightLabel: 'Users',
                metric: 'users',
                rows: data.languages.map((item, index) => ({
                    key: item.name,
                    label: item.name,
                    value: item.users ?? item.value,
                    icon: <span aria-hidden className="size-2 rounded-full" style={{ background: categoricalColor(index) }} />,
                })),
            };
        }

        return {
            leftLabel: 'Country',
            rightLabel: 'Users',
            metric: 'users',
            rows: data.countries.map((item) => ({
                key: item.country,
                label: item.country,
                value: item.users,
                icon: <CountryFlag country={item.country} />,
            })),
        };
    }, [data, geographyTab]);

    const chartRows = useMemo(
        () => (data?.trafficTrend ?? []).map((point) => ({ date: point.iso, users: point.users, sessions: point.sessions, views: point.views })),
        [data],
    );

    const isRefreshing = loading && !!data;
    const showEmptyState = !loading && !error && data && !hasRenderableData(data);

    if (loading && !data) {
        return <LoadingState />;
    }

    if (error && !data) {
        return (
            <Banner variant="warn" icon={RefreshCw} title="Analytics data is temporarily unavailable">
                {error}
            </Banner>
        );
    }

    const avgDailySessions = data?.kpis ? Math.round(data.kpis.totalSessions / Math.max(data.trafficTrend.length, 1)) : 0;
    const seo = data?.seo ?? null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-heading text-fg">Overview</h2>
                    <p className="mt-0.5 text-body-sm text-fg-muted">{rangeLabel}, compared with the previous period</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {isRefreshing ? (
                        <span className="inline-flex items-center gap-1.5 text-meta text-fg-muted" role="status">
                            <Loader2 aria-hidden size={14} strokeWidth={1.75} className="animate-spin" />
                            Updating
                        </span>
                    ) : null}
                    <DatePicker range={range} setRange={setRange} />
                </div>
            </div>

            {error && data ? (
                <Banner variant="warn">Showing the last data that loaded. {error}</Banner>
            ) : null}

            <div className={cn('space-y-6 transition-opacity duration-120', isRefreshing && 'opacity-60')}>
                {signalCards.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {signalCards.map((signal) => (
                            <SignalCard key={signal.label} label={signal.label} value={signal.value} helper={signal.helper} icon={signal.icon} />
                        ))}
                    </div>
                ) : null}

                {config.traffic && kpiTiles.length > 0 ? (
                    <section aria-label="Traffic metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {kpiTiles.map((tile) => (
                            <KpiTile key={tile.label} {...tile} />
                        ))}
                    </section>
                ) : null}

                {config.traffic && data?.trafficTrend.length ? (
                    <Card as="section">
                        <CardHeader
                            as="h3"
                            title="Traffic"
                            description={
                                <>
                                    Avg. {fmtCompact(avgDailySessions)} sessions a day
                                    {data.peakDay ? `, peak ${fmtCompact(data.peakDay.sessions)} on ${data.peakDay.date}` : ''}
                                </>
                            }
                            actions={
                                <SegmentedControl<TrendMetric>
                                    variant="neutral"
                                    size="sm"
                                    ariaLabel="Chart metric"
                                    value={trendMetric}
                                    onChange={setTrendMetric}
                                    options={[
                                        { value: 'users', label: 'Users' },
                                        { value: 'sessions', label: 'Sessions' },
                                        { value: 'pageviews', label: 'Views' },
                                    ]}
                                />
                            }
                            className="flex-wrap"
                        />
                        <TimeSeriesChart
                            data={chartRows}
                            series={[{ metric: trendMetric, key: TREND_KEY[trendMetric], label: METRICS[trendMetric].label }]}
                            height={300}
                            ariaLabel={`${METRICS[trendMetric].label} per day, ${rangeLabel}`}
                        />
                    </Card>
                ) : null}

                {(config.sources || config.pages) && data ? (
                    <section className={cn('grid gap-4', config.sources && config.pages && 'xl:grid-cols-2')}>
                        {config.sources ? (
                            <PanelFrame<SourceTab>
                                title="Traffic sources"
                                tabs={[
                                    { value: 'referrers', label: 'Referrers' },
                                    { value: 'channels', label: 'Channels' },
                                    { value: 'sources', label: 'Source / medium' },
                                ]}
                                activeTab={sourceTab}
                                onTabChange={setSourceTab}
                                panel={sourcePanel}
                                emptyLabel="traffic source"
                            />
                        ) : null}

                        {config.pages ? (
                            <PanelFrame<PageTab>
                                title="Top pages"
                                tabs={[
                                    { value: 'pages', label: 'Pages' },
                                    { value: 'entries', label: 'Entry pages' },
                                ]}
                                activeTab={pageTab}
                                onTabChange={setPageTab}
                                panel={pagesPanel}
                                emptyLabel="page"
                            />
                        ) : null}
                    </section>
                ) : null}

                {(showTechnology || config.geo) && data ? (
                    <section className={cn('grid gap-4', showTechnology && config.geo && 'xl:grid-cols-2')}>
                        {showTechnology ? (
                            <PanelFrame<TechnologyTab>
                                title="Technology"
                                tabs={[
                                    { value: 'browsers', label: 'Browsers' },
                                    { value: 'devices', label: 'Devices' },
                                    { value: 'os', label: 'OS' },
                                ]}
                                activeTab={technologyTab}
                                onTabChange={setTechnologyTab}
                                panel={technologyPanel}
                                emptyLabel="technology"
                            />
                        ) : null}

                        {config.geo ? (
                            <PanelFrame<GeographyTab>
                                title="Geography"
                                tabs={[
                                    { value: 'countries', label: 'Countries' },
                                    { value: 'regions', label: 'Regions' },
                                    { value: 'cities', label: 'Cities' },
                                    { value: 'languages', label: 'Languages' },
                                ]}
                                activeTab={geographyTab}
                                onTabChange={setGeographyTab}
                                panel={geographyPanel}
                                emptyLabel="location"
                            />
                        ) : null}
                    </section>
                ) : null}

                {config.seo && seo ? (
                    <section aria-labelledby="shared-seo-title" className="space-y-4">
                        <div>
                            <h3 id="shared-seo-title" className="text-title text-fg">Search performance</h3>
                            <p className="mt-0.5 text-body-sm text-fg-muted">Search Console highlights for the shared property.</p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <KpiTile
                                metric="clicks"
                                label="Clicks"
                                value={fmtCompact(seo.kpis.totalClicks)}
                                title={fmtFull(seo.kpis.totalClicks)}
                                helper="Clicks from Google Search"
                                change={seo.kpis.changeClicks}
                            />
                            <KpiTile
                                metric="impressions"
                                label="Impressions"
                                value={fmtCompact(seo.kpis.totalImpressions)}
                                title={fmtFull(seo.kpis.totalImpressions)}
                                helper="Times shown in search results"
                                change={seo.kpis.changeImpressions}
                            />
                            <KpiTile
                                metric="ctr"
                                label="CTR"
                                value={fmtPercent(seo.kpis.avgCTR / 100, { tile: true })}
                                helper="Click-through rate"
                                change={seo.kpis.changeCTR}
                                changeUnit="points"
                            />
                            <KpiTile
                                metric="position"
                                label="Avg. position"
                                value={fmtPosition(seo.kpis.avgPosition)}
                                helper="Lower is better"
                                change={seo.kpis.changePosition}
                                changeInverse
                                changeUnit="absolute"
                            />
                        </div>

                        {seo.queries.length > 0 ? (
                            <Table<SeoQuery>
                                caption="Top search queries"
                                rows={seo.queries.slice(0, 10)}
                                rowKey={(row) => row.query}
                                defaultSort={{ key: 'clicks', dir: 'desc' }}
                                toolbar={<h4 className="text-title-sm text-fg">Top queries</h4>}
                                columns={[
                                    {
                                        key: 'query',
                                        header: 'Query',
                                        cell: (row) => <span className="block max-w-[360px] truncate" title={row.query}>{row.query}</span>,
                                        sortable: true,
                                        sortValue: (row) => row.query,
                                        firstSortDir: 'asc',
                                        heat: { metric: 'clicks', value: (row) => row.clicks },
                                    },
                                    { key: 'clicks', header: 'Clicks', align: 'right', cell: (row) => fmtFull(row.clicks), sortable: true, sortValue: (row) => row.clicks },
                                    { key: 'impressions', header: 'Impressions', align: 'right', cell: (row) => fmtFull(row.impressions), sortable: true, sortValue: (row) => row.impressions },
                                    { key: 'ctr', header: 'CTR', align: 'right', cell: (row) => fmtPercent(row.ctr / 100), sortable: true, sortValue: (row) => row.ctr },
                                    { key: 'position', header: 'Position', align: 'right', cell: (row) => fmtPosition(row.position), sortable: true, sortValue: (row) => row.position, firstSortDir: 'asc' },
                                ]}
                            />
                        ) : null}
                    </section>
                ) : null}

                {config.seo && !seo && data?.seoError ? (
                    <Card>
                        <h3 className="text-title-sm text-fg">Search performance</h3>
                        <p className="mt-0.5 text-body-sm text-fg-muted">{data.seoError}</p>
                    </Card>
                ) : null}

                {showEmptyState ? (
                    <Card padding="none">
                        <EmptyState
                            title="No analytics data in this range"
                            description="This shared dashboard is live, but the selected period has no data yet. Try a longer range."
                        />
                    </Card>
                ) : null}
            </div>
        </div>
    );
}
