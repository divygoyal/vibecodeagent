'use client';

import { ErrorScreen } from '@/components/app/ErrorScreen';

/** Site pages (Overview, Traffic, Search, Pages, Actions): keeps the site header and tabs around the error. */
export default function SiteError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <ErrorScreen
            error={error}
            scope="site"
            homeHref="/dashboard"
            homeLabel="Go to Portfolio"
            description="This site page hit an unexpected error. Reload to try again, or open another site from your portfolio."
        />
    );
}
