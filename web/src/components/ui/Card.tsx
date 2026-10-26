import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<CardPadding, string> = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export const cardBaseClass = 'tc-card bg-surface border border-border-subtle rounded-card shadow-card';
export const cardInteractiveClass =
    'transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:border-border hover:shadow-card-hover hover:-translate-y-px motion-reduce:hover:translate-y-0';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    /** md p-5 (default), sm p-4 (portfolio cards, KPI tiles), none (tables, charts), lg p-6 (marketing). */
    padding?: CardPadding;
    /** Hover lift. Use CardLink when the whole card is a link. */
    interactive?: boolean;
    as?: 'div' | 'section' | 'article';
}

/** White card on the canvas (DESIGN 3.4). */
export function Card({ padding = 'md', interactive, as = 'div', className, ...rest }: CardProps) {
    const As = as as 'div';
    return <As className={cn(cardBaseClass, PADDING[padding], interactive && cardInteractiveClass, className)} {...rest} />;
}

export interface CardLinkProps extends Omit<HTMLAttributes<HTMLAnchorElement>, 'href'> {
    href: string;
    padding?: CardPadding;
    prefetch?: boolean;
}

/** A card that is a link (whole card clickable, lifts on hover, focus ring on the card). */
export function CardLink({ href, padding = 'md', className, prefetch, ...rest }: CardLinkProps) {
    return (
        <Link
            href={href}
            prefetch={prefetch}
            className={cn(cardBaseClass, cardInteractiveClass, PADDING[padding], 'block focus-visible:outline-2', className)}
            {...rest}
        />
    );
}

export interface CardHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    /** Right slot: icon buttons, tabs, legend. */
    actions?: ReactNode;
    /** Heading level for the title (default h3). */
    as?: 'h2' | 'h3' | 'h4';
    className?: string;
}

export function CardHeader({ title, description, actions, as: H = 'h3', className }: CardHeaderProps) {
    return (
        <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
            <div className="min-w-0">
                <H className="text-title-sm text-fg">{title}</H>
                {description ? <p className="mt-0.5 text-body-sm text-fg-muted">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
    );
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-meta text-fg-muted', className)}
            {...rest}
        />
    );
}
