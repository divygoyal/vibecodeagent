'use client';

import { ErrorScreen } from '@/components/app/ErrorScreen';

/** App error boundary: inside the app shell, so the sidebar and tab bar stay usable. */
export default function DashboardError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <ErrorScreen
            error={error}
            scope="app"
            homeHref="/dashboard"
            homeLabel="Go to Portfolio"
            description="This page hit an unexpected error. Reload to try again, or go back to your portfolio."
        />
    );
}
