'use client';

import type { ReactNode } from 'react';

import { fmtDateRange } from '@/lib/format';
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
    /**
     * The page shows both sources (Overview, Pages, Actions): name both windows when the site has both
     * ("Traffic Sep 30 – Oct 27 · Search Sep 29 – Oct 26"), as they end on different days.
     */
    both?: boolean;
    /** Extra actions before the date range control. */
    actions?: ReactNode;
    tabs?: ReactNode;
    /** Hide the date range (Actions, Audit, Realtime, Retention). */
    noRange?: boolean;
    /** With noRange: what the page covers instead ("Last 30 minutes · updates every 30 s"). */
    rangeNote?: ReactNode;
    backHref?: string;
    title?: ReactNode;
}

/** Site page header: favicon + host, range facts, date range control last (no source badges: the subtitle names the source). */
export function SiteHeader({ section, source, search, both, actions, tabs, noRange, rangeNote, backHref, title }: SiteHeaderProps) {
    const { site, label, gsc, hasGa4, hasGsc } = useSite();
    const dr = useDateRange();
    // A Search-Console-only site has no GA4 days: its pages cover the Search Console window.
    const searchDays = search || (hasGsc && !hasGa4);
    const r = searchDays ? dr.resolvedSearch : dr.resolved;
    const s = dr.resolvedSearch;
    const range = both && hasGa4 && hasGsc && (r.start !== s.start || r.end !== s.end)
        ? `Traffic ${fmtDateRange(r.start, r.end)} · Search ${fmtDateRange(s.start, s.end)}${dr.compareLabel ? ` · ${dr.compareLabel}` : ''}`
        : `${fmtDateRange(r.start, r.end)}${r.prevStart && r.prevEnd ? ` vs ${fmtDateRange(r.prevStart, r.prevEnd)}` : ''}`;
    const facts = [source, noRange ? rangeNote : range].filter(Boolean);
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
            subtitle={facts.length ? facts.map((f, i) => <span key={i}>{i > 0 ? ' · ' : ''}{f}</span>) : undefined}
            actions={actions || !noRange ? (
                <>
                    {actions}
                    {noRange ? null : (
                        <span className="flex shrink-0 items-center gap-1">
                            <PeriodStepper search={searchDays} />
                            <DateRangeControl searchOnly={searchDays} />
                        </span>
                    )}
                </>
            ) : undefined}
            tabs={tabs}
        />
    );
}
