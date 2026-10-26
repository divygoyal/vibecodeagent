'use client';

import type { ReactNode } from 'react';

import { fromLegacyRange } from '@/lib/dateRange';
import { fmtDateRange } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Favicon } from '@/components/ui/Favicon';
import { DateRangeControl, useDateRange } from '@/components/shell/DateRangeControl';
import { LegacyFrame } from '@/components/shell/LegacyFrame';
import { SITE_NAV, type SiteSection } from '@/components/shell/nav';
import { PageHeader } from '@/components/shell/PageHeader';
import { useCurrentSite } from '@/components/shell/useCurrentSite';
import { WorkspaceContext, useWorkspace } from '@/components/shell/workspaceContext';

/**
 * Thin wrapper for the site pages until they are rebuilt (stream B): the new
 * site PageHeader (favicon, host, badges, date range) above the OLD page
 * content in a LegacyFrame. The old content reads the range from the
 * workspace context, so the URL range is bridged into it here.
 */
export function LegacySitePage({ section, children }: { section: SiteSection; children: ReactNode }) {
    const { site } = useCurrentSite();
    const ws = useWorkspace();
    const dr = useDateRange();
    const sectionLabel = SITE_NAV.find((s) => s.section === section)?.label ?? 'Overview';
    const searchFirst = section === 'search';
    const r = searchFirst ? dr.resolvedSearch : dr.resolved;

    return (
        <>
            <PageHeader
                icon={site ? <Favicon host={site.gscSiteUrl ?? site.host} size={24} /> : undefined}
                title={site?.label ?? ''}
                badges={site ? (
                    <>
                        {site.gscKind ? <Badge>{site.gscKind === 'domain' ? 'Domain' : 'Prefix'}</Badge> : null}
                        {site.ga4PropertyId ? <Badge>GA4</Badge> : null}
                    </>
                ) : undefined}
                subtitle={`${sectionLabel} · ${fmtDateRange(r.start, r.end)}${dr.compareLabel ? ` ${dr.compareLabel}` : ''}`}
                actions={<DateRangeControl searchOnly={searchFirst} />}
            />
            <WorkspaceContext.Provider
                value={{
                    ...ws,
                    range: dr.legacyRange,
                    setRange: (v: string) => {
                        const p = fromLegacyRange(v);
                        if (p) dr.setPreset(p);
                    },
                }}
            >
                <LegacyFrame>{children}</LegacyFrame>
            </WorkspaceContext.Provider>
        </>
    );
}
