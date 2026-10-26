'use client';

/**
 * App-wide notice for a signed-in user with no Google connection at all (for
 * example an older GitHub sign-in). Nothing else has to be "completed" in the
 * new app, so in every other case this renders nothing.
 */
import { signIn } from 'next-auth/react';
import { usePathname } from 'next/navigation';

import { Banner, Button, GoogleMark } from '@/components/ui';
import { useWorkspace } from '@/components/shell/workspaceContext';
import { useConnections } from '@/lib/useDashboardData';

export default function WorkspaceIncompleteBanner({ className }: { className?: string }) {
    const pathname = usePathname() ?? '';
    const { isDemoWorkspace } = useWorkspace();
    const { hasGoogleConnection, isLoading } = useConnections();

    // The portfolio home has its own "Connect Google" state.
    if (pathname === '/dashboard' || isLoading || isDemoWorkspace || hasGoogleConnection) return null;

    const connect = () => void signIn('google', { callbackUrl: pathname || '/dashboard' }, { prompt: 'select_account consent' });
    return (
        <Banner
            variant="info"
            title="Connect Google to see your sites"
            actions={<Button variant="google" size="sm" onClick={connect}><GoogleMark />Connect Google</Button>}
            className={className}
        >
            Read-only access to Analytics and Search Console. Every site you can see in Google shows up here.
        </Banner>
    );
}
