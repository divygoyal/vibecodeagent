'use client';

import { useMemo, useState } from 'react';
import { BarChart3, RotateCw } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { SiteEntry } from '@/lib/sites/siteDirectory';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Favicon } from '@/components/ui/Favicon';
import { Pill } from '@/components/ui/Pill';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtFull } from '@/lib/format';

export interface SitesStepProps {
    sites: SiteEntry[];
    loading: boolean;
    /** Both inventories failed. */
    failed: boolean;
    stale: boolean;
    finishing: boolean;
    finishError: string | null;
    onFinish: () => void;
    onRecheck: () => void;
    onSwitchAccount: () => void;
    onDemo: () => void;
    demoLoading: boolean;
}

function pairing(e: SiteEntry): { tone: 'up' | 'neutral'; short: string; long: string } {
    if (e.gscSiteUrl && e.ga4PropertyId) {
        return { tone: 'up', short: 'Search Console + GA4', long: `Paired with ${e.ga4Name || e.ga4PropertyId}` };
    }
    if (e.gscSiteUrl) return { tone: 'neutral', short: 'Search Console only', long: 'No matching Analytics property found' };
    return { tone: 'neutral', short: 'GA4 only', long: 'No Search Console site with this address' };
}

/** Step 2 (DESIGN 5.3): the sites we found and how they pair. Nothing to pick: all of them go to the portfolio. */
export function SitesStep({ sites, loading, failed, stale, finishing, finishError, onFinish, onRecheck, onSwitchAccount, onDemo, demoLoading }: SitesStepProps) {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? sites.filter((s) => s.label.toLowerCase().includes(q) || (s.ga4Name ?? '').toLowerCase().includes(q)) : sites;
    }, [query, sites]);

    const both = sites.filter((s) => s.gscSiteUrl && s.ga4PropertyId).length;
    const gscOnly = sites.filter((s) => s.gscSiteUrl && !s.ga4PropertyId).length;
    const ga4Only = sites.filter((s) => !s.gscSiteUrl && s.ga4PropertyId).length;

    if (loading) {
        return (
            <Card padding="lg" as="section" aria-busy aria-label="Loading your sites">
                <Skeleton className="h-7 w-40" delay={0} />
                <Skeleton className="mt-3 h-4 w-80 max-w-full" delay={0} />
                <div className="mt-6 flex flex-col gap-2">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" rounded="card" delay={0} />)}
                </div>
            </Card>
        );
    }

    if (failed) {
        return (
            <Card padding="lg" as="section" aria-labelledby="sites-title">
                <h1 id="sites-title" className="text-heading text-fg">Your sites</h1>
                <Banner
                    variant="danger"
                    title="We could not load your sites"
                    className="mt-4"
                    actions={(
                        <>
                            <Button size="sm" icon={RotateCw} onClick={onRecheck}>Try again</Button>
                            <Button size="sm" variant="secondary" onClick={onSwitchAccount}>Reconnect Google</Button>
                        </>
                    )}
                >
                    Google did not answer, or the permission expired. Try again, or reconnect your Google account.
                </Banner>
            </Card>
        );
    }

    if (sites.length === 0) {
        return (
            <Card padding="lg" as="section" aria-labelledby="sites-title">
                <h1 id="sites-title" className="sr-only">Your sites</h1>
                <EmptyState
                    variant="page"
                    icon={BarChart3}
                    title="We could not find any Search Console or Analytics properties"
                    description="This Google account has no sites to show yet. Add your site in Search Console or Analytics, or sign in with the account that owns it."
                    actions={(
                        <>
                            <Button variant="primary" icon={RotateCw} onClick={onRecheck}>Check again</Button>
                            <Button variant="secondary" onClick={onSwitchAccount}><GoogleMark />Use another Google account</Button>
                            <Button variant="ghost" onClick={onDemo} loading={demoLoading}>Explore with demo data</Button>
                        </>
                    )}
                />
            </Card>
        );
    }

    return (
        <Card padding="lg" as="section" aria-labelledby="sites-title">
            <h1 id="sites-title" className="text-heading text-fg">Your sites</h1>
            <p className="mt-2 text-body-lg text-fg-muted">
                We found <span className="font-medium text-fg tabular-nums">{fmtFull(sites.length)}</span> {sites.length === 1 ? 'site' : 'sites'}.
                {' '}They all appear in your portfolio, and you do not have to pick any.
            </p>
            <p className="mt-1 text-body-sm text-fg-muted tabular-nums">
                {fmtFull(both)} with Search Console and Analytics together
                {gscOnly > 0 ? `, ${fmtFull(gscOnly)} Search Console only` : ''}
                {ga4Only > 0 ? `, ${fmtFull(ga4Only)} Analytics only` : ''}.
            </p>

            {stale ? (
                <Banner variant="info" className="mt-4">The site you used last is no longer available. Review the list below, then continue.</Banner>
            ) : null}

            {sites.length > 6 ? (
                <div className="mt-5"><SearchInput value={query} onValueChange={setQuery} slashShortcut={false} placeholder="Search sites" aria-label="Search the sites we found" className="md:w-full" /></div>
            ) : null}

            <ul className={cn('mt-4 flex max-h-[min(440px,55dvh)] flex-col gap-1 overflow-y-auto rounded-card border border-border-subtle p-1')} aria-label="Sites we found">
                {filtered.length === 0 ? (
                    <li className="px-3 py-8 text-center text-body-sm text-fg-muted">No site matches &ldquo;{query}&rdquo;</li>
                ) : filtered.map((s) => {
                    const p = pairing(s);
                    return (
                        <li key={s.host} className="flex items-center gap-3 rounded-control px-3 py-2.5 hover:bg-subtle/50">
                            {s.gscSiteUrl ? (
                                <Favicon host={s.gscSiteUrl} size={24} />
                            ) : (
                                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-subtle text-fg-muted"><BarChart3 size={14} strokeWidth={1.75} /></span>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2 text-body font-medium text-fg">
                                    <span className="truncate">{s.label}</span>
                                    {s.gscKind ? <Badge>{s.gscKind === 'domain' ? 'Domain' : 'Prefix'}</Badge> : null}
                                </p>
                                <p className="truncate text-meta text-fg-muted">{p.long}</p>
                            </div>
                            <Pill tone={p.tone} className="max-sm:hidden">{p.short}</Pill>
                        </li>
                    );
                })}
            </ul>

            {finishError ? <p role="alert" className="mt-3 text-body-sm text-down">{finishError}</p> : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={onSwitchAccount}>Use another Google account</Button>
                <Button variant="primary" size="lg" loading={finishing} onClick={onFinish}>Go to portfolio</Button>
            </div>
            <p className="mt-4 text-meta text-fg-muted">A pairing is chosen by matching the site address. You can change one later from the site&apos;s menu in your portfolio.</p>
        </Card>
    );
}
