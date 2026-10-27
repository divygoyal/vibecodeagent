import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export interface TableCardProps {
    /** Filters, search and chips: rendered above the table inside the card. */
    toolbar?: ReactNode;
    /** Screen-reader caption. */
    caption?: string;
    children: ReactNode;
    className?: string;
}

/**
 * Styled table for rows with inline actions or expandable panels (DESIGN 3.13
 * look: sunken header, subtle row borders). Scrolls inside its card on mobile.
 * Plain lists with simple columns use components/ui/Table instead.
 */
export function TableCard({ toolbar, caption, children, className }: TableCardProps) {
    return (
        <Card padding="none" className={cn('overflow-hidden', className)}>
            {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3">{toolbar}</div> : null}
            <div className="relative overflow-x-auto">
                <table className="w-full border-collapse text-body">
                    {caption ? <caption className="sr-only">{caption}</caption> : null}
                    {children}
                </table>
            </div>
        </Card>
    );
}

export function Th({ align = 'left', sticky, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: keyof typeof ALIGN; sticky?: boolean }) {
    return (
        <th
            scope="col"
            className={cn(
                'h-9 border-b border-border-subtle bg-surface-sunken px-3 text-meta font-medium whitespace-nowrap text-fg-muted first:pl-4 last:pr-4',
                ALIGN[align],
                sticky && 'sticky left-0 z-[2]',
                className,
            )}
            {...rest}
        />
    );
}

export function Td({ align = 'left', sticky, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: keyof typeof ALIGN; sticky?: boolean }) {
    return (
        <td
            className={cn(
                'px-3 py-2.5 align-middle first:pl-4 last:pr-4',
                ALIGN[align],
                sticky && 'sticky left-0 z-[1] bg-inherit',
                className,
            )}
            {...rest}
        />
    );
}

/** Body row: bottom border, hover tint; `selected` marks the open row. Sticky cells inherit the row background. */
export function Tr({ selected, className, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
    return (
        <tr
            className={cn(
                'border-b border-border-subtle transition-colors duration-120 last:border-0',
                selected ? 'bg-subtle' : 'bg-surface hover:bg-[color-mix(in_oklab,var(--tc-subtle)_60%,var(--tc-surface))]',
                className,
            )}
            {...rest}
        />
    );
}
