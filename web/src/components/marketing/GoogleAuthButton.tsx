'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { signIn } from 'next-auth/react';

interface GoogleAuthButtonProps {
    children: ReactNode;
    className: string;
    callbackUrl?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
}

export default function GoogleAuthButton({
    children,
    className,
    callbackUrl = '/dashboard',
    onClick,
}: GoogleAuthButtonProps) {
    const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
        onClick?.(event);

        if (event.defaultPrevented) return;

        void signIn(
            'google',
            { callbackUrl },
            { prompt: 'select_account consent' },
        );
    };

    return (
        <button type="button" onClick={handleClick} className={className}>
            {children}
        </button>
    );
}
