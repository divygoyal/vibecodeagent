import type { Metadata } from 'next';

import { ConnectGoogleConsent } from './ConnectGoogleConsent';

export const metadata: Metadata = {
    title: 'Connect Google',
    robots: { index: false, follow: false },
};

/**
 * Where the NextAuth signIn callback sends a Google sign-in that brought no refresh token while
 * none usable is stored (lib/googleConsent.ts). With ?auto=1 it starts one consent sign-in.
 */
export default async function ConnectGooglePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams;
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
    return <ConnectGoogleConsent callbackUrl={one(sp.callbackUrl)} reason={one(sp.reason)} auto={one(sp.auto) === '1'} />;
}
