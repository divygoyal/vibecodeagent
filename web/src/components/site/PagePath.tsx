'use client';

import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { splitPagePath } from './lib/pagePath';

/**
 * A page path on one line, shortened in the middle when it does not fit: the
 * head ("/es/tools/ai-ima…") gives way first and the last segment
 * ("/generator") stays readable. "/" reads "/ (home)". With a `title`, hovering
 * shows the page title and the full path in a tooltip; without one, the full path
 * is the native title.
 */
export function PagePath({ path, title, className }: { path: string; title?: string | null; className?: string }) {
    const [head, tail] = splitPagePath(path);
    const full = head + tail;
    const text = (
        <span className={cn('flex min-w-0 items-baseline whitespace-nowrap', className)} title={title ? undefined : full}>
            <span className="min-w-0 truncate">{head}</span>
            {/* The last segment keeps up to 70% of the width; a very long one is cut at its end. */}
            {tail ? <span className="max-w-[70%] shrink-0 truncate">{tail}</span> : null}
        </span>
    );
    if (!title) return text;
    return (
        <Tooltip
            content={(
                <span className="flex flex-col gap-0.5">
                    <span className="[overflow-wrap:anywhere]">{title}</span>
                    <span className="font-normal opacity-75 [overflow-wrap:anywhere]">{full}</span>
                </span>
            )}
            className="max-w-80"
        >
            {text}
        </Tooltip>
    );
}
