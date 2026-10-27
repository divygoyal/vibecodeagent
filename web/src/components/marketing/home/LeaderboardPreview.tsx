'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { fmtCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Section, SectionHeading } from '../site/Section';
import { SiteIcon } from '../site/SiteIcon';
import { boardRowsFor, fetchProofCounts, isTestServer, proofItems, type BoardPreviewRow, type ProofItem } from './proof';

type PreviewRow = BoardPreviewRow;

/* eslint-disable @typescript-eslint/no-explicit-any */
function hostOf(url: unknown): string | null {
    if (typeof url !== 'string' || !url) return null;
    try {
        return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function normalise(data: any): PreviewRow[] {
    if (Array.isArray(data?.rows)) {
        return data.rows.slice(0, 5).map((r: any, i: number) => {
            const v = r.visitors;
            return {
                key: String(r.id),
                rank: typeof r.rank === 'number' ? r.rank : i + 1,
                href: `/leaderboard/${encodeURIComponent(r.slug ?? r.id)}`,
                name: String(r.name ?? ''),
                host: hostOf(r.website_url),
                category: r.category ?? null,
                visitors: v ? (v.mode === 'exact' ? fmtCompact(v.value) : String(v.label ?? '')) : null,
                deltaPct: v && typeof v.delta_pct === 'number' ? v.delta_pct : null,
                spark: Array.isArray(r.spark?.values) ? r.spark.values.map((x: unknown) => (typeof x === 'number' ? x : 0)) : null,
                verified: Boolean(r.verification?.ranked ?? r.verification?.level === 'owner'),
            };
        });
    }
    if (Array.isArray(data?.entries)) {
        return data.entries.slice(0, 5).map((e: any, i: number) => ({
            key: String(e.id),
            rank: i + 1,
            href: `/leaderboard/${encodeURIComponent(e.slug ?? e.id)}`,
            name: String(e.startup_name ?? ''),
            host: hostOf(e.website_url),
            category: e.category ?? null,
            visitors: typeof e.monthly_visitors === 'number' ? fmtCompact(e.monthly_visitors) : null,
            deltaPct: typeof e.visitor_trend === 'number' ? e.visitor_trend : null,
            spark: null,
            verified: Boolean(e.is_verified),
        }));
    }
    return [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Delta({ pct }: { pct: number | null }) {
    if (pct === null || !Number.isFinite(pct)) return null;
    const up = pct >= 0;
    return (
        <span className={cn('inline-flex items-center gap-0.5 text-meta font-medium tabular-nums', up ? 'text-up' : 'text-down')}>
            <svg aria-hidden width="8" height="7" viewBox="0 0 8 7" className="fill-current">{up ? <path d="M4 0 8 7H0z" /> : <path d="M4 7 0 0h8z" />}</svg>
            {Math.abs(pct).toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%
            <span className="sr-only">{up ? 'up' : 'down'} versus the previous period</span>
        </span>
    );
}

/**
 * Live leaderboard teaser for the home page. Reads the public leaderboard API;
 * renders nothing at all (no section) until real rows arrive, and nothing when
 * the board is empty or unavailable. Never shows placeholder rows.
 *
 * Social proof (round 2): live counts of listed and owner-verified sites from
 * the same API, each shown only above its threshold (proof.ts), never invented.
 */
export function LeaderboardPreview({ sampleRows = [] }: { sampleRows?: BoardPreviewRow[] }) {
    const [rows, setRows] = useState<PreviewRow[] | null>(null);
    const [sample, setSample] = useState(false);
    const [proof, setProof] = useState<ProofItem[]>([]);

    useEffect(() => {
        const ctrl = new AbortController();
        fetch('/api/leaderboard?tab=top&range=28d&sort=traffic&page_size=5', { signal: ctrl.signal, headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                const board = boardRowsFor(data ? normalise(data).filter((r) => r.name) : [], isTestServer(window.location.hostname));
                // Test server with seeded listings: show the demo generator's own sites instead, so the numbers
                // match the portfolio above (same sites, same 28-day users), clearly tagged as sample rows.
                setRows(board.sample && sampleRows.length ? sampleRows : board.rows);
                setSample(board.sample);
            })
            .catch(() => { /* aborted or offline: stay hidden */ });
        fetchProofCounts(ctrl.signal)
            .then((counts) => setProof(proofItems(counts)))
            .catch(() => { /* aborted or offline: no proof row */ });
        return () => ctrl.abort();
    }, [sampleRows]);

    if (!rows || rows.length === 0) return null;

    return (
        <Section id="leaderboard" labelledBy="lb-title">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                <div>
                    <SectionHeading
                        id="lb-title"
                        eyebrow="Leaderboard"
                        title="A public board of verified traffic"
                        description="Numbers come straight from Google. Only verified site owners rank."
                    />
                    {proof.length ? (
                        <p className="mt-5 text-body-lg text-fg-secondary">
                            {proof.map((p, i) => (
                                <span key={p.key}>
                                    {i > 0 ? ' · ' : null}
                                    <strong className="font-semibold text-fg tabular-nums">{p.value.toLocaleString('en-US')}</strong> {p.label}
                                </span>
                            ))}
                        </p>
                    ) : null}
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <Button asChild variant="primary" size="xl">
                            <Link href="/leaderboard/join">Add your site, free</Link>
                        </Button>
                        <Button asChild variant="ghost" size="xl" trailingIcon={ArrowRight}>
                            <Link href="/leaderboard">See the full leaderboard</Link>
                        </Button>
                    </div>
                </div>

                <div className="rounded-card border border-border-subtle bg-surface shadow-card">
                    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                        <p className="min-w-0 truncate text-title-sm text-fg">Top sites right now</p>
                        {sample ? (
                            <span title="Test server: these rows are seed data. Real visitors only ever see real listings." className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-meta font-medium text-fg">Sample rows</span>
                        ) : (
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-meta text-fg-muted">
                                <span aria-hidden className="size-1.5 animate-live-dot rounded-full bg-up" />
                                Live<span className="max-sm:hidden"> from the leaderboard</span>
                            </span>
                        )}
                    </div>
                    <ol>
                        {rows.map((row) => (
                            <li key={row.key} className="border-b border-border-subtle last:border-b-0">
                                <Link href={row.href} className="flex items-center gap-2.5 px-3 py-3 transition-colors duration-120 hover:bg-subtle/60 sm:gap-3 sm:px-4">
                                    <span className="w-5 shrink-0 text-center text-body-sm font-medium tabular-nums text-fg-muted sm:w-6">{row.rank}</span>
                                    <SiteIcon host={row.host ?? row.name} size={24} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex min-w-0 items-center gap-1">
                                            <span className="truncate text-body font-semibold text-fg">{row.name}</span>
                                            {row.verified ? <ShieldCheck aria-label="Verified" size={14} strokeWidth={1.75} className="shrink-0 text-brand-text" /> : null}
                                        </span>
                                        <span className="flex min-w-0 items-center gap-2 text-body-sm text-fg-muted">
                                            {row.host ? <span className="truncate">{row.host}</span> : null}
                                            {row.category ? <Badge variant="neutral" className="max-sm:hidden">{row.category}</Badge> : null}
                                        </span>
                                    </span>
                                    {row.spark && row.spark.length > 1 ? (
                                        <span className="hidden w-24 shrink-0 min-[480px]:block">
                                            <Sparkline height={28} series={[{ metric: 'users', values: row.spark, label: 'Visitors' }]} interactive={false} />
                                        </span>
                                    ) : <span className="hidden w-24 shrink-0 min-[480px]:block" aria-hidden />}
                                    <span className="w-[4.5rem] shrink-0 text-right sm:w-24">
                                        {row.visitors ? <span className="block whitespace-nowrap text-body font-semibold tabular-nums text-fg sm:text-stat-sm">{row.visitors}</span> : null}
                                        <Delta pct={row.deltaPct} />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ol>
                    <p className="border-t border-border-subtle px-4 py-2.5 text-meta text-fg-secondary">
                        Visitors, last 28 days{rows.some((r) => r.visitors && /[–-]/.test(r.visitors)) ? ' · a range means the owner chose to show a range' : ''}
                    </p>
                </div>
            </div>
        </Section>
    );
}
