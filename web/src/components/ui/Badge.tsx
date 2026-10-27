import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type BadgeVariant = 'outline' | 'neutral' | 'brand' | 'up' | 'down' | 'warn' | 'info' | 'sponsored';

const VARIANT: Record<BadgeVariant, string> = {
    // No outlined chips (round 2 critique #4, D7): a soft fill reads quieter on both themes.
    outline: 'bg-subtle text-fg-muted',
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
 * Rectangular micro label in sentence case: `Domain`, `Prefix`, `GA4`,
 * `Sponsored` (DESIGN 3.12; caps chips dropped in round 2, critique 2.1).
 * At most one per row, and only where it carries meaning.
 */
export function Badge({ variant = 'outline', className, children, ...rest }: BadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex h-5 shrink-0 items-center gap-1 rounded-badge px-1.5 text-caption whitespace-nowrap',
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
