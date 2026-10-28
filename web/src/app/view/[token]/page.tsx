/**
 * Public dashboard (share link and embed). v1 shares render through the v2 viewer.
 * /view/<token>[?embed=1|true][&theme=light|dark][&page=][&range=][&compare=][&f.<id>=]
 * Embeds should use /embed/d/<token> (iframe-safe headers already exist for /embed/*).
 * A token that does not exist answers 404 with the "no longer shared" card (not-found.tsx).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { shareGone } from '@/lib/builder/server/shareGone';
import { PublicDashboard } from './PublicDashboard';

export const dynamic = 'force-dynamic';

export default async function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (await shareGone(token)) notFound();
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} />
        </Suspense>
    );
}
