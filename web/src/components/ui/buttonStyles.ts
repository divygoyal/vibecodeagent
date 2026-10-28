/**
 * Button looks, without React: safe to import from server components (Button.tsx is a client module, so calling
 * buttonClasses() through it from the server throws). Button.tsx re-exports all of this.
 */
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'link' | 'google';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<ButtonVariant, string> = {
    primary: 'bg-brand text-brand-fg hover:bg-brand-hover',
    secondary: 'bg-surface border border-border text-fg shadow-xs hover:bg-subtle hover:border-border-strong',
    ghost: 'text-fg-secondary hover:bg-subtle hover:text-fg',
    subtle: 'bg-subtle text-fg hover:bg-subtle-strong',
    danger: 'bg-down text-white hover:brightness-[0.92]',
    link: 'relative text-fg-secondary underline-offset-4 hover:text-fg hover:underline px-0! h-auto! shadow-none pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3',
    google: 'bg-white border border-[#dadce0] text-[#1f1f1f] shadow-xs hover:bg-[#f8f9fa]',
};

const SIZE: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 gap-1.5 text-body-sm font-medium rounded-control',
    md: 'h-9 px-3.5 gap-2 text-body font-medium rounded-control',
    lg: 'h-11 px-5 gap-2 text-[15px] leading-5 font-medium rounded-control',
    xl: 'h-12 px-6 gap-2 text-body-lg font-medium rounded-full',
};

const ICON_ONLY: Record<ButtonSize, string> = {
    sm: 'size-8 rounded-control pointer-coarse:size-11',
    md: 'size-9 rounded-control pointer-coarse:size-11',
    lg: 'size-11 rounded-control',
    xl: 'size-12 rounded-full',
};

export const BUTTON_ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18, xl: 18 };

export interface ButtonStyleOptions {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Square icon button (needs aria-label). */
    iconOnly?: boolean;
    className?: string;
}

/** Classes for anything that should look like a Button (e.g. a next/link). */
export function buttonClasses({ variant = 'secondary', size = 'md', iconOnly = false, className }: ButtonStyleOptions = {}): string {
    return cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,filter] duration-120 ease-standard',
        'active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        variant !== 'link' && 'tap-area', // touch: 44px hit area (link has its own)
        VARIANT[variant],
        iconOnly ? cn(ICON_ONLY[size], variant === 'link' ? '' : 'p-0') : SIZE[size],
        className,
    );
}
