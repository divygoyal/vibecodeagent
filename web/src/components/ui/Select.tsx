'use client';

import type { ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';

import { cn } from '@/lib/cn';

export interface SelectOption<T extends string = string> {
    value: T;
    label: ReactNode;
    /** Plain text for type-ahead and the trigger when label is a node. */
    textValue?: string;
    icon?: ReactNode;
    disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
    value: T | undefined;
    onValueChange: (value: T) => void;
    options: SelectOption<T>[];
    /** Muted text inside the trigger before the value: "Sort:". */
    label?: string;
    placeholder?: string;
    size?: 'sm' | 'md';
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
    contentClassName?: string;
    align?: 'start' | 'center' | 'end';
}

/**
 * Select with a menu styled like DropdownMenu (DESIGN 3.9). Type-ahead and arrows built in.
 * The menu is z-75, above Drawer (60) and Modal (70), so a Select inside a sheet opens on top
 * of the sheet's overlay and taps reach its options (below toasts 80 and tooltips 90).
 */
export function Select<T extends string = string>({
    value, onValueChange, options, label, placeholder = 'Select', size = 'md', ariaLabel, disabled, className, contentClassName, align = 'start',
}: SelectProps<T>) {
    return (
        <S.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
            <S.Trigger
                aria-label={ariaLabel ?? label}
                className={cn(
                    'tc-control tap-area inline-flex min-w-40 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-left text-fg',
                    'transition-colors duration-120 hover:border-border-strong data-[state=open]:border-border-strong',
                    'focus-visible:outline-2 disabled:opacity-50 data-[placeholder]:text-fg-muted',
                    size === 'md' ? 'h-9 text-body' : 'h-8 text-body-sm',
                    className,
                )}
            >
                {label ? <span className="shrink-0 text-fg-muted">{label}</span> : null}
                <span className="min-w-0 flex-1 truncate">
                    <S.Value placeholder={placeholder} />
                </span>
                <S.Icon asChild>
                    <ChevronDown aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-fg-muted" />
                </S.Icon>
            </S.Trigger>
            <S.Portal>
                <S.Content
                    position="popper"
                    sideOffset={6}
                    align={align}
                    collisionPadding={8}
                    className={cn(
                        'tc-ui z-75 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
                        'rounded-popover border border-border-subtle bg-surface-raised p-1 text-body text-fg shadow-popover animate-pop-in',
                        contentClassName,
                    )}
                >
                    <S.Viewport>
                        {options.map((o) => (
                            <S.Item
                                key={o.value}
                                value={o.value}
                                textValue={o.textValue}
                                disabled={o.disabled}
                                className={cn(
                                    'relative flex h-8 pointer-coarse:h-11 cursor-default select-none items-center gap-2 rounded-md pl-2 pr-8 outline-none',
                                    'data-[highlighted]:bg-subtle data-[disabled]:text-fg-faint',
                                    size === 'sm' && 'text-body-sm',
                                )}
                            >
                                {o.icon ? <span className="flex shrink-0 text-fg-muted">{o.icon}</span> : null}
                                <S.ItemText>{o.label}</S.ItemText>
                                <S.ItemIndicator className="absolute right-2 inline-flex">
                                    <Check aria-hidden size={16} strokeWidth={1.75} />
                                </S.ItemIndicator>
                            </S.Item>
                        ))}
                    </S.Viewport>
                </S.Content>
            </S.Portal>
        </S.Root>
    );
}
