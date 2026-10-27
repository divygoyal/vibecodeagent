'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Tooltip } from './Tooltip';

export type PillTone = 'neutral' | 'brand' | 'up' | 'down' | 'warn' | 'info';

const TONE: Record<PillTone, string> = {
    neutral: 'bg-subtle text-fg-muted',
    brand: 'bg-brand-soft text-brand-soft-fg',
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    warn: 'bg-warn-soft text-warn',
    info: 'bg-info-soft text-info',
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: PillTone;
    /** 6px dot in the current text colour. */
    dot?: boolean;
    icon?: ReactNode;
}

/** Rounded status / filter chip, h-6 (DESIGN 3.12). */
export function Pill({ tone = 'neutral', dot, icon, className, children, ...rest }: PillProps) {
    return (
        <span
            className={cn(
                'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-meta font-medium whitespace-nowrap',
                TONE[tone],
                className,
            )}
            {...rest}
        >
            {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
            {icon}
            {children}
        </span>
    );
}

export type SyncStatus = 'synced' | 'syncing' | 'stale' | 'error' | 'not_connected';

export interface StatusPillProps {
    status: SyncStatus;
    /** Override the default copy ("Synced", "Syncing", "Stale", "Reconnect", "Not linked"). */
    label?: string;
    /** 0-100, shown as "Syncing 40%". */
    progress?: number;
    /** Tooltip, e.g. "Synced 2 min ago". */
    tooltip?: string;
    /** Makes the pill a button (error/reconnect, stale/retry). */
    onClick?: () => void;
    className?: string;
}

const STATUS: Record<SyncStatus, { tone: PillTone; label: string }> = {
    synced: { tone: 'up', label: 'Synced' },
    syncing: { tone: 'info', label: 'Syncing' },
    stale: { tone: 'warn', label: 'Stale' },
    error: { tone: 'down', label: 'Reconnect' },
    not_connected: { tone: 'neutral', label: 'Not linked' },
};

/** Sync state pill used on site cards and site headers. */
export function StatusPill({ status, label, progress, tooltip, onClick, className }: StatusPillProps) {
    const s = STATUS[status];
    const text = label ?? (status === 'syncing' && typeof progress === 'number' ? `Syncing ${Math.round(progress)}%` : s.label);
    const icon = status === 'syncing'
        ? <Loader2 aria-hidden className="size-3 animate-spin" />
        : status === 'error'
            ? <AlertTriangle aria-hidden className="size-3" strokeWidth={2} />
            : null;
    const dot = status === 'synced' || status === 'stale';
    const pill = onClick ? (
        <button
            type="button"
            onClick={onClick}
            className={cn('tap-area inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-meta font-medium transition-[filter] duration-120 hover:brightness-95', TONE[s.tone], className)}
        >
            {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
            {icon}
            {text}
        </button>
    ) : (
        <Pill tone={s.tone} dot={dot} icon={icon} className={className} tabIndex={tooltip ? 0 : undefined} aria-live={status === 'syncing' ? 'polite' : undefined}>
            {text}
        </Pill>
    );
    return tooltip ? <Tooltip content={tooltip}>{pill}</Tooltip> : pill;
}

/** "Verified" badge for leaderboard entries (DESIGN 3.12). */
export function VerifiedBadge({ label = 'Verified', tooltip = 'GA4 property matches this domain. Checked daily.', className }: { label?: string; tooltip?: string; className?: string }) {
    return (
        <Tooltip content={tooltip}>
            <span
                tabIndex={0}
                className={cn('inline-flex h-6 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-meta font-semibold text-brand-soft-fg', className)}
            >
                <ShieldCheck aria-hidden size={14} strokeWidth={1.75} />
                {label}
            </span>
        </Tooltip>
    );
}
