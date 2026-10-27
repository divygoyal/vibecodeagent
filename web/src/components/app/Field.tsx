'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

/** Classes shared by text inputs and textareas (DESIGN 3.9 control look). */
export const inputClasses =
    'tc-control w-full rounded-control border border-border bg-surface px-3 text-body text-fg placeholder:text-fg-faint ' +
    'transition-colors duration-120 hover:border-border-strong focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50 ' +
    'aria-[invalid=true]:border-down';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputClasses, 'h-9', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(inputClasses, 'resize-y py-2 leading-5', className)} {...rest} />;
});

export interface FieldProps {
    label: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    /** Render-prop so the control gets the generated id and aria wiring. */
    children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
    className?: string;
}

/** Visible label above the control, optional help text and an error line below (DESIGN 7.3 forms). */
export function Field({ label, description, error, required, children, className }: FieldProps) {
    const id = useId();
    const descId = description || error ? `${id}-desc` : undefined;
    return (
        <div className={cn('space-y-1.5', className)}>
            <label htmlFor={id} className="block text-body font-medium text-fg">
                {label}
                {required ? <span aria-hidden className="ml-0.5 text-down">*</span> : null}
            </label>
            {children({ id, 'aria-describedby': descId, 'aria-invalid': error ? true : undefined })}
            {error ? (
                <p id={descId} className="flex items-center gap-1.5 text-body-sm text-down">
                    <AlertCircle aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
                    {error}
                </p>
            ) : description ? (
                <p id={descId} className="text-body-sm text-fg-muted">{description}</p>
            ) : null}
        </div>
    );
}
