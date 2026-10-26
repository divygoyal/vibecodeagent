import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

export interface AdminStatProps {
    label: string;
    value?: ReactNode;
    /** Small line under the value. */
    sub?: ReactNode;
    icon?: LucideIcon;
    loading?: boolean;
    /** Extra content under the value (progress bar, badges). */
    children?: ReactNode;
    className?: string;
}

/** Number tile for the operator consoles: label, big value, one muted line. */
export function AdminStat({ label, value, sub, icon: Icon, loading, children, className }: AdminStatProps) {
    return (
        <Card padding="sm" className={cn('flex min-w-0 flex-col gap-1', className)}>
            <div className="flex items-center gap-2 text-fg-secondary">
                {Icon ? <Icon aria-hidden size={14} strokeWidth={1.75} className="shrink-0 text-fg-muted" /> : null}
                <span className="truncate text-body-sm font-medium">{label}</span>
            </div>
            {loading ? (
                <>
                    <Skeleton className="mt-1 h-7 w-20" />
                    <Skeleton className="h-3.5 w-28" />
                </>
            ) : (
                <>
                    <div className="text-stat text-fg tabular-nums">{value}</div>
                    {sub ? <p className="text-meta text-fg-muted">{sub}</p> : null}
                    {children}
                </>
            )}
        </Card>
    );
}

/** Thin capacity bar. Danger over 80%, warning over 50%; the percentage is always written next to it. */
export function UsageBar({ percent, label }: { percent: number; label: string }) {
    const pct = Math.max(0, Math.min(100, percent));
    const tone = pct > 80 ? 'bg-down' : pct > 50 ? 'bg-warn' : 'bg-up';
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
        >
            <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
        </div>
    );
}
