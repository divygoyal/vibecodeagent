'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { MetricDelta } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtMetric, METRICS, type MetricKey } from '@/lib/metrics';
import { DemoSiteCard } from '../demo/DemoSiteCard';
import type { DemoPortfolio } from '../demo/types';
import { BrowserFrame } from '../site/Section';

function Total({ metric, cur, prev }: { metric: MetricKey; cur: number | null | undefined; prev: number | null | undefined }) {
    const m = METRICS[metric];
    return (
        <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-meta font-medium text-fg-secondary">
                <span aria-hidden className="size-2 rounded-full" style={{ background: m.color }} />
                {m.label}
            </p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-stat-sm text-fg">{fmtMetric(metric, cur ?? null, { compact: true, tile: true })}</span>
                <MetricDelta metric={metric} current={cur} previous={prev} />
            </p>
        </div>
    );
}

/**
 * The home hero's product frame: the real portfolio cards and totals,
 * rendered from the demo data generator (no iframe, no screenshot).
 */
export function PortfolioPreview({ portfolio, cards = 6 }: { portfolio: DemoPortfolio; cards?: number }) {
    const { totals } = portfolio;
    const sites = portfolio.sites.slice(0, cards);
    return (
        <BrowserFrame url="trafficclaw.com/dashboard" bodyClassName="p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-title text-fg">Portfolio</p>
                    <p className="text-meta text-fg-muted">
                        {totals.sites.synced} of {totals.sites.total} sites synced · sample data
                    </p>
                </div>
                <div aria-hidden className="inline-flex h-8 items-center rounded-full bg-subtle p-[3px] text-body-sm font-medium">
                    {['7d', '28d', '3m', '12m'].map((r) => (
                        <span key={r} className={cn('rounded-full px-3 py-1', r === portfolio.range ? 'bg-brand text-brand-fg shadow-xs' : 'text-fg-muted')}>{r}</span>
                    ))}
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-border-subtle bg-surface p-4 shadow-card sm:grid-cols-3 lg:grid-cols-5">
                <Total metric="clicks" cur={totals.search?.cur.clicks} prev={totals.search?.prev?.clicks} />
                <Total metric="impressions" cur={totals.search?.cur.impressions} prev={totals.search?.prev?.impressions} />
                <Total metric="position" cur={totals.search?.cur.position} prev={totals.search?.prev?.position} />
                <Total metric="users" cur={totals.traffic?.cur.users} prev={totals.traffic?.prev?.users} />
                <Total metric="sessions" cur={totals.traffic?.cur.sessions} prev={totals.traffic?.prev?.sessions} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sites.map((site, i) => (
                    <DemoSiteCard
                        key={site.key}
                        site={site}
                        portfolio={portfolio}
                        className={cn(i >= 2 && 'hidden md:flex', i >= 4 && 'md:hidden xl:flex')}
                    />
                ))}
            </div>

            <div className="mt-4 flex justify-center">
                <Link href="/demo" className="inline-flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-fg">
                    Open the full demo ({totals.sites.total} sample sites)
                    <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                </Link>
            </div>
        </BrowserFrame>
    );
}
