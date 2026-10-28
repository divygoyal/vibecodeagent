'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';

import { isIconComponent, type IconProp } from './iconProp';

export { BUTTON_ICON_SIZE, buttonClasses, type ButtonSize, type ButtonStyleOptions, type ButtonVariant } from './buttonStyles';
import { BUTTON_ICON_SIZE, buttonClasses, type ButtonStyleOptions } from './buttonStyles';

export type ButtonIcon = IconProp;

function renderIcon(icon: ButtonIcon | undefined, size: number): ReactNode {
    if (!icon) return null;
    // Elements (and lazy nodes from RSC) render as they are; only components get our props.
    if (!isIconComponent(icon)) return icon;
    const Icon = icon;
    return <Icon aria-hidden size={size} strokeWidth={1.75} />;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonStyleOptions, 'className'> {
    /**
     * Icon before the label (replaced by a spinner while loading). Pass the
     * component from client code, or an element (`<ArrowRight />`) from a
     * Server Component, which cannot pass functions to this client component.
     */
    icon?: ButtonIcon;
    /** Icon after the label, e.g. ArrowRight for "Details →". Same rules as `icon`. */
    trailingIcon?: ButtonIcon;
    loading?: boolean;
    /** Render the single child element (e.g. <Link>) with button styles. */
    asChild?: boolean;
    children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'secondary', size = 'md', iconOnly = false, icon: Icon, trailingIcon: Trailing, loading = false, asChild = false, className, children, disabled, type, ...rest },
    ref,
) {
    const px = BUTTON_ICON_SIZE[size];
    const iconSize = iconOnly && size === 'lg' ? 20 : px;
    const leading = loading
        ? <Loader2 aria-hidden className="animate-spin" size={iconSize} strokeWidth={1.75} />
        : renderIcon(Icon, iconSize);
    const trailing = iconOnly ? null : renderIcon(Trailing, px);
    const classes = buttonClasses({ variant, size, iconOnly, className });

    if (asChild) {
        return (
            <Slot.Root ref={ref} className={classes} aria-disabled={disabled || loading || undefined} {...rest}>
                {leading}
                <Slot.Slottable>{children}</Slot.Slottable>
                {trailing}
            </Slot.Root>
        );
    }

    return (
        <button
            ref={ref}
            type={type ?? 'button'}
            className={classes}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {leading}
            {iconOnly ? null : children}
            {trailing}
        </button>
    );
});

/** The Google "G" mark (brand colours, for the `google` variant only). */
export function GoogleMark({ size = 18 }: { size?: number }) {
    return (
        <svg aria-hidden width={size} height={size} viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    );
}
