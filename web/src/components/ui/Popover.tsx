'use client';

import type { ReactNode } from 'react';
import { Popover as P } from 'radix-ui';

import { cn } from '@/lib/cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export interface PopoverContentProps {
    children: ReactNode;
    className?: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    /** Accessible name when the content has no visible heading. */
    'aria-label'?: string;
    onOpenAutoFocus?: (e: Event) => void;
}

/** Popover panel: raised surface, popover radius and shadow (DESIGN 3.22 look). */
export function PopoverContent({ children, className, side = 'bottom', align = 'start', sideOffset = 6, ...rest }: PopoverContentProps) {
    return (
        <P.Portal>
            <P.Content
                side={side}
                align={align}
                sideOffset={sideOffset}
                collisionPadding={8}
                className={cn(
                    'tc-ui z-75 rounded-popover border border-border-subtle bg-surface-raised text-body text-fg shadow-popover',
                    'animate-pop-in outline-none',
                    className,
                )}
                {...rest}
            >
                {children}
            </P.Content>
        </P.Portal>
    );
}
