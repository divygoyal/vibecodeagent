'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { RotateCw, Sparkles } from 'lucide-react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { LinkSource } from './LinkSource';
import type { FetchError } from './useSiteData';

/**
 * "Link GA4" / "Connect Search Console" state (DESIGN 5.4, 6.7): a picker of the properties this Google
 * account can see, "Check again" and what to do when the site is missing (components/site/LinkSource.tsx).
 */
export function SourceMissing({ source, variant = 'card' }: { source: 'ga4' | 'gsc'; variant?: 'card' | 'page' | 'inline' }) {
    return <LinkSource source={source} variant={variant} />;
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
