'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { KeyRound } from 'lucide-react';

import { Button, EmptyState, GoogleMark } from '@/components/ui';
import { GOOGLE_CONSENT_COOKIE, GOOGLE_CONSENT_COOKIE_MAX_AGE, GOOGLE_CONSENT_PROMPT, safeCallbackPath } from '@/lib/googleConsent';

const DESCRIPTIONS: Record<string, string> = {
    scope_upgrade: 'Google did not give us read access to Analytics and Search Console. Allow it on the next screen to see your sites.',
    revoked: 'Your saved Google access has expired or was removed. Allow access again on the next screen to keep your sites loading.',
    first_connect: 'One more step: allow read-only access to Analytics and Search Console on the next screen so we can load your sites.',
};

export function ConnectGoogleConsent({ callbackUrl, reason, auto }: { callbackUrl: string; reason: string; auto: boolean }) {
    const started = useRef(false);
    const [busy, setBusy] = useState(false);

    const start = () => {
        setBusy(true);
        // Marks this as the consent attempt: if Google still returns no refresh token, the
        // server finishes sign-in (Reconnect state) instead of sending the browser here again.
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${GOOGLE_CONSENT_COOKIE}=1; Max-Age=${GOOGLE_CONSENT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
        const target = safeCallbackPath(callbackUrl, window.location.origin);
        void signIn('google', { callbackUrl: target }, { prompt: GOOGLE_CONSENT_PROMPT }).catch(() => setBusy(false));
    };

    useEffect(() => {
        if (!auto || started.current) return;
        started.current = true;
        start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auto]);

    return (
        <div className="mx-auto flex max-w-[560px] flex-col items-center px-4 py-16 md:py-24">
            <EmptyState
                variant="page"
                icon={KeyRound}
                title={auto ? 'Taking you to Google' : 'Connect Google'}
                description={DESCRIPTIONS[reason] ?? DESCRIPTIONS.first_connect}
                actions={
                    <>
                        <Button variant="google" size="lg" onClick={start} disabled={busy}>
                            <GoogleMark size={18} /> Continue with Google
                        </Button>
                        <Button asChild variant="ghost">
                            <Link href="/">Back to the home page</Link>
                        </Button>
                    </>
                }
            />
        </div>
    );
}
