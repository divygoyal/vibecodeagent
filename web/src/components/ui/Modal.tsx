'use client';

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';

import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useHideChatWidget } from './useHideChatWidget';
import { useReturnFocus } from './useReturnFocus';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const WIDTH: Record<ModalSize, string> = {
    sm: 'md:max-w-[400px]',
    md: 'md:max-w-[560px]',
    lg: 'md:max-w-[720px]',
    xl: 'md:max-w-[960px]',
};

export interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    /** Footer actions, right aligned: secondary then primary. */
    footer?: ReactNode;
    size?: ModalSize;
    /** Optional trigger element (rendered with asChild). */
    trigger?: ReactNode;
    hideClose?: boolean;
    className?: string;
    /** CSS selector of the element that gets focus when the dialog opens (default: Radix focuses the first focusable one). */
    initialFocus?: string;
}

/**
 * Dialog (DESIGN 3.17). Focus trap, Esc, focus return, scroll lock from Radix.
 * Below 768px it is a bottom sheet with a drag handle.
 */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', trigger, hideClose, className, initialFocus }: ModalProps) {
    useHideChatWidget(open);
    const returnFocus = useReturnFocus();
    const content = useRef<HTMLDivElement>(null);
    const openFocus = (e: Event) => {
        returnFocus.onOpenAutoFocus();
        const target = initialFocus ? content.current?.querySelector<HTMLElement>(initialFocus) : null;
        if (target) { e.preventDefault(); target.focus({ preventScroll: true }); }
    };
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-70 bg-overlay animate-fade-in" />
                <Dialog.Content
                    ref={content}
                    {...returnFocus}
                    onOpenAutoFocus={openFocus}
                    aria-describedby={description ? undefined : undefined}
                    className={cn(
                        'tc-ui fixed z-70 flex flex-col bg-surface-raised text-body text-fg shadow-modal outline-none',
                        // mobile: bottom sheet
                        'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl animate-sheet-up pb-[env(safe-area-inset-bottom)]',
                        // desktop: centred
                        'md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:max-h-[85dvh] md:w-[calc(100vw-48px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-modal md:pb-0 md:animate-pop-in',
                        WIDTH[size],
                        className,
                    )}
                >
                    <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-strong md:hidden" />
                    <div className="flex items-start justify-between gap-4 p-5 pb-0">
                        <div className="min-w-0">
                            <Dialog.Title className="text-title text-fg">{title}</Dialog.Title>
                            {description ? <Dialog.Description className="mt-1 text-body text-fg-muted">{description}</Dialog.Description> : null}
                        </div>
                        {hideClose ? null : (
                            <Dialog.Close asChild>
                                <Button variant="ghost" size="md" iconOnly icon={X} aria-label="Close" className="-mt-1 -mr-1 size-8" />
                            </Dialog.Close>
                        )}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
                    {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle p-4">{footer}</div> : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

export interface ConfirmModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** States the action: "Remove acme.com?" */
    title: ReactNode;
    /** States the consequence. */
    description?: ReactNode;
    /** Repeats the verb: "Remove site". */
    confirmLabel: string;
    cancelLabel?: string;
    onConfirm: () => void | Promise<void>;
    danger?: boolean;
    loading?: boolean;
}

/** Confirm dialog for destructive actions (DESIGN 3.17). */
export function ConfirmModal({ open, onOpenChange, title, description, confirmLabel, cancelLabel = 'Cancel', onConfirm, danger = true, loading }: ConfirmModalProps) {
    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            size="sm"
            title={title}
            description={description}
            footer={
                <>
                    <Button variant="secondary" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
                    <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => void onConfirm()}>{confirmLabel}</Button>
                </>
            }
        />
    );
}
