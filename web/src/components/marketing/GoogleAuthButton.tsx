'use client';

import { useState, type MouseEventHandler, type ReactNode } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface GoogleAuthButtonProps {
    children: ReactNode;
    className: string;
    callbackUrl?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    /** Label rendered when the user is already signed in. Defaults to "Dashboard". */
    signedInLabel?: string;
}

export default function GoogleAuthButton({
    children,
    className,
    callbackUrl = '/dashboard/ai-chat',
    onClick,
    signedInLabel = 'Dashboard',
}: GoogleAuthButtonProps) {
    const { status } = useSession();
    const [loading, setLoading] = useState(false);

    // Already signed in → swap the Google sign-in CTA for a direct link to the dashboard.
    // Same className and arrow chevron so the CTA's visual weight is preserved.
    if (status === 'authenticated') {
        return (
            <Link href={callbackUrl} className={className}>
                {signedInLabel}
                <ArrowRight className="h-4 w-4" />
            </Link>
        );
    }

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
