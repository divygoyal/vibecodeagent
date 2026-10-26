'use client';

import useSWR from 'swr';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SiteChoice } from '@/lib/leaderboard/types';

interface SitesResponse {
    sites: SiteChoice[];
    errors?: { ga4?: { status: number; message: string }; gsc?: { status: number; message: string } };
}

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json() as Promise<SitesResponse>);

export function SitePicker({ onPick, creating, onOpenExisting }: {
    onPick: (site: SiteChoice) => void;
    creating: string | null;
    onOpenExisting: (entryId: number) => void;
}) {
    const { data, isLoading } = useSWR('/api/leaderboard/me/sites', fetcher, { revalidateOnFocus: false });
    const sites = data?.sites ?? [];
    return (
        <div className="flex flex-col gap-3">
            {data?.errors?.ga4 || data?.errors?.gsc ? (
                <Banner variant="warn" title="Some of your Google data could not be read">
                    {data.errors.ga4 ? `Analytics: ${data.errors.ga4.message} ` : ''}{data.errors.gsc ? `Search Console: ${data.errors.gsc.message}` : ''}
                </Banner>
            ) : null}
            {isLoading ? (
                [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" rounded="card" />)
            ) : sites.length === 0 ? (
                <Card padding="none"><EmptyState icon={Search} variant="card" title="No sites found" description="Connect a Google account that has Google Analytics and Search Console access to the site you want to list." /></Card>
            ) : (
                <ul className="flex flex-col gap-2">
                    {sites.map((s) => {
                        const busy = creating === s.key;
                        return (
                            <li key={s.key}>
                                <Card padding="sm" className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <Favicon host={s.gsc?.siteUrl ?? s.host} size={24} />
                                    <div className="min-w-0 flex-1 basis-56">
                                        <p className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-fg">
                                            {s.host}
                                            {s.ga4 ? <Badge variant="info">GA4</Badge> : null}
                                            {s.gsc ? <Badge>{s.gsc.kind === 'domain' ? 'Domain' : 'Prefix'}</Badge> : null}
                                            {s.listedAs ? <Badge variant="brand">Listed</Badge> : null}
                                        </p>
                                        {s.note && !s.listedAs ? <p className="text-body-sm text-fg-muted">{s.note}</p> : null}
                                    </div>
                                    {s.listedAs ? (
                                        <Button size="sm" variant="secondary" onClick={() => onOpenExisting(s.listedAs as number)}>Open</Button>
                                    ) : (
                                        <Button size="sm" variant="primary" disabled={!s.canJoin || creating !== null} loading={busy} onClick={() => onPick(s)}>
                                            {s.canJoin ? 'Choose' : 'Needs GA4'}
                                        </Button>
                                    )}
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
