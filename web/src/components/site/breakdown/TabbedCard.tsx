'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';

export interface CardTab<T extends string> {
    value: T;
    label: string;
    count?: ReactNode;
    content: ReactNode;
    /** Right side of the header for this tab ("Sessions"). */
    meta?: ReactNode;
}

/**
 * One card, several breakdowns (Plausible / Umami style): title, small pill
 * tabs, the active list. The last tab is remembered per card on this device.
 */
export function TabbedCard<T extends string>({ id, title, description, lead, tabs, footer, actions, className, defaultTab }: {
    /** Remembers the tab: localStorage `tc.card.<id>`. */
    id: string;
    title: ReactNode;
    /** Muted line under the title (only shown with `lead`). */
    description?: ReactNode;
    /**
     * Content between the title and the tabs (round 5: the Devices split bar). With a lead, the tabs move to
     * their own row under it, so they read as belonging to the list below and not to the lead.
     */
    lead?: ReactNode;
    tabs: CardTab<T>[];
    footer?: ReactNode;
    actions?: ReactNode;
    className?: string;
    defaultTab?: T;
}) {
    const first = defaultTab ?? tabs[0]?.value;
    const [value, setValue] = useState<T | undefined>(first);
    // Read the remembered tab after mount (no server/client mismatch).
    useEffect(() => {
        try {
            const v = window.localStorage.getItem(`tc.card.${id}`);
            if (v && tabs.some((t) => t.value === v)) setValue(v as T);
        } catch {
            // storage blocked: keep the default
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
    const pick = (v: T) => {
        setValue(v);
        try {
            window.localStorage.setItem(`tc.card.${id}`, v);
        } catch {
            // ignore
        }
    };
    const active = tabs.find((t) => t.value === value) ?? tabs[0];
    if (!active) return null;
    const tabsEl = tabs.length > 1 ? (
        <Tabs<T>
            variant="pills"
            ariaLabel={`${typeof title === 'string' ? title : 'Card'} view`}
            items={tabs.map((t) => ({ value: t.value, label: t.label, count: t.count }))}
            value={active.value}
            onValueChange={pick}
            panelIdPrefix={`card-${id}`}
        />
    ) : null;
    return (
        <Card as="section" aria-label={typeof title === 'string' ? title : undefined} className={cn('flex min-w-0 flex-col', className)}>
            {lead ? (
                <>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                            <h3 className="text-title-sm text-fg">{title}</h3>
                            {description ? <p className="text-meta text-fg-muted">{description}</p> : null}
                        </div>
                        {actions}
                    </div>
                    {lead}
                    <div className="mt-4 mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
                        {tabsEl}
                        {active.meta ? <span className="text-meta text-fg-muted">{active.meta}</span> : null}
                    </div>
                </>
            ) : (
                <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <h3 className="text-title-sm text-fg">{title}</h3>
                        <div className="flex min-w-0 items-center gap-1.5">
                            {tabsEl}
                            {actions}
                        </div>
                    </div>
                    {active.meta ? <div className="mb-1 flex justify-end text-meta text-fg-muted">{active.meta}</div> : null}
                </>
            )}
            <div role="tabpanel" id={`card-${id}-${active.value}`} className="flex min-w-0 flex-1 flex-col">
                {active.content}
            </div>
            {footer ? <div className="mt-3">{footer}</div> : null}
        </Card>
    );
}
