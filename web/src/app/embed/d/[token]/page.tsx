'use client';

/**
 * Embeddable dashboard: /embed/d/<token>?theme=light|dark[&page=&range=&compare=].
 * Same viewer as /view/<token>?embed=1, served under /embed/* which next.config already allows
 * in iframes (frame-ancestors *). Posts { type: 'tc:dimensions', height } to the parent.
 */
import { Suspense, use } from 'react';
import { PublicDashboard } from '@/app/view/[token]/PublicDashboard';

export default function EmbedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} forceEmbed />
        </Suspense>
    );
}
