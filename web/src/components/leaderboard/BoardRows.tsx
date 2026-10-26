import Link from 'next/link';
import { ArrowRight, Megaphone, SearchX } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { billingPeriodSuffix, formatCents } from '@/lib/adSlots';
import { profilePath, RANGE_NAMES } from '@/lib/leaderboard/constants';
import { fmtFull } from '@/lib/format';
import type { BoardResponse, BoardRow, SponsoredCard } from '@/lib/leaderboard/types';
import { CategoryBadge, CountValue, Ga4Badge, OpenToChips, PctDelta, RankMark, RowSpark, VerificationBadge } from './shared';

const GRID = 'md:grid md:grid-cols-[44px_minmax(0,1fr)_150px_150px_170px] md:items-center md:gap-4';

function hostOf(url: string | null): string {
    return (url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function metricFor(row: BoardRow, focus: 'visitors' | 'clicks') {
    return focus === 'clicks' ? row.clicks : row.visitors;
}

export function BoardRowItem({ row, focus, range, showNew }: { row: BoardRow; focus: 'visitors' | 'clicks'; range: BoardResponse['range']; showNew: boolean }) {
    const m = metricFor(row, focus);
    const host = hostOf(row.website_url);
    const label = focus === 'clicks' ? 'search clicks' : 'visitors';
    return (
        <li className={cn('relative border-b border-border-subtle px-4 py-3.5 last:border-b-0 transition-colors duration-120 hover:bg-subtle/40', GRID)}>
            <div className="flex items-start gap-3 md:contents">
                <div className="flex w-7 shrink-0 justify-center pt-1 md:block md:pt-0"><RankMark rank={row.rank} /></div>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Favicon host={host || row.name} size={32} className="mt-0.5" />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={profilePath(row)} className="truncate text-body font-semibold text-fg after:absolute after:inset-0 hover:underline focus-visible:outline-offset-[-2px]">
                                {row.name}
                            </Link>
                            <span className="relative z-10 flex flex-wrap items-center gap-1.5">
                                <VerificationBadge v={row.verification} compact />
                                {row.verification.level === 'owner' && row.verification.ga4_connected ? <Ga4Badge /> : null}
                                <CategoryBadge name={row.category} />
                                {showNew ? <Badge variant="up">New</Badge> : null}
                            </span>
                        </div>
                        {row.description ? <p className="mt-0.5 line-clamp-2 text-body-sm text-fg-muted md:line-clamp-1">{row.description}</p> : null}
                        {row.topic_labels.length ? <p className="mt-0.5 truncate text-meta text-fg-faint">{row.topic_labels.join(' · ')}</p> : null}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-4 md:mt-0 md:block">
                <div>
                    <div className="flex items-baseline gap-2">
                        <CountValue m={m} className="text-stat-sm text-fg" />
                        {m ? <PctDelta pct={m.delta_pct} /> : null}
                    </div>
                    <p className="text-meta text-fg-muted">{label} · {RANGE_NAMES[range].replace('last ', '')}</p>
                </div>
                <div className="w-32 shrink-0 md:hidden"><RowSpark spark={row.spark} height={32} /></div>
            </div>

            <div className="hidden md:block"><RowSpark spark={row.spark} height={32} /></div>

            <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:mt-0 md:flex-col md:items-start">
                <OpenToChips items={row.open_to} limit={2} />
                {row.min_slot_price_cents !== null && row.ad_slot_count > 0 ? (
                    <span className="text-meta text-fg-muted">Ads from {formatCents(row.min_slot_price_cents)}</span>
                ) : null}
            </div>
        </li>
    );
}

function SponsoredRow({ card }: { card: SponsoredCard }) {
    const host = card.site.name;
    return (
        <li className={cn('relative border-b border-border-subtle bg-warn-soft/40 px-4 py-3 transition-colors duration-120 hover:bg-warn-soft/70', GRID)}>
            <div className="hidden md:block" />
            <div className="flex min-w-0 items-center gap-3">
                <Favicon host={host} size={32} />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="sponsored" />
                        <Link href={`${profilePath(card.site)}#sponsor`} className="truncate text-body font-semibold text-fg after:absolute after:inset-0 hover:underline">
                            Sponsor {card.site.name}: {card.slot.name}
                        </Link>
                    </div>
                    <p className="text-body-sm text-fg-muted">
                        {formatCents(card.slot.price_cents)} {billingPeriodSuffix(card.slot.billing_period)} · {card.slot.quantity_open} open
                    </p>
                </div>
            </div>
            <div className="hidden md:block" />
            <div className="hidden md:block" />
            <div className="mt-2 md:mt-0 md:text-right">
                <span className="inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary">View slot <ArrowRight aria-hidden size={14} /></span>
            </div>
        </li>
    );
}

function Header({ focus }: { focus: 'visitors' | 'clicks' }) {
    return (
        <div className={cn('hidden border-b border-border-subtle bg-surface-sunken px-4 py-2.5 text-meta font-medium text-fg-muted', GRID)}>
            <span className="text-center">#</span>
            <span>Site</span>
            <span>{focus === 'clicks' ? 'Search clicks' : 'Visitors'}</span>
            <span>Trend</span>
            <span>Open to</span>
        </div>
    );
}

export function BoardRows({ data, hasFilters, clearHref }: { data: BoardResponse; hasFilters: boolean; clearHref: string }) {
    if (data.rows.length === 0) {
        return (
            <Card padding="none">
                <EmptyState
                    icon={SearchX}
                    title={hasFilters ? 'No sites match' : 'Nothing here yet'}
                    description={hasFilters ? 'Try a different category or clear the search.' : 'Verified sites show up here as soon as they are listed.'}
                    actions={hasFilters
                        ? <Button asChild variant="secondary" size="md"><Link href={clearHref}>Clear filters</Link></Button>
                        : <Button asChild variant="primary" size="md"><Link href="/leaderboard/join">Add your site, free</Link></Button>}
                />
            </Card>
        );
    }
    const showSponsoredInline = data.tab === 'top' && data.page === 1 && data.sponsored.length > 0;
    const items: React.ReactNode[] = [];
    data.rows.forEach((row, i) => {
        items.push(<BoardRowItem key={row.id} row={row} focus={data.focus} range={data.range} showNew={data.tab !== 'new' && row.is_new} />);
        if (showSponsoredInline && i === 4) items.push(<SponsoredRow key={`sp-a`} card={data.sponsored[0]} />);
        if (showSponsoredInline && i === 14 && data.sponsored[1]) items.push(<SponsoredRow key={`sp-b`} card={data.sponsored[1]} />);
    });
    return (
        <Card padding="none" className="overflow-hidden">
            <Header focus={data.focus} />
            <ul>{items}</ul>
        </Card>
    );
}

export function SponsoredStrip({ cards, openTotal }: { cards: SponsoredCard[]; openTotal: number }) {
    if (cards.length === 0) return null;
    return (
        <section aria-label="Sponsored" className="mt-8">
            <div className="mb-2 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-body-sm font-medium text-fg-secondary">
                    <Badge variant="sponsored" /> Ad slots for sale on listed sites
                </p>
                <Link href="/leaderboard/advertise" className="text-body-sm font-medium text-fg-secondary hover:text-fg hover:underline">
                    Advertise{openTotal > cards.length ? ` · ${fmtFull(openTotal)} open slots` : ''}
                </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c) => (
                    <Link
                        key={c.slot.id}
                        href={`${profilePath(c.site)}#sponsor`}
                        className="tc-card group flex items-start gap-3 rounded-card border border-border-subtle bg-surface p-4 shadow-card transition-[box-shadow,border-color,transform] duration-120 hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0"
                    >
                        <Favicon host={c.site.name} size={32} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><Badge variant="sponsored" /><span className="truncate text-meta text-fg-muted">{c.site.name}</span></span>
                            <span className="mt-1 block truncate text-body font-semibold text-fg">{c.slot.name}</span>
                            <span className="mt-0.5 block text-body-sm text-fg-muted">
                                {formatCents(c.slot.price_cents)} {billingPeriodSuffix(c.slot.billing_period)} · {c.slot.quantity_open} open
                            </span>
                        </span>
                        <Megaphone aria-hidden size={16} className="mt-1 shrink-0 text-fg-faint group-hover:text-fg-muted" />
                    </Link>
                ))}
            </div>
        </section>
    );
}

export function Pagination({ data, params }: { data: BoardResponse; params: Record<string, string> }) {
    const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
    if (pages <= 1) {
        return data.total > 0 ? <p className="mt-3 text-right text-meta text-fg-muted">{fmtFull(data.total)} site{data.total === 1 ? '' : 's'}</p> : null;
    }
    const href = (p: number) => {
        const next = new URLSearchParams(params);
        if (p <= 1) next.delete('page'); else next.set('page', String(p));
        const qs = next.toString();
        return qs ? `/leaderboard?${qs}` : '/leaderboard';
    };
    const from = (data.page - 1) * data.pageSize + 1;
    const to = Math.min(data.page * data.pageSize, data.total);
    return (
        <nav aria-label="Pagination" className="mt-3 flex items-center justify-end gap-3 text-meta text-fg-muted">
            <span className="tabular-nums">{fmtFull(from)}–{fmtFull(to)} of {fmtFull(data.total)}</span>
            <Button asChild variant="secondary" size="sm" disabled={data.page <= 1}><Link href={href(data.page - 1)} aria-label="Previous page" rel="prev">Previous</Link></Button>
            <Button asChild variant="secondary" size="sm" disabled={data.page >= pages}><Link href={href(data.page + 1)} aria-label="Next page" rel="next">Next</Link></Button>
        </nav>
    );
}

