'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BarChart3, RotateCw, Search, Sparkles } from 'lucide-react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { FetchError } from './useSiteData';

/** Where a missing source can be linked. */
const SITES_SETTINGS = '/dashboard/settings?tab=sites';

/** "Link GA4" / "Connect Search Console" state (DESIGN 5.4, 6.7). */
export function SourceMissing({ source, variant = 'card', compact }: { source: 'ga4' | 'gsc'; variant?: 'card' | 'page' | 'inline'; compact?: boolean }) {
    const ga4 = source === 'ga4';
    const inner = (
        <EmptyState
            variant={variant === 'page' ? 'page' : 'inline'}
            icon={ga4 ? BarChart3 : Search}
            title={ga4 ? 'Link GA4 to see visitors' : 'Connect Search Console to see search data'}
            description={compact ? undefined : ga4
                ? 'This site has no Google Analytics 4 property linked. Link one to see users, sessions, sources and pages.'
                : 'This site has no Search Console property. Add the site in Search Console to see clicks, queries and rankings.'}
            actions={
                ga4 ? (
                    <Button asChild size="sm" variant="secondary"><Link href={SITES_SETTINGS}>Link a GA4 property</Link></Button>
                ) : (
                    <Button asChild size="sm" variant="secondary">
                        <a href="https://search.google.com/search-console/welcome" target="_blank" rel="noreferrer">Open Search Console</a>
                    </Button>
                )
            }
        />
    );
    if (variant === 'inline') return inner;
    return <Card padding="none">{inner}</Card>;
}

/** Error banner with a retry button. */
export function LoadError({ error, onRetry, title, className }: { error?: FetchError | Error | null; onRetry?: () => void; title?: ReactNode; className?: string }) {
    return (
        <Banner
            variant="danger"
            title={title ?? "Couldn't load this data"}
            className={className}
            actions={onRetry ? <Button size="sm" icon={RotateCw} onClick={onRetry}>Try again</Button> : undefined}
        >
            {error?.message ?? 'Something went wrong. Try again in a moment.'}
        </Banner>
    );
}

/**
 * Ask deep link: /dashboard/ask?q=…&property=…&site=… (the Ask page sends the
 * prompt once and selects the site). Costs one message.
 */
export function askHref(prompt: string, site: { ga4?: string | null; gsc?: string | null }, from?: string): string {
    const p = new URLSearchParams({ q: prompt.trim() });
    if (site.ga4) p.set('property', site.ga4);
    if (site.gsc) p.set('site', site.gsc);
    if (from) p.set('__from', from);
    return `/dashboard/ask?${p.toString()}`;
}

export function AskButton({ prompt, site, label = 'Ask AI', from, size = 'sm', variant = 'secondary' }: {
    prompt: string; site: { ga4?: string | null; gsc?: string | null }; label?: string; from?: string;
    size?: 'sm' | 'md'; variant?: 'secondary' | 'ghost' | 'subtle';
}) {
    return (
        <Button asChild size={size} variant={variant} icon={Sparkles}>
            <Link href={askHref(prompt, site, from)} title="Opens Ask with this question (uses 1 message)">{label}</Link>
        </Button>
    );
}
