'use client';

import { useState, type MouseEventHandler, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

interface GoogleAuthButtonProps {
    children: ReactNode;
    className: string;
    callbackUrl?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
}

export default function GoogleAuthButton({
    children,
    className,
    callbackUrl = '/dashboard/ai-chat',
    onClick,
}: GoogleAuthButtonProps) {
    const [loading, setLoading] = useState(false);

    const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
        onClick?.(event);

        if (event.defaultPrevented || loading) return;

        setLoading(true);

        // signIn redirects the page; the button will unmount before this resolves.
        // The catch is just defensive — if signIn rejects (popup blocker, network), un-stick the loader.
        void signIn(
            'google',
            { callbackUrl },
            { prompt: 'select_account consent' },
        ).catch(() => {
            setLoading(false);
        });
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            aria-busy={loading}
            className={className}
            data-loading={loading || undefined}
        >
            {loading ? (
                <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                    <span>Signing in…</span>
                </>
            ) : (
                children
            )}
        </button>
    );
}
