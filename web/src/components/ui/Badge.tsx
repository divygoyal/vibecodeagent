import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type BadgeVariant = 'outline' | 'neutral' | 'brand' | 'up' | 'down' | 'warn' | 'info' | 'sponsored';

const VARIANT: Record<BadgeVariant, string> = {
    outline: 'border border-border text-fg-muted bg-surface',
    neutral: 'bg-subtle text-fg-secondary',
    brand: 'bg-brand-soft text-brand-soft-fg',
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    warn: 'bg-warn-soft text-warn',
    info: 'bg-info-soft text-info',
    sponsored: 'bg-warn-soft text-warn',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

/**
 * Rectangular uppercase micro label: `DOMAIN`, `PREFIX`, `GA4`, `Sponsored`.
 * (DESIGN 3.12)
 */
export function Badge({ variant = 'outline', className, children, ...rest }: BadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex h-5 shrink-0 items-center gap-1 rounded-badge px-1.5 text-caption uppercase tracking-[0.04em] whitespace-nowrap',
                VARIANT[variant],
                className,
            )}
            {...rest}
        >
            {variant === 'sponsored' && !children ? 'Sponsored' : children}
        </span>
    );
}

/** `DOMAIN` for sc-domain: properties, `PREFIX` for URL-prefix ones. */
export function PropertyKindBadge({ siteUrl, className }: { siteUrl: string; className?: string }) {
    return <Badge className={className}>{siteUrl.startsWith('sc-domain:') ? 'Domain' : 'Prefix'}</Badge>;
}
