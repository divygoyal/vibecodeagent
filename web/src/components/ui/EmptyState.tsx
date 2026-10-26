import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
    icon?: LucideIcon;
    title: ReactNode;
    /** Say what happened and what to do. */
    description?: ReactNode;
    /** Primary button + secondary link. */
    actions?: ReactNode;
    /** page: centered py-16 · card: py-10 · inline: py-6 inside charts and tables. */
    variant?: 'page' | 'card' | 'inline';
    className?: string;
    children?: ReactNode;
}

const PAD = { page: 'py-16', card: 'py-10', inline: 'py-6' };

export function EmptyState({ icon: Icon, title, description, actions, variant = 'card', className, children }: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center px-4 text-center', PAD[variant], className)}>
            {Icon ? (
                <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-subtle text-fg-muted">
                    <Icon aria-hidden size={20} strokeWidth={1.75} />
                </span>
            ) : null}
            <p className={cn('text-fg', variant === 'page' ? 'text-title' : 'text-title-sm')}>{title}</p>
            {description ? <p className="mt-1 max-w-[360px] text-body text-fg-muted">{description}</p> : null}
            {actions ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
            {children}
        </div>
    );
}
