'use client';

import { signIn, useSession } from 'next-auth/react';

/** The public live demo (lib/publicDemo): is this the shared demo session, and does the visitor also have a real one? */
export function useDemoSession(): { demo: boolean; realSession: boolean } {
    const { data } = useSession();
    const demo = Boolean((data?.user as { demo?: boolean } | undefined)?.demo);
    const realSession = demo && Boolean((data as { demoRealSession?: boolean } | null)?.demoRealSession);
    return { demo, realSession };
}

/** Leave the demo (the visitor's own session, if any, was never touched). A full navigation: clears all demo state. */
export const DEMO_EXIT_HREF = '/demo/exit';

/** Start a real Google sign-in from inside the demo; middleware ends the demo on the sign-in request. */
export function connectGoogleFromDemo(): void {
    // The app's normal sign-in (lib/auth.ts asks for consent only when it is needed).
    void signIn('google', { callbackUrl: '/dashboard' });
}
