import Link from 'next/link';
import { Globe } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Favicon } from '@/components/ui/Favicon';
import { BarList } from '@/components/charts/BarList';
import { billingPeriodSuffix, formatCents } from '@/lib/adSlots';
import { fmtDay, fmtFull } from '@/lib/format';
import { OPEN_TO_OPTIONS, profilePath, RANGE_PREV_NAMES } from '@/lib/leaderboard/constants';
import { durationText, engagementText } from '@/lib/leaderboard/format';
import { channelColor, deviceColor, type MetricKey } from '@/lib/metrics';
import type { CountMetric, EngagementMetric, ProfilePayload, RangeKey } from '@/lib/leaderboard/types';
import { PctDelta, CountValue } from './shared';
import { RequestSlotButton } from './ProfileClient';

function flag(iso2?: string): string | null {
    if (!iso2 || iso2.length !== 2) return null;
    const up = iso2.toUpperCase();
    return String.fromCodePoint(...[...up].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function hostOf(url: string | null): string {
    return (url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function KpiTile({ label, metric, value, sub, range }: { label: string; metric: MetricKey; value: CountMetric | null; sub?: string; range: RangeKey }) {
    if (!value) return null;
    const color = `var(--color-m-${metric})`;
    return (
        <Card padding="sm" className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">{label}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <CountValue m={value} className="text-stat text-fg" />
                <PctDelta pct={value.delta_pct} variant="chip" comparisonLabel={`versus ${RANGE_PREV_NAMES[range]}`} />
            </div>
            <p className="text-meta text-fg-muted">{sub ?? `vs ${RANGE_PREV_NAMES[range]}`}</p>
        </Card>
    );
}

export function EngagementTile({ e }: { e: EngagementMetric | null }) {
    if (!e) return null;
    return (
        <Card padding="sm" className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: 'var(--color-m-sessions)' }} />
                <span className="truncate text-body-sm font-medium text-fg-secondary">Engagement</span>
            </div>
            <span className="text-stat tabular-nums text-fg">{engagementText(e)}</span>
            <p className="text-meta text-fg-muted">
                {e.mode === 'exact' && e.avg_session_seconds !== null ? `Avg. session ${durationText(e.avg_session_seconds)}` : 'engagement rate'}
            </p>
        </Card>
    );
}

export function KpiGrid({ p }: { p: ProfilePayload }) {
    const k = p.kpis;
    if (!k) return null;
    const tiles = [
        k.visitors ? <KpiTile key="v" label="Visitors" metric="users" value={k.visitors} range={p.range} /> : null,
        k.clicks ? <KpiTile key="c" label="Search clicks" metric="clicks" value={k.clicks} range={p.range} /> : null,
        k.pageviews ? <KpiTile key="p" label="Pageviews" metric="pageviews" value={k.pageviews} range={p.range} /> : null,
        k.impressions ? <KpiTile key="i" label="Search impressions" metric="impressions" value={k.impressions} range={p.range} /> : null,
        k.engagement ? <EngagementTile key="e" e={k.engagement} /> : null,
    ].filter(Boolean);
    if (tiles.length === 0) {
        return (
            <Card className="text-body text-fg-muted">The owner does not share numbers on this profile. Verification and the daily check still apply.</Card>
        );
    }
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.slice(0, 4)}</div>;
}

export function Breakdowns({ p }: { p: ProfilePayload }) {
    const b = p.breakdowns;
    const cards: React.ReactNode[] = [];
    if (b.countries?.length) {
        cards.push(
            <Card key="countries">
                <CardHeader title="Top countries" description="Share of visitors" />
                <BarList
                    metric="users"
                    limit={6}
                    valueFormat="percent100"
                    items={b.countries.map((c) => ({ key: c.name, label: c.name, text: c.name, value: c.share, icon: flag(c.iso2) ? <span aria-hidden className="text-body-lg leading-none">{flag(c.iso2)}</span> : undefined }))}
                />
            </Card>,
        );
    }
    if (b.channels?.length) {
        cards.push(
            <Card key="channels">
                <CardHeader title="Traffic sources" description="Share of sessions by channel" />
                <BarList
                    metric="sessions"
                    limit={6}
                    valueFormat="percent100"
                    items={b.channels.map((c) => ({ key: c.name, label: c.name, text: c.name, value: c.share, icon: <span aria-hidden className="size-2 rounded-full" style={{ background: channelColor(c.name) }} /> }))}
                />
            </Card>,
        );
    }
    if (b.devices?.length) {
        cards.push(
            <Card key="devices">
                <CardHeader title="Devices" description="Share of visitors" />
                <BarList
                    metric="users"
                    limit={4}
                    valueFormat="percent100"
                    items={b.devices.map((c) => ({ key: c.name, label: <span className="capitalize">{c.name}</span>, text: c.name, value: c.share, icon: <span aria-hidden className="size-2 rounded-full" style={{ background: deviceColor(c.name) }} /> }))}
                />
            </Card>,
        );
    }
    if (b.pages?.length) {
        const hasViews = b.pages.some((x) => x.views !== undefined);
        cards.push(
            <Card key="pages">
                <CardHeader title="Top pages" description={hasViews ? 'Pageviews' : 'Share of pageviews'} />
                <BarList
                    metric="pageviews"
                    limit={6}
                    valueFormat={hasViews ? undefined : 'percent100'}
                    items={b.pages.map((x) => ({ key: x.path, label: x.path, text: x.path, value: hasViews ? (x.views ?? 0) : x.share }))}
                />
            </Card>,
        );
    }
    if (b.queries?.length) {
        const hasClicks = b.queries.some((x) => x.clicks !== undefined);
        cards.push(
            <Card key="queries" className="lg:col-span-2">
                <CardHeader title="Top search queries" description={hasClicks ? 'Google clicks' : 'Most clicked, in order'} />
                {hasClicks ? (
                    <BarList metric="clicks" limit={8} items={b.queries.map((x) => ({ key: x.query, label: x.query, text: x.query, value: x.clicks ?? 0 }))} />
                ) : (
                    <ol className="flex flex-col">
                        {b.queries.slice(0, 8).map((x, i) => (
                            <li key={x.query} className="flex h-9 items-center gap-3 text-body text-fg">
                                <span className="w-5 text-right text-meta text-fg-muted tabular-nums">{i + 1}</span>
                                <span className="truncate">{x.query}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </Card>,
        );
    }
    if (cards.length === 0) return null;
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{cards}</div>;
}

export function GrowthCard({ p }: { p: ProfilePayload }) {
    const g = p.growth;
    if (!g) return null;
    const rows: Array<[string, React.ReactNode]> = [];
    if (g.visitors_delta_pct !== null) rows.push(['Visitors', <PctDelta key="v" pct={g.visitors_delta_pct} size="md" />]);
    if (g.clicks_delta_pct !== null) rows.push(['Search clicks', <PctDelta key="c" pct={g.clicks_delta_pct} size="md" />]);
    if (g.rank_overall !== null) rows.push(['Overall rank', <span key="r" className="font-medium">#{g.rank_overall} <span className="text-fg-muted">of {g.rank_overall_total}</span></span>]);
    if (g.rank_category !== null && p.category) rows.push([`Rank in ${p.category}`, <span key="rc" className="font-medium">#{g.rank_category} <span className="text-fg-muted">of {g.rank_category_total}</span></span>]);
    if (g.best_day) rows.push(['Best day', <span key="b" className="font-medium">{fmtDay(g.best_day.date)}{g.best_day.value !== undefined ? <span className="text-fg-muted"> · {fmtFull(g.best_day.value)} visitors</span> : null}</span>]);
    if (rows.length === 0) return null;
    return (
        <Card>
            <CardHeader title="Growth" description={`Compared with the ${RANGE_PREV_NAMES[p.range]}`} />
            <dl className="divide-y divide-border-subtle">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2 text-body">
                        <dt className="text-fg-secondary">{label}</dt>
                        <dd className="text-fg">{value}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

export function AboutCard({ p }: { p: ProfilePayload }) {
    const rows: Array<[string, React.ReactNode]> = [];
    if (p.founder_name) rows.push(['Founder', p.founder_name]);
    if (p.twitter_handle) rows.push(['X', <a key="x" className="text-brand-text hover:underline" href={`https://x.com/${p.twitter_handle}`} target="_blank" rel="noopener noreferrer nofollow">@{p.twitter_handle}</a>]);
    if (p.category) rows.push(['Category', p.category]);
    if (p.country) rows.push(['Top country', flag(p.country) ? `${flag(p.country)} ${p.country}` : p.country]);
    if (p.created_at) rows.push(['Listed since', fmtDay(p.created_at.slice(0, 10))]);
    if (p.topic_labels?.length) rows.push(['Audience topics', p.topic_labels.join(', ')]);
    if (rows.length === 0) return null;
    return (
        <Card>
            <CardHeader title="About" />
            <dl className="divide-y divide-border-subtle">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-4 py-2 text-body">
                        <dt className="shrink-0 text-fg-secondary">{label}</dt>
                        <dd className="min-w-0 text-right text-fg">{value}</dd>
                    </div>
                ))}
            </dl>
        </Card>
    );
}

export function SlotsCard({ p }: { p: ProfilePayload }) {
    if (p.ad_slots.length === 0) return null;
    return (
        <Card id="sponsor" className="scroll-mt-24">
            <CardHeader title="Sponsor this site" description="Prices are set by the owner. Payment and delivery are arranged directly with them." />
            <ul className="divide-y divide-border-subtle">
                {p.ad_slots.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0 flex-1 basis-48">
                            <p className="text-body font-semibold text-fg">{s.name}</p>
                            {s.preview_note ? <p className="text-body-sm text-fg-muted">{s.preview_note}</p> : null}
                        </div>
                        <p className="text-body font-medium text-fg tabular-nums">{formatCents(s.price_cents)} <span className="font-normal text-fg-muted">{billingPeriodSuffix(s.billing_period)}</span></p>
                        <p className="w-24 text-body-sm text-fg-muted">{s.quantity_open > 0 ? `${s.quantity_open} of ${s.quantity_total} open` : 'Sold out'}</p>
                        {s.quantity_open > 0 ? <RequestSlotButton slotId={s.id} /> : <Badge variant="neutral">Sold out</Badge>}
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export function SimilarCard({ p }: { p: ProfilePayload }) {
    if (p.similar.length === 0) return null;
    return (
        <Card>
            <CardHeader title="Similar sites" description={p.category ? `More in ${p.category}` : undefined} />
            <ul className="flex flex-col gap-2.5 pointer-coarse:gap-0">
                {p.similar.map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5">
                        <Favicon host={s.name} size={24} />
                        <Link href={profilePath(s)} className="min-w-0 flex-1 truncate text-body font-medium text-fg hover:underline pointer-coarse:py-1.5">{s.name}</Link>
                        <span className="text-body-sm text-fg-secondary"><CountValue m={s.visitors} bold={false} /></span>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export function OpenToLine({ p }: { p: ProfilePayload }) {
    if (p.open_to.length === 0) return null;
    return (
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
            <span className="font-medium text-fg">Open to</span>
            {p.open_to.map((o) => (
                <a key={o} href={o === 'sponsorships' && p.ad_slots.length ? '#sponsor' : '#offers'} className="relative rounded-full border border-border bg-surface px-2.5 py-0.5 text-meta font-medium text-fg-secondary transition-colors hover:border-border-strong hover:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-x-0.5 pointer-coarse:after:-inset-y-1.5">
                    {OPEN_TO_OPTIONS.find((x) => x.value === o)?.label}
                </a>
            ))}
        </p>
    );
}

export function SiteLine({ p }: { p: ProfilePayload }) {
    const host = hostOf(p.website_url);
    if (!host) return null;
    return (
        <a href={p.website_url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body text-brand-text hover:underline">
            <Globe aria-hidden size={14} /> {host}
        </a>
    );
}

