'use client';

import { useId, type ReactNode } from 'react';
import { Switch as S } from 'radix-ui';

import { cn } from '@/lib/cn';

export interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: ReactNode;
    description?: ReactNode;
    size?: 'sm' | 'md';
    disabled?: boolean;
    id?: string;
    /** Needed when there is no visible label. */
    ariaLabel?: string;
    className?: string;
}

/** Toggle switch (DESIGN 3.21): changes apply immediately. */
export function Switch({ checked, onCheckedChange, label, description, size = 'md', disabled, id, ariaLabel, className }: SwitchProps) {
    const auto = useId();
    const sid = id ?? auto;
    const control = (
        <S.Root
            id={sid}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={label ? undefined : ariaLabel}
            aria-describedby={description ? `${sid}-desc` : undefined}
            className={cn(
                'relative inline-flex shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors duration-120 ease-standard',
                // Touch: a 44px hit area around the 20px track (no layout change).
                'pointer-coarse:after:absolute pointer-coarse:after:-inset-3',
                'data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50',
                size === 'md' ? 'h-5 w-9' : 'h-4 w-7',
            )}
        >
            <S.Thumb
                className={cn(
                    'block rounded-full bg-white shadow-xs transition-transform duration-120 ease-standard',
                    size === 'md' ? 'size-4 data-[state=checked]:translate-x-4' : 'size-3 data-[state=checked]:translate-x-3',
                )}
            />
        </S.Root>
    );
    if (!label) return <span className={className}>{control}</span>;
    return (
        <div className={cn('flex items-start gap-3', className)}>
            <span className="pt-0.5">{control}</span>
            <span className="min-w-0">
                <label htmlFor={sid} className={cn('block text-body text-fg', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
                    {label}
                </label>
                {description ? <span id={`${sid}-desc`} className="mt-0.5 block text-body-sm text-fg-muted">{description}</span> : null}
            </span>
        </div>
    );
}
