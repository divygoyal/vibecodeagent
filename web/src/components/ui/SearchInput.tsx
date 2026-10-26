'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Kbd } from './Kbd';

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
    value: string;
    onValueChange: (value: string) => void;
    /** Focus with "/" when no other field has focus, and show the hint while empty. Default true. */
    slashShortcut?: boolean;
    size?: 'sm' | 'md';
}

/** Round search field (DESIGN 3.10). Esc clears; the clear button appears when not empty. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
    { value, onValueChange, slashShortcut = true, placeholder = 'Search', size = 'md', className, onKeyDown, ...rest },
    ref,
) {
    const inner = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inner.current as HTMLInputElement);

    useEffect(() => {
        if (!slashShortcut) return;
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
            e.preventDefault();
            inner.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [slashShortcut]);

    return (
        <div className={cn('relative w-full md:w-60', className)}>
            <Search aria-hidden size={16} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
            <input
                ref={inner}
                type="search"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onValueChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && value) {
                        e.preventDefault();
                        onValueChange('');
                    }
                    onKeyDown?.(e);
                }}
                className={cn(
                    'tc-control w-full rounded-full border border-border bg-surface pr-8 pl-9 text-fg placeholder:text-fg-faint',
                    'transition-[border-color,box-shadow] duration-120 hover:border-border-strong',
                    'focus:border-focus focus:ring-2 focus:ring-focus/25 focus:outline-none',
                    '[&::-webkit-search-cancel-button]:hidden',
                    size === 'md' ? 'h-9 text-body' : 'h-8 text-body-sm',
                )}
                {...rest}
            />
            {value ? (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => { onValueChange(''); inner.current?.focus(); }}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-fg-muted transition-colors duration-120 hover:bg-subtle hover:text-fg"
                >
                    <X aria-hidden size={14} />
                </button>
            ) : slashShortcut ? (
                <Kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 md:inline-flex">/</Kbd>
            ) : null}
        </div>
    );
});

/** Debounce a value (default 120ms, DESIGN 3.10) for client-side filtering. */
export function useDebouncedValue<T>(value: T, ms = 120): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = window.setTimeout(() => setV(value), ms);
        return () => window.clearTimeout(t);
    }, [value, ms]);
    return v;
}
