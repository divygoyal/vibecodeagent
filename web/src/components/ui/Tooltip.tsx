'use client';

import type { ReactNode } from 'react';
import { Tooltip as T } from 'radix-ui';

import { cn } from '@/lib/cn';

/**
 * Mount once near the root (app/providers.tsx does). Open delay 300ms, 0ms when
 * moving between tooltipped items (DESIGN 3.18).
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
    return (
        <T.Provider delayDuration={300} skipDelayDuration={400}>
            {children}
        </T.Provider>
    );
}

export interface TooltipProps {
    /** Text only. Never put interactive content in a tooltip (use Popover). */
    content: ReactNode;
    /** The trigger. It must be one element that can take a ref and focus (button, link). */
    children: ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    /** Render the trigger without a tooltip. */
    disabled?: boolean;
    className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', disabled, className }: TooltipProps) {
    if (disabled || content === null || content === undefined || content === '') return <>{children}</>;
    return (
        <T.Root>
            <T.Trigger asChild>{children}</T.Trigger>
            <T.Portal>
                <T.Content
                    side={side}
                    align={align}
                    sideOffset={6}
                    collisionPadding={8}
                    className={cn(
                        'tc-ui z-90 max-w-60 rounded-md bg-inverse px-2 py-1 text-meta font-medium text-fg-inverse',
                        'animate-fade-in select-none',
                        className,
                    )}
                >
                    {content}
                </T.Content>
            </T.Portal>
        </T.Root>
    );
}
