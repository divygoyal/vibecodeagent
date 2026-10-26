import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/** Keyboard key hint: `/`, `⌘K`. */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-badge border border-border-subtle bg-surface-sunken px-1 font-mono text-[11px] leading-none font-medium text-fg-muted',
                className,
            )}
            {...rest}
        />
    );
}
