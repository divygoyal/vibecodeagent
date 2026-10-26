'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export type BannerVariant = 'info' | 'success' | 'warn' | 'danger' | 'neutral';

const STYLE: Record<BannerVariant, { box: string; icon: string; Icon: LucideIcon }> = {
    info: { box: 'bg-info-soft border-info/20', icon: 'text-info', Icon: Info },
    success: { box: 'bg-up-soft border-up/20', icon: 'text-up', Icon: CheckCircle2 },
    warn: { box: 'bg-warn-soft border-warn/25', icon: 'text-warn', Icon: AlertTriangle },
    danger: { box: 'bg-down-soft border-down/20', icon: 'text-down', Icon: XCircle },
    neutral: { box: 'bg-surface-sunken border-border-subtle', icon: 'text-fg-muted', Icon: Info },
};

export interface BannerProps {
    variant?: BannerVariant;
    title?: ReactNode;
    children?: ReactNode;
    /** Small buttons at the right (wrap below on narrow screens). */
    actions?: ReactNode;
    /** Shows a close button. Omit when the banner needs action. */
    onDismiss?: () => void;
    icon?: LucideIcon;
    className?: string;
}

/** Inline alert and page banner (DESIGN 3.24). One page banner at a time. */
export function Banner({ variant = 'info', title, children, actions, onDismiss, icon, className }: BannerProps) {
    const s = STYLE[variant];
    const Icon = icon ?? s.Icon;
    return (
        <div
            role={variant === 'danger' || variant === 'warn' ? 'alert' : 'status'}
            className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-control border p-3.5 text-fg', s.box, className)}
        >
            <Icon aria-hidden size={16} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', s.icon)} />
            <div className="min-w-0 flex-1 basis-[220px]">
                {title ? <p className="text-body font-medium">{title}</p> : null}
                {children ? <div className={cn('text-body-sm', title ? 'mt-0.5 text-fg-secondary' : 'text-fg')}>{children}</div> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
            {onDismiss ? (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                    className="-m-1 flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg"
                >
                    <X aria-hidden size={14} />
                </button>
            ) : null}
        </div>
    );
}
