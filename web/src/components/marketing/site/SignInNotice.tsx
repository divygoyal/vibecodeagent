'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { Banner } from '@/components/ui';

const MESSAGES: Record<string, string> = {
    AccessDenied: 'Google sign-in was cancelled or access was not granted. Try again and allow read-only access to Analytics and Search Console.',
    OAuthAccountNotLinked: 'This email is already linked to another sign-in method. Sign in the way you did before.',
    SessionRequired: 'Please sign in to continue.',
};

function Notice() {
    const params = useSearchParams();
    const error = params.get('error');
    const needsSignIn = !error && params.get('callbackUrl');
    if (!error && !needsSignIn) return null;
    return (
        <div className="mx-auto max-w-[880px] px-4 pt-6 md:px-6">
            {error ? (
                <Banner variant="danger" title="Sign-in did not finish">
                    {MESSAGES[error] ?? 'Something went wrong while signing in with Google. Please try again.'}
                </Banner>
            ) : (
                <Banner variant="info" title="Sign in to continue">
                    Connect Google to open that page. You will come straight back after signing in.
                </Banner>
            )}
        </div>
    );
}

/**
 * The home page doubles as NextAuth's sign-in and error page (lib/auth.ts
 * `pages`): explain `?error=` and `?callbackUrl=` instead of ignoring them.
 */
export function SignInNotice() {
    return (
        <Suspense fallback={null}>
            <Notice />
        </Suspense>
    );
}
