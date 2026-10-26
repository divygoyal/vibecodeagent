'use client';

import { useId, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { Checkbox as C, RadioGroup as R } from 'radix-ui';

import { cn } from '@/lib/cn';

export interface CheckboxProps {
    checked: boolean | 'indeterminate';
    onCheckedChange: (checked: boolean) => void;
    label?: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
    id?: string;
    ariaLabel?: string;
    className?: string;
}

/** 16px checkbox; indeterminate shows a dash (DESIGN 3.21). */
export function Checkbox({ checked, onCheckedChange, label, description, disabled, id, ariaLabel, className }: CheckboxProps) {
    const auto = useId();
    const cid = id ?? auto;
    const box = (
        <C.Root
            id={cid}
            checked={checked}
            onCheckedChange={(v) => onCheckedChange(v === true)}
            disabled={disabled}
            aria-label={label ? undefined : ariaLabel}
            aria-describedby={description ? `${cid}-desc` : undefined}
            className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-surface text-white',
                'transition-colors duration-80 data-[state=checked]:border-brand data-[state=checked]:bg-brand',
                'data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=checked]:text-brand-fg data-[state=indeterminate]:text-brand-fg',
                'disabled:cursor-not-allowed disabled:opacity-50',
            )}
        >
            <C.Indicator>
                {checked === 'indeterminate' ? <Minus aria-hidden size={12} strokeWidth={3} /> : <Check aria-hidden size={12} strokeWidth={3} />}
            </C.Indicator>
        </C.Root>
    );
    if (!label) return <span className={cn('inline-flex', className)}>{box}</span>;
    return (
        <div className={cn('flex items-start gap-2.5', className)}>
            <span className="pt-0.5">{box}</span>
            <span className="min-w-0">
                <label htmlFor={cid} className={cn('block text-body text-fg', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>{label}</label>
                {description ? <span id={`${cid}-desc`} className="mt-0.5 block text-body-sm text-fg-muted">{description}</span> : null}
            </span>
        </div>
    );
}

export interface RadioOption<T extends string = string> {
    value: T;
    label: ReactNode;
    description?: ReactNode;
    disabled?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
    value: T;
    onValueChange: (value: T) => void;
    options: RadioOption<T>[];
    ariaLabel: string;
    className?: string;
}

/** Radio list: 16px circles, checked = brand dot 6 (DESIGN 3.21). */
export function RadioGroup<T extends string = string>({ value, onValueChange, options, ariaLabel, className }: RadioGroupProps<T>) {
    const base = useId();
    return (
        <R.Root value={value} onValueChange={(v) => onValueChange(v as T)} aria-label={ariaLabel} className={cn('flex flex-col gap-3', className)}>
            {options.map((o) => {
                const rid = `${base}-${o.value}`;
                return (
                    <div key={o.value} className="flex items-start gap-2.5">
                        <R.Item
                            id={rid}
                            value={o.value}
                            disabled={o.disabled}
                            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface data-[state=checked]:border-brand disabled:opacity-50"
                        >
                            <R.Indicator className="size-1.5 rounded-full bg-brand" />
                        </R.Item>
                        <span className="min-w-0">
                            <label htmlFor={rid} className="block cursor-pointer text-body text-fg">{o.label}</label>
                            {o.description ? <span className="mt-0.5 block text-body-sm text-fg-muted">{o.description}</span> : null}
                        </span>
                    </div>
                );
            })}
        </R.Root>
    );
}
