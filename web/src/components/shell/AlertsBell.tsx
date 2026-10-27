'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

import { cn } from '@/lib/cn';
import { BRAND_NAME } from '@/lib/brand';
import { isPushEnabled, sendBrowserNotification } from '@/lib/pushNotifications';
import { useAlerts } from '@/lib/useDashboardData';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { Tooltip } from '@/components/ui/Tooltip';
import { useCurrentSite } from './useCurrentSite';
import { useWorkspace } from './workspaceContext';

type AlertItem = { id: string | number; title?: string; metric?: string; severity?: string };

/** Alerts bell with a popover list; each alert opens Ask with a question about it. */
export function AlertsBell() {
    const [open, setOpen] = useState(false);
    const { site } = useCurrentSite();
    const { hasGoogleConnection, siteDirectory } = useWorkspace();
    const siteUrl = site?.gscSiteUrl ?? siteDirectory.find((s) => s.gscSiteUrl)?.gscSiteUrl ?? '';
    const { alerts, alertCount } = useAlerts(siteUrl, hasGoogleConnection && Boolean(siteUrl));
    const list = alerts as AlertItem[];
    const urgent = list.filter((a) => a.severity === 'critical' || a.severity === 'warning').length;

    // Browser push for new critical alerts (kept from the old layout).
    const prev = useRef(urgent);
    useEffect(() => {
        if (urgent > prev.current && isPushEnabled()) {
            const critical = list.filter((a) => a.severity === 'critical');
            if (critical.length > 0) {
                sendBrowserNotification(`${BRAND_NAME} Alert`, critical[0].title || 'New critical alert detected', { tag: 'critical-alert', onClick: () => setOpen(true) });
            }
        }
        prev.current = urgent;
    }, [urgent, list]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <span className="relative inline-flex">
                <Tooltip content="Alerts">
                    <PopoverTrigger asChild>
                        <Button variant="ghost" iconOnly icon={Bell} aria-label={urgent > 0 ? `Alerts (${urgent} active)` : 'Alerts'} />
                    </PopoverTrigger>
                </Tooltip>
                {urgent > 0 ? <span aria-hidden className="pointer-events-none absolute top-2 right-2 size-2 rounded-full bg-down ring-2 ring-canvas" /> : null}
            </span>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-16px)] p-0" aria-label="Alerts">
                <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
                    <span className="text-body-sm font-medium text-fg">Alerts</span>
                    {alertCount > 0 ? <span className="text-meta text-fg-muted tabular-nums">{alertCount} active</span> : null}
                </div>
                <div className="max-h-[340px] overflow-y-auto">
                    {list.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <p className="text-body-sm text-fg">No alerts right now</p>
                            <p className="mt-0.5 text-meta text-fg-muted">Drops and spikes show up here.</p>
                        </div>
                    ) : list.slice(0, 10).map((a) => {
                        const prompt = `${a.title}${a.metric ? ` — ${a.metric}` : ''}. Investigate why and recommend the next move.`;
                        return (
                            <Link
                                key={a.id}
                                href={`/dashboard/ask?q=${encodeURIComponent(prompt)}`}
                                onClick={() => setOpen(false)}
                                className="flex items-start gap-2.5 border-b border-border-subtle px-4 py-2.5 last:border-0 hover:bg-subtle"
                            >
                                <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-down' : a.severity === 'warning' ? 'bg-warn' : a.severity === 'success' ? 'bg-up' : 'bg-fg-faint')} />
                                <span className="min-w-0">
                                    <span className="block text-body-sm font-medium text-fg">{a.title}</span>
                                    {a.metric ? <span className="block text-meta text-fg-muted tabular-nums">{a.metric}</span> : null}
                                    <span className="mt-0.5 block text-meta text-fg-muted">Ask AI about it →</span>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
