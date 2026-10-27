'use client';

import type { ReactNode } from 'react';

import { fmtDateRange } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Favicon } from '@/components/ui/Favicon';
import { DateRangeControl, useDateRange } from '@/components/shell/DateRangeControl';
import { PageHeader } from '@/components/shell/PageHeader';
import { PeriodStepper } from './chart/ChartExtras';
import { useSite } from './useSiteData';

export interface SiteHeaderProps {
    /** 'Overview', 'Traffic', ... shown after the host. */
    section?: string;
    /** First fact of the subtitle: 'Google Analytics 4 · Acme Web'. */
    source?: ReactNode;
    /** Use the Search Console days (end 2 days ago) in the subtitle and hide 24 hours. */
    search?: boolean;
    /** Extra actions before the date range control. */
    actions?: ReactNode;
    tabs?: ReactNode;
    /** Hide the date range (Actions, Audit). */
    noRange?: boolean;
    backHref?: string;
    title?: ReactNode;
}

/** Site page header: favicon + host + source badges, range facts, date range control last. */
export function SiteHeader({ section, source, search, actions, tabs, noRange, backHref, title }: SiteHeaderProps) {
    const { site, label, gsc } = useSite();
    const dr = useDateRange();
    const r = search ? dr.resolvedSearch : dr.resolved;
    const range = `${fmtDateRange(r.start, r.end)}${r.prevStart && r.prevEnd ? ` vs ${fmtDateRange(r.prevStart, r.prevEnd)}` : ''}`;
    const facts = [source, noRange ? null : range].filter(Boolean);
    return (
        <PageHeader
            backHref={backHref}
            icon={site ? <Favicon host={gsc ?? site.host} size={24} /> : undefined}
            title={title ?? (
                <>
                    {label}
                    {section ? <span className="font-normal text-fg-muted"> · {section}</span> : null}
                </>
            )}
            badges={site ? (
                <>
                    {site.gscKind ? <Badge>{site.gscKind === 'domain' ? 'Domain' : 'Prefix'}</Badge> : null}
                    {site.ga4PropertyId ? <Badge>GA4</Badge> : null}
                </>
            ) : undefined}
            subtitle={facts.length ? facts.map((f, i) => <span key={i}>{i > 0 ? ' · ' : ''}{f}</span>) : undefined}
            actions={actions || !noRange ? (
                <>
                    {actions}
                    {noRange ? null : (
                        <span className="flex shrink-0 items-center gap-1">
                            <PeriodStepper search={search} />
                            <DateRangeControl searchOnly={search} />
                        </span>
                    )}
                </>
            ) : undefined}
            tabs={tabs}
        />
    );
}
