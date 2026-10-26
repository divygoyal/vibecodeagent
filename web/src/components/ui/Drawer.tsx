'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';

import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useHideChatWidget } from './useHideChatWidget';
import { useReturnFocus } from './useReturnFocus';

export interface DrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: ReactNode;
    subtitle?: ReactNode;
    children?: ReactNode;
    /** Sticky footer. */
    footer?: ReactNode;
    /** 480 (default) or 640. Full screen below 768px. */
    width?: 'default' | 'wide';
    /** right (default) for details; left for the mobile navigation drawer. */
    side?: 'right' | 'left';
    trigger?: ReactNode;
    /** Hide the header (e.g. the nav drawer renders its own). Title is still announced. */
    bare?: boolean;
    className?: string;
}

/** Side panel for row details, "View all" lists and the Ask panel (DESIGN 3.17). */
export function Drawer({ open, onOpenChange, title, subtitle, children, footer, width = 'default', side = 'right', trigger, bare, className }: DrawerProps) {
    useHideChatWidget(open);
    const returnFocus = useReturnFocus();
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-60 bg-overlay animate-fade-in" />
                <Dialog.Content
                    {...returnFocus}
                    aria-describedby={undefined}
                    className={cn(
                        'tc-ui fixed inset-y-0 z-60 flex w-full flex-col bg-surface-raised text-body text-fg shadow-modal outline-none',
                        side === 'right' ? 'right-0 animate-drawer-in md:rounded-l-modal' : 'left-0 animate-drawer-in-left md:rounded-r-modal',
                        width === 'wide' ? 'md:max-w-[640px]' : 'md:max-w-[480px]',
                        className,
                    )}
                >
                    {bare ? (
                        <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    ) : (
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-subtle bg-surface-raised p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
                            <div className="min-w-0">
                                <Dialog.Title className="truncate text-title text-fg">{title}</Dialog.Title>
                                {subtitle ? <p className="mt-0.5 text-body-sm text-fg-muted">{subtitle}</p> : null}
                            </div>
                            <Dialog.Close asChild>
                                <Button variant="ghost" iconOnly icon={X} aria-label="Close" className="-mt-1 -mr-1 size-8" />
                            </Dialog.Close>
                        </div>
                    )}
                    <div className={cn('min-h-0 flex-1 overflow-y-auto', bare ? '' : 'p-5')}>{children}</div>
                    {footer ? <div className="border-t border-border-subtle p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
