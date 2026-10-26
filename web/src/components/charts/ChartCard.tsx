'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Download, LayoutDashboard, MoreHorizontal, RotateCw, Sparkles, Table2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export type ChartState = 'ready' | 'loading' | 'refetching' | 'empty' | 'error';

export const CHART_HEIGHTS = { compact: 200, default: 280, large: 340 } as const;

export interface ChartCardProps {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Right side of the header: legend toggles, metric picker, segmented control. */
    actions?: ReactNode;
    /** Plot height: compact 200 · default 280 · large 340, or px. Mobile caps at 220. */
    height?: keyof typeof CHART_HEIGHTS | number;
    state?: ChartState;
    /** Empty state copy: say what happened and what to do. */
    empty?: { title: ReactNode; description?: ReactNode; action?: ReactNode };
    error?: { message?: ReactNode; onRetry?: () => void };
    /** Footer note: "Data through Oct 24 · GSC is delayed about 2 days". */
    footer?: ReactNode;
    /** Overflow menu entries; each shows only when its handler is given. */
    onDownloadCsv?: () => void;
    onAddToDashboard?: () => void;
    onAskAi?: () => void;
    /** Content of the "View as table" drawer (usually a <Table>). */
    tableView?: ReactNode;
    /** Extra menu items (DropdownMenuItem elements). */
    menuItems?: ReactNode;
    children?: ReactNode;
    className?: string;
}

/** Skeleton that mirrors a chart: 3 gridline bars + a flat area block. */
export function ChartSkeleton({ height }: { height: number }) {
    return (
        <div aria-hidden className="relative flex flex-col justify-between" style={{ height }}>
            {[0, 1, 2].map((i) => <span key={i} className="block h-px w-full bg-chart-grid" />)}
            <Skeleton className="absolute inset-x-0 bottom-0 h-2/5 rounded-md opacity-70" />
        </div>
    );
}

/**
 * Card + header + overflow menu + plot area with loading / refetching / empty /
 * error states (DESIGN 3.7). Put a TimeSeriesChart, BarList or Donut inside.
 */
export function ChartCard({
    title, subtitle, actions, height = 'default', state = 'ready', empty, error, footer,
    onDownloadCsv, onAddToDashboard, onAskAi, tableView, menuItems, children, className,
}: ChartCardProps) {
    const [tableOpen, setTableOpen] = useState(false);
    const h = typeof height === 'number' ? height : CHART_HEIGHTS[height];
    const hasMenu = Boolean(onDownloadCsv || onAddToDashboard || onAskAi || tableView || menuItems);

    return (
        <Card className={cn('relative overflow-hidden', className)}>
            {state === 'refetching' ? (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
                    <span className="block h-full w-2/5 animate-progress bg-brand" />
                </span>
            ) : null}
            <CardHeader
                title={title}
                description={subtitle}
                actions={
                    actions || hasMenu ? (
                        <>
                            {actions}
                            {hasMenu ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" iconOnly icon={MoreHorizontal} aria-label="Chart options" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {onDownloadCsv ? <DropdownMenuItem icon={Download} onSelect={onDownloadCsv}>Download CSV</DropdownMenuItem> : null}
                                        {tableView ? <DropdownMenuItem icon={Table2} onSelect={() => setTableOpen(true)}>View as table</DropdownMenuItem> : null}
                                        {onAddToDashboard ? <DropdownMenuItem icon={LayoutDashboard} onSelect={onAddToDashboard}>Add to dashboard</DropdownMenuItem> : null}
                                        {onAskAi ? (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem icon={Sparkles} onSelect={onAskAi}>Ask AI about this chart</DropdownMenuItem>
                                            </>
                                        ) : null}
                                        {menuItems}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : null}
                        </>
                    ) : undefined
                }
            />
            <div style={{ minHeight: state === 'ready' || state === 'refetching' ? undefined : Math.min(h, 220) }}>
                {state === 'loading' ? (
                    <ChartSkeleton height={h} />
                ) : state === 'error' ? (
                    <div className="flex items-center justify-center" style={{ minHeight: Math.min(h, 220) }}>
                        <Banner
                            variant="danger"
                            className="w-full max-w-md"
                            actions={error?.onRetry ? <Button size="sm" icon={RotateCw} onClick={error.onRetry}>Try again</Button> : undefined}
                        >
                            {error?.message ?? 'This chart could not load.'}
                        </Banner>
                    </div>
                ) : state === 'empty' ? (
                    <div className="flex items-center justify-center" style={{ minHeight: Math.min(h, 220) }}>
                        <EmptyState variant="inline" icon={BarChart3} title={empty?.title ?? 'No data for this period'} description={empty?.description} actions={empty?.action} />
                    </div>
                ) : (
                    <div className={cn('transition-opacity duration-120', state === 'refetching' && 'opacity-60')}>{children}</div>
                )}
            </div>
            {footer ? <p className="mt-3 text-meta text-fg-muted">{footer}</p> : null}
            {tableView ? (
                <Drawer open={tableOpen} onOpenChange={setTableOpen} title={typeof title === 'string' ? title : 'Data'} subtitle="Table view" width="wide">
                    {tableView}
                </Drawer>
            ) : null}
        </Card>
    );
}
