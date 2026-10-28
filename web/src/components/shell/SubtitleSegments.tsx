import type { ReactNode } from 'react';

import { endsWithDot } from '@/lib/subtitleSegments';

/**
 * Subtitle facts that wrap between facts, never inside one (on phones a long fact may still wrap). The "·" belongs to the
 * fact before it, so a line never starts with a dot.
 */
export function SubtitleSegments({ items }: { items: ReactNode[] }) {
    return (
        <>
            {items.map((item, i) => (
                <span key={i}>
                    <span className="whitespace-nowrap max-sm:whitespace-normal">{item}{endsWithDot(i, items.length) ? <span aria-hidden> ·</span> : null}</span>
                    {i < items.length - 1 ? ' ' : null}
                </span>
            ))}
        </>
    );
}
