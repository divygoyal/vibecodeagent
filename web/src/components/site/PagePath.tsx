'use client';

import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { splitPagePath } from './lib/pagePath';

/**
 * A page path on one line, shortened in the middle when it does not fit: the head ("/es/tools/ai-ima…")
 * gives way first and the last segment ("/generator") stays readable; the tail is cut only once the head
 * is down to a few characters, so the whole width of the cell is used. "/" reads "/ (home)".
 */
function PathLine({ path, className, nativeTitle }: { path: string; className?: string; nativeTitle?: string }) {
    const [head, tail] = splitPagePath(path);
    return (
        <span className={cn('flex min-w-0 items-baseline whitespace-nowrap', className)} title={nativeTitle}>
            {/* shrink-[1000]: the head absorbs nearly all the shrinking until it reaches its minimum. */}
            <span className={cn('truncate', tail ? 'min-w-[2.5ch] shrink-[1000]' : 'min-w-0')}>{head}</span>
            {tail ? <span className="min-w-0 truncate">{tail}</span> : null}
        </span>
    );
}

/**
 * The page cell of every page list (Traffic › Pages, Pages, the Overview "Pages" card, Journeys), as in
 * OpenPanel: the page's title (GA4 pageTitle, brand suffix removed) over its path in muted text. Without a
 * title, the path alone is the main line. Hovering shows the full title and path.
 */
export function PagePath({ path, title, className }: { path: string; title?: string | null; className?: string }) {
    const [head, tail] = splitPagePath(path);
    const full = head + tail;
    if (!title) return <PathLine path={path} className={className} nativeTitle={full} />;
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
            <span className={cn('flex min-w-0 flex-col', className)}>
                <span className="truncate">{title}</span>
                <PathLine path={path} className="text-meta font-normal text-fg-muted" />
            </span>
        </Tooltip>
    );
}
