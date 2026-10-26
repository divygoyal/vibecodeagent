'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

const CONTROL =
    'tc-control w-full rounded-control border border-border bg-surface px-3 text-fg placeholder:text-fg-faint ' +
    'transition-[border-color,box-shadow] duration-120 hover:border-border-strong ' +
    'focus:border-focus focus:ring-2 focus:ring-focus/25 focus:outline-none disabled:opacity-50';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    size?: 'sm' | 'md';
    /** Geist Mono, for tokens and ids. */
    mono?: boolean;
}

/** Text field with the same border, radius and focus ring as Select and SearchInput. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ size = 'md', mono, className, ...rest }, ref) {
    return (
        <input
            ref={ref}
            className={cn(CONTROL, size === 'md' ? 'h-9 text-body' : 'h-8 text-body-sm', mono && 'font-mono', className)}
            {...rest}
        />
    );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(CONTROL, 'resize-none py-2 text-body leading-5', className)} {...rest} />;
});

export interface FieldProps {
    label: string;
    hint?: ReactNode;
    /** Render-prop so the control gets the id the label points at. */
    children: (id: string) => ReactNode;
    className?: string;
}

/** Visible label above a control (6px gap), optional hint below. */
export function Field({ label, hint, children, className }: FieldProps) {
    const id = useId();
    return (
        <div className={cn('space-y-1.5', className)}>
            <label htmlFor={id} className="block text-body-sm font-medium text-fg-secondary">{label}</label>
            {children(id)}
            {hint ? <p className="text-meta text-fg-muted">{hint}</p> : null}
        </div>
    );
}
