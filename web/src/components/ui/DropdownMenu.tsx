'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import { DropdownMenu as D } from 'radix-ui';

import { cn } from '@/lib/cn';

/**
 * Styled Radix dropdown menu (DESIGN 3.22). Keyboard: arrows, Home/End,
 * type-ahead, Enter/Space, Esc, Right/Left for submenus.
 *
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><Button iconOnly icon={MoreHorizontal} aria-label="More" /></DropdownMenuTrigger>
 *     <DropdownMenuContent align="end">
 *       <DropdownMenuItem icon={Download} onSelect={...}>Download CSV</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 */
export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export const DropdownMenuGroup = D.Group;
export const DropdownMenuSub = D.Sub;
export const DropdownMenuRadioGroup = D.RadioGroup;

const panel = 'z-50 min-w-[200px] overflow-hidden rounded-popover border border-border-subtle bg-surface-raised p-1 text-body text-fg shadow-popover animate-pop-in';
const itemBase =
    'relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-fg data-[disabled]:pointer-events-none data-[disabled]:text-fg-faint';

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.Content>>(function DropdownMenuContent(
    { className, sideOffset = 6, collisionPadding = 8, ...rest },
    ref,
) {
    return (
        <D.Portal>
            <D.Content ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn(panel, className)} {...rest} />
        </D.Portal>
    );
});

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<typeof D.Item> {
    icon?: LucideIcon;
    /** Keyboard hint at the right: "⌘K". */
    shortcut?: string;
    destructive?: boolean;
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
    { icon: Icon, shortcut, destructive, className, children, ...rest },
    ref,
) {
    return (
        <D.Item ref={ref} className={cn(itemBase, destructive && 'text-down data-[highlighted]:text-down', className)} {...rest}>
            {Icon ? <Icon aria-hidden size={16} strokeWidth={1.75} className={destructive ? 'text-down' : 'text-fg-muted'} /> : null}
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {shortcut ? <kbd className="ml-auto font-sans text-meta text-fg-muted">{shortcut}</kbd> : null}
        </D.Item>
    );
});

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.CheckboxItem> & { icon?: LucideIcon }>(
    function DropdownMenuCheckboxItem({ icon: Icon, className, children, ...rest }, ref) {
        return (
            <D.CheckboxItem ref={ref} className={cn(itemBase, 'pr-8', className)} {...rest}>
                {Icon ? <Icon aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" /> : null}
                <span className="min-w-0 flex-1 truncate">{children}</span>
                <D.ItemIndicator className="absolute right-2 inline-flex">
                    <Check aria-hidden size={16} strokeWidth={1.75} />
                </D.ItemIndicator>
            </D.CheckboxItem>
        );
    },
);

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof D.RadioItem> & { icon?: LucideIcon }>(
    function DropdownMenuRadioItem({ icon: Icon, className, children, ...rest }, ref) {
        return (
            <D.RadioItem ref={ref} className={cn(itemBase, 'pr-8', className)} {...rest}>
                {Icon ? <Icon aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" /> : null}
                <span className="min-w-0 flex-1 truncate">{children}</span>
                <D.ItemIndicator className="absolute right-2 inline-flex">
                    <Check aria-hidden size={16} strokeWidth={1.75} />
                </D.ItemIndicator>
            </D.RadioItem>
        );
    },
);

export function DropdownMenuLabel({ className, ...rest }: ComponentPropsWithoutRef<typeof D.Label>) {
    return <D.Label className={cn('px-2 pt-2 pb-1 text-caption tracking-[0.04em] text-fg-muted uppercase', className)} {...rest} />;
}

export function DropdownMenuSeparator({ className, ...rest }: ComponentPropsWithoutRef<typeof D.Separator>) {
    return <D.Separator className={cn('-mx-1 my-1 h-px bg-border-subtle', className)} {...rest} />;
}

export function DropdownMenuSubTrigger({ icon: Icon, className, children, ...rest }: ComponentPropsWithoutRef<typeof D.SubTrigger> & { icon?: LucideIcon; children: ReactNode }) {
    return (
        <D.SubTrigger className={cn(itemBase, 'data-[state=open]:bg-subtle', className)} {...rest}>
            {Icon ? <Icon aria-hidden size={16} strokeWidth={1.75} className="text-fg-muted" /> : null}
            <span className="min-w-0 flex-1 truncate">{children}</span>
            <ChevronRight aria-hidden size={14} className="ml-auto text-fg-muted" />
        </D.SubTrigger>
    );
}

export function DropdownMenuSubContent({ className, ...rest }: ComponentPropsWithoutRef<typeof D.SubContent>) {
    return (
        <D.Portal>
            <D.SubContent sideOffset={6} collisionPadding={8} className={cn(panel, className)} {...rest} />
        </D.Portal>
    );
}
