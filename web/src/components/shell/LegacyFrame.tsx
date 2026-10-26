import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Wraps a page that still uses the old dark styling so it renders as before
 * inside the new shell: data-theme="dark" (tokens inside are dark too) and the
 * old black background. Delete the wrapper (nav.ts LEGACY_ROUTE_PREFIXES) when
 * the page moves to the tokens.
 */
export function LegacyFrame({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div data-theme="dark" className={cn('legacy rounded-card p-3 sm:p-4 md:p-5', className)}>
            {children}
        </div>
    );
}
