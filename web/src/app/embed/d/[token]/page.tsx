/**
 * Embeddable dashboard: /embed/d/<token>?theme=light|dark[&page=&range=&compare=].
 * Same viewer as /view/<token>?embed=1, served under /embed/* which next.config already allows
 * in iframes (frame-ancestors *). Posts { type: 'tc:dimensions', height } to the parent.
 * A token that does not exist answers 404 with the "no longer shared" card (not-found.tsx).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { shareGone } from '@/lib/builder/server/shareGone';
import { PublicDashboard } from '@/app/view/[token]/PublicDashboard';

export const dynamic = 'force-dynamic';

export default async function EmbedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (await shareGone(token)) notFound();
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} forceEmbed />
        </Suspense>
    );
}
