'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { ArrowRight } from 'lucide-react';

import { Button, GoogleMark, type ButtonSize } from '@/components/ui';
import { cn } from '@/lib/cn';
import { safeCallbackUrl, SIGN_IN_CALLBACK } from './nav';

export interface ConnectGoogleButtonProps {
    label?: string;
    /** Label when already signed in (the button becomes a link). */
    signedInLabel?: string;
    signedInHref?: string;
    /** Where Google sign-in returns to. A `?callbackUrl=` on the current page wins (sign-in page is `/`). */
    callbackUrl?: string;
    size?: ButtonSize;
    variant?: 'primary' | 'secondary' | 'google';
    /** Show the Google "G" (on a white disc for the primary variant). */
    mark?: boolean;
    className?: string;
    onNavigate?: () => void;
}

/** Turns `?callbackUrl=` (relative, or absolute on this origin) into a safe relative path. */
function callbackFromLocation(fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const raw = new URLSearchParams(window.location.search).get('callbackUrl');
    if (!raw) return fallback;
    const origin = window.location.origin;
    const relative = raw.startsWith(origin) ? raw.slice(origin.length) || '/' : raw;
    return safeCallbackUrl(relative, fallback);
}

/**
 * The one sign-up action on the public site: Google sign-in with the read-only
 * Analytics + Search Console scopes (configured in lib/auth.ts). Signed-in
 * visitors get a link to the app instead.
 */
export function ConnectGoogleButton({
    label = 'Connect Google — it\'s free',
    signedInLabel = 'Open dashboard',
    signedInHref = SIGN_IN_CALLBACK,
    callbackUrl = SIGN_IN_CALLBACK,
    size = 'md',
    variant = 'primary',
    mark = false,
    className,
    onNavigate,
}: ConnectGoogleButtonProps) {
    const { status } = useSession();
    const [loading, setLoading] = useState(false);

    if (status === 'authenticated') {
        return (
            <Button asChild variant={variant === 'google' ? 'secondary' : variant} size={size} trailingIcon={ArrowRight} className={className}>
                <Link href={signedInHref} onClick={onNavigate}>{signedInLabel}</Link>
            </Button>
        );
    }

    const start = () => {
        if (loading) return;
        setLoading(true);
        onNavigate?.();
        void signIn('google', { callbackUrl: callbackFromLocation(callbackUrl) }, { prompt: 'select_account consent' })
            .catch(() => setLoading(false));
    };

    const gSize = size === 'xl' || size === 'lg' ? 18 : 16;
    return (
        <Button variant={variant} size={size} loading={loading} onClick={start} className={className} aria-label={loading ? 'Signing in with Google' : undefined}>
            {mark && !loading ? (
                variant === 'primary' ? (
                    <span aria-hidden className={cn('-ml-1 inline-flex items-center justify-center rounded-full bg-white', size === 'xl' ? 'size-7' : 'size-6')}>
                        <GoogleMark size={gSize - 2} />
                    </span>
                ) : (
                    <GoogleMark size={gSize} />
                )
            ) : null}
            {loading ? 'Opening Google…' : label}
        </Button>
    );
}
