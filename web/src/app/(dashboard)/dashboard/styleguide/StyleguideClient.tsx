'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    ArrowRight, Copy, Download, LayoutGrid, List, Moon, MoreHorizontal, Plus, Search as SearchIcon, Settings, Share2, Sparkles, Star, Sun, Trash2,
} from 'lucide-react';

import {
    Avatar, Badge, Banner, Button, Card, CardFooter, CardHeader, CardLink, Checkbox, ConfirmModal, Drawer,
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
    DropdownMenuSubTrigger, DropdownMenuTrigger, EmptyState, Favicon, GoogleMark, Kbd, KpiStrip, MetricDelta, Modal, Pill,
    Popover, PopoverContent, PopoverTrigger, PropertyKindBadge, RadioGroup, SearchInput, SegmentedControl, Select,
    Skeleton, SkeletonText, StatCard, StatusPill, Switch, Table, Tabs, Tooltip, VerifiedBadge, toast, type TableColumn,
} from '@/components/ui';
import { BarList, ChartCard, Donut, Sparkline, TimeSeriesChart } from '@/components/charts';
import { PageHeader } from '@/components/shell/PageHeader';
import { DateRangeControl } from '@/components/shell/DateRangeControl';
import { cn } from '@/lib/cn';
import { fmtFull, fmtPercent, fmtPosition } from '@/lib/format';
import { channelColor, deviceColor, METRIC_KEYS, METRICS, type MetricKey } from '@/lib/metrics';

// ─── Deterministic demo data ────────────────────────────────────────────────

function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function series(seed: number, n: number, base: number, trend = 0.004, noise = 0.25): number[] {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
        const weekday = [0.82, 1.05, 1.1, 1.08, 1.04, 0.95, 0.78][i % 7];
        return Math.max(0, Math.round(base * (1 + trend * i) * weekday * (1 + (r() - 0.5) * noise)));
    });
}

function days(n: number, end = '2026-10-24'): string[] {
    const e = Date.parse(`${end}T00:00:00Z`);
    return Array.from({ length: n }, (_, i) => new Date(e - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

const D90 = days(90);
const CLICKS = series(1, 90, 42, 0.006);
const CLICKS_PREV = series(2, 90, 38, 0.002);
const IMPR = series(3, 90, 5200, 0.003);
const USERS = series(4, 90, 410, 0.005);
const SESSIONS = series(5, 90, 560, 0.004);
const POSITION = Array.from({ length: 90 }, (_, i) => 18 - i * 0.05 + Math.sin(i / 6));
const sum = (a: (number | null)[]) => a.reduce<number>((x, y) => x + (y ?? 0), 0);

const TS_DATA = D90.map((date, i) => ({
    date,
    clicks: CLICKS[i],
    clicksPrev: CLICKS_PREV[i],
    impressions: IMPR[i],
    users: USERS[i],
    sessions: SESSIONS[i],
    position: Number(POSITION[i].toFixed(1)),
}));

interface QueryRow { query: string; clicks: number; impressions: number; ctr: number; position: number; prevClicks: number }
const QUERIES: QueryRow[] = [
    'acme analytics', 'analytics dashboard', 'ga4 alternative', 'search console tool', 'seo report template', 'traffic leaderboard',
    'website traffic checker', 'acme pricing', 'compare ga4 and gsc', 'mcp google analytics', 'portfolio analytics', 'ai traffic report',
].map((q, i) => {
    const r = rng(100 + i);
    const impressions = Math.round(30000 / (i + 1) * (0.6 + r()));
    const ctr = 0.01 + r() * 0.08;
    const clicks = Math.round(impressions * ctr);
    return { query: q, clicks, impressions, ctr, position: 2 + i * 1.7 + r() * 2, prevClicks: Math.round(clicks * (0.6 + r() * 0.8)) };
});

// ─── Layout helpers ─────────────────────────────────────────────────────────

function Section({ id, title, children, description }: { id: string; title: string; description?: string; children: ReactNode }) {
    return (
        <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20">
            <h2 id={`${id}-h`} className="text-title text-fg">{title}</h2>
            {description ? <p className="mt-1 text-body-sm text-fg-muted">{description}</p> : null}
            <div className="mt-4 flex flex-col gap-4">{children}</div>
        </section>
    );
}

function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
    return (
        <div className="flex flex-col gap-2">
            {label ? <p className="text-caption tracking-[0.04em] text-fg-muted uppercase">{label}</p> : null}
            <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
        </div>
    );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
    return (
        <div className="flex w-[132px] flex-col gap-1.5">
            <span className="h-10 rounded-control border border-border-subtle" style={{ background: `var(${varName})` }} />
            <span className="text-meta text-fg">{name}</span>
            <code className="truncate text-[11px] text-fg-muted">{varName}</code>
        </div>
    );
}

const SECTIONS = [
    ['tokens', 'Tokens'], ['type', 'Type'], ['buttons', 'Buttons'], ['badges', 'Badges and pills'], ['cards', 'Cards'],
    ['metrics', 'Metrics'], ['controls', 'Controls'], ['table', 'Table'], ['feedback', 'Feedback'], ['overlays', 'Overlays'],
    ['identity', 'Favicon and avatar'], ['charts', 'Charts'],
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export function StyleguideClient() {
    const params = useSearchParams();
    const frame = params.get('theme');
    const [seg, setSeg] = useState<'7d' | '28d' | '3m'>('3m');
    const [view, setView] = useState<'search' | 'traffic'>('search');
    const [layout, setLayout] = useState<'grid' | 'list'>('grid');
    const [sort, setSort] = useState('clicks');
    const [q, setQ] = useState('');
    const [tab, setTab] = useState('queries');
    const [pillTab, setPillTab] = useState('channel');
    const [sw, setSw] = useState(true);
    const [sw2, setSw2] = useState(false);
    const [cb, setCb] = useState<boolean | 'indeterminate'>(true);
    const [radio, setRadio] = useState('prev');
    const [modal, setModal] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [kpi, setKpi] = useState<MetricKey>('clicks');
    const [showCols, setShowCols] = useState(true);
    const [density, setDensity] = useState('comfortable');

    const qRows = useMemo(() => QUERIES.filter((r) => r.query.includes(q.toLowerCase())), [q]);
    const columns: TableColumn<QueryRow>[] = [
        { key: 'query', header: 'Query', cell: (r) => r.query, sortable: true, sortValue: (r) => r.query, firstSortDir: 'asc', heat: { metric: 'clicks', value: (r) => r.clicks }, width: '40%' },
        { key: 'clicks', header: 'Clicks', align: 'right', cell: (r) => fmtFull(r.clicks), sortable: true, sortValue: (r) => r.clicks },
        { key: 'delta', header: 'Δ', align: 'right', cell: (r) => <MetricDelta metric="clicks" current={r.clicks} previous={r.prevClicks} /> },
        { key: 'impressions', header: 'Impressions', align: 'right', cell: (r) => fmtFull(r.impressions), sortable: true, sortValue: (r) => r.impressions },
        { key: 'ctr', header: 'CTR', align: 'right', cell: (r) => fmtPercent(r.ctr), sortable: true, sortValue: (r) => r.ctr },
        { key: 'position', header: 'Position', align: 'right', cell: (r) => fmtPosition(r.position), sortable: true, sortValue: (r) => r.position, firstSortDir: 'asc' },
        { key: 'trend', header: 'Trend', cell: (_r, i) => <div className="w-24"><Sparkline series={[{ metric: 'clicks', values: series(300 + i, 28, 20) }]} height={28} interactive={false} /></div> },
    ];

    const content = (
        <div className="flex flex-col gap-12">
            <Section id="tokens" title="Tokens" description="Semantic colours switch with data-theme. Metric colours are for marks only.">
                <Row label="Surfaces">
                    {['canvas', 'surface', 'surface-raised', 'surface-sunken', 'subtle', 'subtle-strong', 'inverse'].map((n) => <Swatch key={n} name={n} varName={`--tc-${n}`} />)}
                </Row>
                <Row label="Text and borders">
                    {['fg', 'fg-secondary', 'fg-muted', 'fg-faint', 'border-subtle', 'border', 'border-strong'].map((n) => <Swatch key={n} name={n} varName={`--tc-${n}`} />)}
                </Row>
                <Row label="Brand and semantic">
                    {['brand', 'brand-hover', 'brand-soft', 'brand-text', 'focus', 'up', 'up-soft', 'down', 'down-soft', 'warn', 'warn-soft', 'info', 'info-soft', 'star'].map((n) => <Swatch key={n} name={n} varName={`--tc-${n}`} />)}
                </Row>
                <Row label="Metrics (lib/metrics.ts)">
                    {METRIC_KEYS.map((k) => <Swatch key={k} name={METRICS[k].label} varName={`--tc-m-${k}`} />)}
                </Row>
                <Row label="Categorical">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Swatch key={i} name={`cat-${i}`} varName={`--tc-cat-${i}`} />)}
                    <Swatch name="other" varName="--tc-cat-other" />
                </Row>
            </Section>

            <Section id="type" title="Type" description="Geist, sentence case, tabular figures for numbers that line up.">
                <Card className="flex flex-col gap-3">
                    <p className="text-display-sm text-fg">Display S 36</p>
                    <p className="text-heading-lg text-fg">Heading L 30</p>
                    <p className="text-heading text-fg">Heading 24 · page title</p>
                    <p className="text-title text-fg">Title 18 · section</p>
                    <p className="text-title-sm text-fg">Title S 15 · card title</p>
                    <p className="text-body-lg text-fg">Body L 16 · marketing and chat</p>
                    <p className="text-body text-fg">Body 14 · app default</p>
                    <p className="text-body-sm text-fg-secondary">Body S 13 · labels and descriptions</p>
                    <p className="text-meta text-fg-muted">Meta 12 · dates, deltas, footers</p>
                    <p className="text-caption tracking-[0.04em] text-fg-muted uppercase">Caption 11 · micro label</p>
                    <div className="flex flex-wrap items-baseline gap-6">
                        <span className="text-stat-xl text-fg">48.2K</span>
                        <span className="text-stat-lg text-fg">12.4K</span>
                        <span className="text-stat text-fg">1,282</span>
                        <span className="text-stat-sm text-fg tabular-nums">503K</span>
                    </div>
                    <p className="font-mono text-body-sm text-fg-secondary">https://trafficclaw.com/mcp · properties/412300101</p>
                </Card>
            </Section>

            <Section id="buttons" title="Buttons">
                <Row label="Variants">
                    <Button variant="primary" icon={Plus}>New dashboard</Button>
                    <Button variant="secondary" icon={Share2}>Share</Button>
                    <Button variant="ghost" icon={Settings}>Settings</Button>
                    <Button variant="subtle">Subtle</Button>
                    <Button variant="danger" icon={Trash2}>Remove site</Button>
                    <Button variant="link" trailingIcon={ArrowRight}>Details</Button>
                    <Button variant="google"><GoogleMark /> Continue with Google</Button>
                </Row>
                <Row label="Sizes">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                    <Button size="xl" variant="primary" trailingIcon={ArrowRight}>Connect Google, free</Button>
                </Row>
                <Row label="Icon only, loading, disabled, as link">
                    <Button iconOnly size="sm" icon={MoreHorizontal} aria-label="More" variant="ghost" />
                    <Button iconOnly icon={SearchIcon} aria-label="Search" variant="ghost" />
                    <Button iconOnly size="lg" icon={Star} aria-label="Star" />
                    <Button loading icon={Download}>Exporting</Button>
                    <Button variant="primary" loading>Saving</Button>
                    <Button disabled>Disabled</Button>
                    <Button variant="primary" disabled>Disabled</Button>
                    <Button asChild variant="secondary" trailingIcon={ArrowRight}><a href="#buttons">Anchor as button</a></Button>
                </Row>
            </Section>

            <Section id="badges" title="Badges and pills">
                <Row label="Badge">
                    <Badge>GA4</Badge>
                    <PropertyKindBadge siteUrl="sc-domain:acme.com" />
                    <PropertyKindBadge siteUrl="https://acme.com/" />
                    <Badge variant="neutral">Neutral</Badge>
                    <Badge variant="brand">Brand</Badge>
                    <Badge variant="up">Up</Badge>
                    <Badge variant="down">Down</Badge>
                    <Badge variant="warn">Warn</Badge>
                    <Badge variant="info">Info</Badge>
                    <Badge variant="sponsored" />
                </Row>
                <Row label="Status pills">
                    <StatusPill status="synced" tooltip="Synced 2 min ago" />
                    <StatusPill status="syncing" />
                    <StatusPill status="syncing" progress={40} />
                    <StatusPill status="stale" tooltip="Last synced Oct 22, 09:14" />
                    <StatusPill status="error" onClick={() => toast('Reconnect Google')} />
                    <StatusPill status="not_connected" label="GA4 not linked" />
                </Row>
                <Row label="Pill, verified, kbd">
                    <Pill dot>Neutral</Pill>
                    <Pill tone="brand">Brand</Pill>
                    <Pill tone="up" dot>Live</Pill>
                    <Pill tone="info">Info</Pill>
                    <VerifiedBadge />
                    <Kbd>/</Kbd>
                    <Kbd>⌘K</Kbd>
                </Row>
            </Section>

            <Section id="cards" title="Cards">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader title="Card title" description="Description in body-sm muted." actions={<Button size="sm" variant="ghost" iconOnly icon={MoreHorizontal} aria-label="More" />} />
                        <p className="text-body text-fg-secondary">Default padding p-5, subtle border, card shadow.</p>
                        <CardFooter><span>Footer meta</span><Button variant="link" size="sm" trailingIcon={ArrowRight}>View all</Button></CardFooter>
                    </Card>
                    <Card padding="sm">
                        <CardHeader title="Compact" description="padding sm (p-4)" />
                        <SkeletonText lines={3} delay={0} />
                    </Card>
                    <CardLink href="#cards" padding="sm" aria-label="acme.com, 1,282 clicks">
                        <div className="flex items-center gap-2">
                            <Favicon host="acmeanalytics.example" />
                            <span className="truncate text-title-sm text-fg">acmeanalytics.example</span>
                            <Badge>Domain</Badge>
                        </div>
                        <p className="mt-2 text-body-sm text-fg-muted">The whole card is a link and lifts on hover.</p>
                    </CardLink>
                </div>
            </Section>

            <Section id="metrics" title="Metrics" description="MetricDelta, StatCard and the KPI strip that drives one chart.">
                <Row label="MetricDelta (text)">
                    <MetricDelta metric="clicks" current={12400} previous={10473} />
                    <MetricDelta metric="clicks" current={1282} previous={2548} />
                    <MetricDelta metric="users" current={274} previous={100} />
                    <MetricDelta metric="position" current={8.4} previous={8.8} />
                    <MetricDelta metric="position" current={23.2} previous={17.1} />
                    <MetricDelta metric="ctr" current={0.024} previous={0.025} />
                    <MetricDelta metric="clicks" current={120} previous={0} />
                    <MetricDelta metric="clicks" current={0} previous={0} />
                    <MetricDelta metric="clicks" current={10000} previous={10001} />
                    <MetricDelta metric="clicks" current={12} previous={6} />
                </Row>
                <Row label="MetricDelta (chip)">
                    <MetricDelta variant="chip" metric="users" current={12400} previous={10473} />
                    <MetricDelta variant="chip" metric="clicks" current={1282} previous={2548} />
                    <MetricDelta variant="chip" size="md" metric="position" current={8.4} previous={8.8} />
                    <MetricDelta variant="chip" metric="clicks" current={120} previous={0} />
                </Row>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard metric="users" value={12400} previous={10473} comparisonLabel="previous 3 months" info sparkline={USERS} sparklineDates={D90} />
                    <StatCard metric="clicks" value={1282} previous={2548} comparisonLabel="previous 3 months" info />
                    <StatCard metric="ctr" value={0.0255} previous={0.0262} comparisonLabel="previous 3 months" />
                    <StatCard metric="impressions" value={null} loading comparisonLabel="previous 3 months" />
                </div>
                <StatCard metric="users" label="Visitors" size="lg" value={48210} previous={39876} comparisonLabel="previous 28 days" className="max-w-sm" />
                <KpiStrip
                    selected={kpi}
                    onSelect={setKpi}
                    comparisonLabel="previous 3 months"
                    items={[
                        { metric: 'users', value: sum(USERS), previous: sum(USERS) * 0.85 },
                        { metric: 'sessions', value: sum(SESSIONS), previous: sum(SESSIONS) * 0.92 },
                        { metric: 'clicks', value: sum(CLICKS), previous: sum(CLICKS_PREV) },
                        { metric: 'impressions', value: sum(IMPR), previous: sum(IMPR) * 1.34 },
                        { metric: 'ctr', value: 0.0081, previous: 0.0092 },
                        { metric: 'position', value: 14.2, previous: 16.0 },
                        { metric: 'ai', value: null, loading: true },
                    ]}
                >
                    <TimeSeriesChart
                        data={TS_DATA}
                        series={[{ metric: kpi, key: kpi, compareKey: kpi === 'clicks' ? 'clicksPrev' : undefined }]}
                        partialFrom={88}
                        height={340}
                        ariaLabel={`${METRICS[kpi].label} per day`}
                    />
                </KpiStrip>
            </Section>

            <Section id="controls" title="Controls">
                <Row label="Segmented control">
                    <SegmentedControl ariaLabel="Range" value={seg} onChange={setSeg} options={[{ value: '7d', label: '7d' }, { value: '28d', label: '28d' }, { value: '3m', label: '3m' }]} />
                    <SegmentedControl ariaLabel="View" variant="neutral" size="sm" value={view} onChange={setView} options={[{ value: 'search', label: 'Search' }, { value: 'traffic', label: 'Traffic' }]} />
                    <SegmentedControl ariaLabel="Layout" variant="neutral" size="sm" value={layout} onChange={setLayout} options={[{ value: 'grid', label: '', icon: LayoutGrid, ariaLabel: 'Grid' }, { value: 'list', label: '', icon: List, ariaLabel: 'List' }]} />
                    <SegmentedControl ariaLabel="No selection" value={null} onChange={() => undefined} options={[{ value: 'a', label: '7d' }, { value: 'b', label: '28d' }, { value: 'c', label: '3m' }]} />
                </Row>
                <Row label="Date range control (shell)">
                    <DateRangeControl />
                </Row>
                <Row label="Select, search">
                    <Select label="Sort:" value={sort} onValueChange={setSort} options={[{ value: 'clicks', label: 'Most clicks' }, { value: 'users', label: 'Most users' }, { value: 'gain', label: 'Biggest gain' }, { value: 'az', label: 'Name A–Z' }]} />
                    <Select size="sm" ariaLabel="Density" value={density} onValueChange={setDensity} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} className="min-w-32" />
                    <Select ariaLabel="Disabled" value={undefined} onValueChange={() => undefined} options={[{ value: 'x', label: 'X' }]} placeholder="Disabled" disabled />
                    <SearchInput value={q} onValueChange={setQ} placeholder="Search queries" />
                </Row>
                <Row label="Tabs">
                    <div className="w-full">
                        <Tabs ariaLabel="Search tabs" value={tab} onValueChange={setTab} items={[{ value: 'queries', label: 'Queries', count: 312 }, { value: 'pages', label: 'Pages', count: 88 }, { value: 'countries', label: 'Countries' }, { value: 'devices', label: 'Devices' }, { value: 'appearance', label: 'Search appearance' }, { value: 'dates', label: 'Dates', disabled: true }]} />
                    </div>
                    <Tabs variant="pills" ariaLabel="Breakdown" value={pillTab} onValueChange={setPillTab} items={[{ value: 'channel', label: 'Channel' }, { value: 'referrer', label: 'Referrer' }, { value: 'campaign', label: 'Campaign' }]} />
                </Row>
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="flex flex-col gap-4">
                        <Switch checked={sw} onCheckedChange={setSw} label="Public profile" description="Anyone with the link can see visitors and clicks." />
                        <Switch checked={sw2} onCheckedChange={setSw2} label="Weekly email" size="sm" />
                        <Switch checked onCheckedChange={() => undefined} label="Disabled on" disabled />
                    </div>
                    <div className="flex flex-col gap-4">
                        <Checkbox checked={cb} onCheckedChange={setCb} label="acmeanalytics.example" description="Domain property, GA4 matched" />
                        <Checkbox checked="indeterminate" onCheckedChange={() => setCb(true)} label="Select all (indeterminate)" />
                        <Checkbox checked={false} onCheckedChange={() => undefined} label="Disabled" disabled />
                    </div>
                    <RadioGroup ariaLabel="Compare to" value={radio} onValueChange={setRadio} options={[{ value: 'prev', label: 'Previous period' }, { value: 'yoy', label: 'Same period last year' }, { value: 'none', label: 'No comparison', description: 'Hides deltas and dashed lines.' }]} />
                </div>
            </Section>

            <Section id="table" title="Table" description="Sortable, heat bar on the label column, sparkline cells, client pagination.">
                <Table
                    caption="Top queries"
                    columns={showCols ? columns : columns.slice(0, 3)}
                    rows={qRows}
                    rowKey={(r) => r.query}
                    defaultSort={{ key: 'clicks', dir: 'desc' }}
                    pagination={{ pageSize: 8 }}
                    onRowClick={(r) => toast(`Open ${r.query}`)}
                    density={density === 'compact' ? 'compact' : 'default'}
                    toolbar={
                        <>
                            <SearchInput value={q} onValueChange={setQ} placeholder="Query contains…" size="sm" slashShortcut={false} />
                            <Button size="sm" variant="secondary" icon={Plus}>Filter</Button>
                            <span className="ml-auto" />
                            <Checkbox checked={showCols} onCheckedChange={setShowCols} label="All columns" />
                            <Button size="sm" variant="ghost" icon={Download}>Export</Button>
                        </>
                    }
                    empty={<EmptyState variant="inline" icon={SearchIcon} title={`No queries match '${q}'`} actions={<Button size="sm" onClick={() => setQ('')}>Clear filter</Button>} />}
                />
                <div className="grid gap-4 lg:grid-cols-2">
                    <Table caption="Loading" columns={columns.slice(0, 4)} rows={[] as QueryRow[]} rowKey={(r) => r.query} loading density="compact" />
                    <Table caption="Empty" columns={columns.slice(0, 4)} rows={[] as QueryRow[]} rowKey={(r) => r.query} empty={<EmptyState variant="inline" title="No clicks in the last 28 days" description="Try a longer range." />} />
                </div>
            </Section>

            <Section id="feedback" title="Feedback">
                <div className="grid gap-3">
                    <Banner variant="danger" title="Google connection expired" actions={<Button size="sm" variant="secondary">Reconnect Google</Button>}>We can&apos;t refresh your numbers until you reconnect.</Banner>
                    <Banner variant="warn" title="You've used all 50 AI messages this month" actions={<Button size="sm" variant="secondary">Get more</Button>} />
                    <Banner variant="info" onDismiss={() => undefined}>Syncing 3 sites, numbers will fill in as data arrives.</Banner>
                    <Banner variant="success">Profile is now public.</Banner>
                    <Banner variant="neutral" title="You're looking at demo data" actions={<Button size="sm" variant="primary">Connect your sites</Button>} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    <Card padding="none"><EmptyState variant="card" icon={LayoutGrid} title="No sites yet" description="Connect Google once and we build a card for each site." actions={<><Button variant="google"><GoogleMark /> Continue with Google</Button><Button variant="link">Explore the demo</Button></>} /></Card>
                    <Card padding="none"><EmptyState variant="inline" title="No sites match 'acm'" actions={<Button size="sm">Clear search</Button>} /></Card>
                    <Card padding="sm" className="flex flex-col gap-3">
                        <div className="flex items-center gap-2"><Skeleton delay={0} className="size-5" rounded="sm" /><Skeleton delay={0} className="h-4 w-40" /></div>
                        <Skeleton delay={0} className="h-4 w-56" />
                        <Skeleton delay={0} className="h-[72px] w-full" />
                        <div className="flex gap-2"><Skeleton delay={0} rounded="full" className="h-6 w-16" /><Skeleton delay={0} className="h-4 w-24" /></div>
                    </Card>
                </div>
                <Row label="Toasts">
                    <Button onClick={() => toast.success('Link copied')}>Success</Button>
                    <Button onClick={() => toast('Dashboard saved', { description: 'Everyone with the link sees the new version.' })}>Neutral</Button>
                    <Button onClick={() => toast.info('Syncing 3 sites')}>Info</Button>
                    <Button onClick={() => toast.warning('GSC data is 2 days behind')}>Warning</Button>
                    <Button onClick={() => toast.error('Could not save', { duration: 8000, action: { label: 'Retry', onClick: () => undefined } })}>Error with action</Button>
                </Row>
            </Section>

            <Section id="overlays" title="Overlays" description="Radix primitives: focus trap, Esc, focus return, type-ahead.">
                <Row>
                    <Button onClick={() => setModal(true)}>Open modal</Button>
                    <Button variant="danger" onClick={() => setConfirm(true)}>Confirm dialog</Button>
                    <Button onClick={() => setDrawer(true)}>Open drawer</Button>
                    <Tooltip content="Search ⌘K"><Button iconOnly variant="ghost" icon={SearchIcon} aria-label="Search" /></Tooltip>
                    <Tooltip content="Tooltips show on hover and keyboard focus."><Button variant="secondary">Hover me</Button></Tooltip>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button icon={MoreHorizontal}>Menu</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Chart</DropdownMenuLabel>
                            <DropdownMenuItem icon={Download} shortcut="⌘D">Download CSV</DropdownMenuItem>
                            <DropdownMenuItem icon={Copy}>Copy as image</DropdownMenuItem>
                            <DropdownMenuItem icon={Sparkles}>Ask AI about this chart</DropdownMenuItem>
                            <DropdownMenuCheckboxItem checked={showCols} onCheckedChange={(v) => setShowCols(Boolean(v))}>Show all columns</DropdownMenuCheckboxItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger icon={Sun}>Appearance</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    <DropdownMenuRadioGroup value={radio} onValueChange={setRadio}>
                                        <DropdownMenuRadioItem value="prev" icon={Sun}>Light</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="yoy" icon={Moon}>Dark</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="none" icon={Settings}>System</DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem icon={Trash2} destructive>Delete</DropdownMenuItem>
                            <DropdownMenuItem disabled>Disabled item</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Popover>
                        <PopoverTrigger asChild><Button>Popover</Button></PopoverTrigger>
                        <PopoverContent className="w-72 p-4" aria-label="Example popover">
                            <p className="text-title-sm">Popover</p>
                            <p className="mt-1 text-body-sm text-fg-muted">Interactive content belongs here, not in tooltips.</p>
                        </PopoverContent>
                    </Popover>
                </Row>
                <Modal
                    open={modal}
                    onOpenChange={setModal}
                    title="Share dashboard"
                    description="Anyone with the link can view. Data refreshes every hour."
                    size="md"
                    footer={<><Button onClick={() => setModal(false)}>Cancel</Button><Button variant="primary" onClick={() => { setModal(false); toast.success('Link copied'); }}>Copy link</Button></>}
                >
                    <div className="flex flex-col gap-4">
                        <Switch checked={sw} onCheckedChange={setSw} label="Public link" description="Read only." />
                        <Checkbox checked={cb} onCheckedChange={setCb} label="Require a password" />
                    </div>
                </Modal>
                <ConfirmModal open={confirm} onOpenChange={setConfirm} title="Remove acme.com?" description="Its cards, alerts and leaderboard entry go away. Your Google data is not touched." confirmLabel="Remove site" onConfirm={() => setConfirm(false)} />
                <Drawer open={drawer} onOpenChange={setDrawer} title="/pricing" subtitle="Page details · last 3 months" footer={<Button variant="primary" className="w-full">Open in Search</Button>}>
                    <div className="flex flex-col gap-4">
                        <StatCard metric="clicks" value={312} previous={280} comparisonLabel="previous 3 months" />
                        <BarList metric="clicks" items={QUERIES.slice(0, 6).map((r) => ({ key: r.query, label: r.query, text: r.query, value: r.clicks }))} />
                    </div>
                </Drawer>
            </Section>

            <Section id="identity" title="Favicon and avatar" description="Letter tiles when no icon is found (demo hosts never have one).">
                <Row>
                    {([16, 20, 24, 32, 64] as const).map((s) => <Favicon key={s} host="acmeanalytics.example" size={s} />)}
                    <Favicon host="github.com" size={32} />
                    <Favicon host="sc-domain:www.recipenest.example" size={24} />
                </Row>
                <Row>
                    {([24, 28, 32, 40] as const).map((s) => <Avatar key={s} size={s} name="Demo Owner" />)}
                    <Avatar size={32} name="Second User" />
                </Row>
            </Section>

            <Section id="charts" title="Charts" description="Sparklines are hand-rolled SVG; full charts wrap Recharts with the section 6 rules.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[72, 56, 40, 28].map((h) => (
                        <Card key={h} padding="sm">
                            <p className="mb-2 text-meta text-fg-muted">height {h}{h >= 56 ? ' · hover me' : ''}</p>
                            <Sparkline height={h} dates={D90} series={[{ metric: 'clicks', values: CLICKS }, { metric: 'impressions', values: IMPR }]} />
                        </Card>
                    ))}
                    <Card padding="sm"><p className="mb-2 text-meta text-fg-muted">traffic pair</p><Sparkline dates={D90} series={[{ metric: 'users', values: USERS }, { metric: 'sessions', values: SESSIONS }]} /></Card>
                    <Card padding="sm"><p className="mb-2 text-meta text-fg-muted">gaps (null)</p><Sparkline dates={D90} series={[{ metric: 'clicks', values: CLICKS.map((v, i) => (i % 23 < 4 ? null : v)) }]} /></Card>
                    <Card padding="sm"><p className="mb-2 text-meta text-fg-muted">all zero</p><Sparkline series={[{ metric: 'clicks', values: Array(30).fill(0) }]} /></Card>
                    <Card padding="sm"><p className="mb-2 text-meta text-fg-muted">one point</p><Sparkline series={[{ metric: 'users', values: [42] }]} /></Card>
                </div>
                <ChartCard
                    title="Clicks"
                    subtitle="Jul 27 – Oct 24 vs previous 3 months · last 2 days partial"
                    height="large"
                    onDownloadCsv={() => toast('CSV downloaded')}
                    onAskAi={() => toast('Ask AI')}
                    onAddToDashboard={() => toast('Added')}
                    tableView={<Table columns={[{ key: 'date', header: 'Date', cell: (r: (typeof TS_DATA)[number]) => r.date }, { key: 'clicks', header: 'Clicks', align: 'right', cell: (r) => fmtFull(r.clicks) }]} rows={TS_DATA} rowKey={(r) => r.date} pagination={{ pageSize: 30 }} />}
                    footer="Data through Oct 24 · GSC is delayed about 2 days"
                >
                    <TimeSeriesChart data={TS_DATA} series={[{ metric: 'clicks', key: 'clicks', compareKey: 'clicksPrev' }]} partialFrom={88} height={340} annotations={[{ date: D90[40], label: 'Core update' }, { date: D90[70], label: 'New pricing page' }]} ariaLabel="Clicks per day" />
                </ChartCard>
                <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title="Search overlay" subtitle="Clicks and impressions on separate scales">
                        <TimeSeriesChart data={TS_DATA} mode="overlay" series={[{ metric: 'clicks', key: 'clicks' }, { metric: 'impressions', key: 'impressions' }]} />
                    </ChartCard>
                    <ChartCard title="Average position" subtitle="Lower is better (axis reversed)">
                        <TimeSeriesChart data={TS_DATA} series={[{ metric: 'position', key: 'position' }]} />
                    </ChartCard>
                    <ChartCard title="Traffic (split)" subtitle="One small chart per metric">
                        <TimeSeriesChart data={TS_DATA} mode="split" height={300} series={[{ metric: 'users', key: 'users' }, { metric: 'sessions', key: 'sessions' }]} />
                    </ChartCard>
                    <ChartCard title="Compact (y axis hidden)" height="compact">
                        <TimeSeriesChart data={TS_DATA.slice(-28)} series={[{ metric: 'users', key: 'users' }]} height={200} />
                    </ChartCard>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ChartCard title="Loading" state="loading" height="compact" />
                    <ChartCard title="Refetching" state="refetching" height="compact"><TimeSeriesChart data={TS_DATA.slice(-28)} series={[{ metric: 'sessions', key: 'sessions' }]} height={200} /></ChartCard>
                    <ChartCard title="Empty" state="empty" height="compact" empty={{ title: 'No clicks in the last 28 days', description: 'Try a longer range.' }} />
                    <ChartCard title="Error" state="error" height="compact" error={{ onRetry: () => toast('Retrying') }} />
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                    <ChartCard title="Top queries" subtitle="By clicks">
                        <BarList metric="clicks" items={QUERIES.map((r) => ({ key: r.query, label: r.query, text: r.query, value: r.clicks }))} showShare labelHeader="Query" viewAllTitle="All queries" />
                    </ChartCard>
                    <ChartCard title="Channels" subtitle="Sessions">
                        <Donut centerLabel="Sessions" items={[['Organic Search', 5200], ['Direct', 2100], ['Referral', 900], ['Organic Social', 640], ['Email', 210], ['Paid Search', 160], ['Unassigned', 90]].map(([l, v]) => ({ key: String(l), label: String(l), value: Number(v), color: channelColor(String(l)) }))} />
                    </ChartCard>
                    <ChartCard title="Devices" subtitle="Users">
                        <Donut legend="bottom" centerLabel="Users" items={[['Desktop', 6200], ['Mobile', 4800], ['Tablet', 400]].map(([l, v]) => ({ key: String(l), label: String(l), value: Number(v), color: deviceColor(String(l)) }))} />
                    </ChartCard>
                </div>
                <Card><CardHeader title="BarList loading / empty" /><div className="grid gap-6 md:grid-cols-2"><BarList metric="users" items={[]} loading /><BarList metric="users" items={[]} empty={<EmptyState variant="inline" title="No countries yet" />} /></div></Card>
            </Section>
        </div>
    );

    return (
        <div className="mx-auto w-full max-w-[1440px]">
            <PageHeader
                title="Styleguide"
                subtitle="Every component in every state · dev only · add ?theme=light|dark to force a theme for the content"
                actions={<Button variant="secondary" size="md" icon={Settings} asChild><a href="#overlays">Jump to overlays</a></Button>}
            />
            <nav aria-label="Styleguide sections" className="mb-8 flex flex-wrap gap-1.5">
                {SECTIONS.map(([id, label]) => (
                    <a key={id} href={`#${id}`} className="rounded-full bg-subtle px-2.5 py-1 text-meta font-medium text-fg-secondary hover:text-fg">{label}</a>
                ))}
            </nav>
            {frame === 'light' || frame === 'dark' ? (
                <div data-theme={frame} className="rounded-panel bg-canvas p-4 text-fg md:p-6">{content}</div>
            ) : content}
        </div>
    );
}
