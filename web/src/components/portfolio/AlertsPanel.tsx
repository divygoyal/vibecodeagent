'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import { Button, Card, Favicon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtMetric } from '@/lib/metrics';
import type { PortfolioAlert } from '@/lib/portfolio/types';

const VISIBLE = 4;

/** Drops of more than 30% and zero-traffic runs, worst first. */
export function AlertsPanel({ alerts, hrefFor, onOpen, className }: {
    alerts: PortfolioAlert[];
    hrefFor: (slug: string) => string;
    onOpen?: (alert: PortfolioAlert) => void;
    className?: string;
}) {
    const [all, setAll] = useState(false);
    if (alerts.length === 0) return null;
    const shown = all ? alerts : alerts.slice(0, VISIBLE);
    return (
        <Card padding="none" className={cn('overflow-hidden', className)} as="section" aria-labelledby="portfolio-alerts">
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="text-down" />
                <h2 id="portfolio-alerts" className="text-title-sm text-fg">Alerts</h2>
                <span className="text-meta text-fg-muted tabular-nums">{alerts.length}</span>
                <span className="flex-1" />
                <span className="hidden text-meta text-fg-muted sm:inline">Drops over 30% vs the previous period, or no traffic for 2+ days</span>
            </div>
            <ul>
                {shown.map((a) => (
                    <li key={a.id} className="border-b border-border-subtle last:border-0">
                        <Link
                            href={hrefFor(a.slug)}
                            prefetch={false}
                            onClick={() => onOpen?.(a)}
                            className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors duration-120 hover:bg-subtle/60 focus-visible:-outline-offset-2"
                        >
                            <span
                                aria-label={a.severity === 'critical' ? 'Critical' : 'Warning'}
                                className={cn('size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-down' : 'bg-warn')}
                            />
                            <Favicon host={a.host} size={16} />
                            <span className="min-w-0 shrink truncate text-body font-medium text-fg">{a.host}</span>
                            <span className={cn('min-w-0 flex-1 truncate text-body-sm', a.severity === 'critical' ? 'text-down' : 'text-warn')}>
                                {a.message}
                            </span>
                            {a.type === 'drop' && a.previous !== null ? (
                                <span className="hidden text-meta text-fg-muted tabular-nums md:inline">
                                    {fmtMetric(a.metric, a.current, { compact: true })} vs {fmtMetric(a.metric, a.previous, { compact: true })}
                                </span>
                            ) : null}
                            <ArrowRight aria-hidden size={14} className="shrink-0 text-fg-muted" />
                        </Link>
                    </li>
                ))}
            </ul>
            {alerts.length > VISIBLE ? (
                <div className="border-t border-border-subtle px-4 py-2">
                    <Button variant="link" size="sm" onClick={() => setAll((v) => !v)}>
                        {all ? 'Show fewer' : `Show all ${alerts.length} alerts`}
                    </Button>
                </div>
            ) : null}
        </Card>
    );
}
