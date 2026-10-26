'use client';

/**
 * Public dashboard (share link and embed). v1 shares render through the v2 viewer.
 * /view/<token>[?embed=1|true][&theme=light|dark][&page=][&range=][&compare=][&f.<id>=]
 * Embeds should use /embed/d/<token> (iframe-safe headers already exist for /embed/*).
 */
import { Suspense, use } from 'react';
import { PublicDashboard } from './PublicDashboard';

export default function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} />
        </Suspense>
    );
}

