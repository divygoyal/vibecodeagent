import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';

export interface SettingsSectionProps {
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    /** Right-aligned actions under the controls (Save, Cancel). */
    footer?: ReactNode;
    /** Red outline for destructive sections. */
    danger?: boolean;
    id?: string;
    className?: string;
}

/**
 * Settings card with a label column on desktop and stacked on phones
 * (DESIGN 5.14): title and help text on the left, controls on the right.
 */
export function SettingsSection({ title, description, children, footer, danger, id, className }: SettingsSectionProps) {
    return (
        <Card as="section" id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn(danger && 'border-down/30', className)}>
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
                <div>
                    <h2 id={id ? `${id}-title` : undefined} className="text-title-sm text-fg">{title}</h2>
                    {description ? <p className="mt-1 text-body-sm text-fg-muted">{description}</p> : null}
                </div>
                <div className="min-w-0">
                    {children}
                    {footer ? <div className="mt-4 flex flex-wrap items-center justify-end gap-2">{footer}</div> : null}
                </div>
            </div>
        </Card>
    );
}

/** One row inside a SettingsSection: text left, control right, dividers between rows. */
export function SettingsRow({ title, description, control, className }: { title: ReactNode; description?: ReactNode; control: ReactNode; className?: string }) {
    return (
        <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle py-3 first:pt-0 last:border-b-0 last:pb-0', className)}>
            <div className="min-w-0 flex-1 basis-56">
                <p className="text-body font-medium text-fg">{title}</p>
                {description ? <p className="mt-0.5 text-body-sm text-fg-muted">{description}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">{control}</div>
        </div>
    );
}
