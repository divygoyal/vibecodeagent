'use client';

import Link from 'next/link';
import { ArrowRight, LayoutGrid } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { Skeleton } from '@/components/ui/Skeleton';
import { DateRangeControl } from '@/components/shell/DateRangeControl';
import { siteHref } from '@/components/shell/nav';
import { PageHeader } from '@/components/shell/PageHeader';
import { useCurrentSite } from '@/components/shell/useCurrentSite';

/**
 * Portfolio placeholder. The portfolio stream replaces this file (and adds
 * app/portfolio/*) with the real page from DESIGN 5.1.
 */
export default function PortfolioPage() {
    const { sites, loading } = useCurrentSite();
    return (
        <>
            <PageHeader
                title="Portfolio"
                subtitle={loading ? 'Loading your sites…' : `${sites.length} ${sites.length === 1 ? 'site' : 'sites'}`}
                actions={<DateRangeControl />}
            />
            <Card padding="none">
                <EmptyState
                    variant="card"
                    icon={LayoutGrid}
                    title="Portfolio coming"
                    description="A card for every site with clicks, visitors and trends is on its way. Until then, open a site below."
                />
            </Card>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {loading
                    ? [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-14 w-full" rounded="card" /></li>)
                    : sites.map((s) => (
                        <li key={s.host}>
                            <Card padding="sm" className="flex items-center gap-3">
                                <Favicon host={s.gscSiteUrl ?? s.host} size={20} />
                                <span className="min-w-0 flex-1 truncate text-title-sm text-fg">{s.label}</span>
                                <Button asChild variant="link" size="sm" trailingIcon={ArrowRight}>
                                    <Link href={siteHref(s.host)}>Details</Link>
                                </Button>
                            </Card>
                        </li>
                    ))}
            </ul>
        </>
    );
}
