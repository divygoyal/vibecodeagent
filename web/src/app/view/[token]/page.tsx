/**
 * Public dashboard (share link and embed). v1 shares render through the v2 viewer.
 * /view/<token>[?embed=1|true][&theme=light|dark][&page=][&range=][&compare=][&f.<id>=]
 * Embeds should use /embed/d/<token> (iframe-safe headers already exist for /embed/*).
 * A token that does not exist answers 404 with the "no longer shared" card (not-found.tsx).
 */
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BRAND_NAME } from '@/lib/brand';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import { shareGone } from '@/lib/builder/server/shareGone';
import { PublicDashboard } from './PublicDashboard';

export const dynamic = 'force-dynamic';

/** Link previews (X, LinkedIn, Slack): the dashboard's name, and the share card from ./opengraph-image. Never indexed (layout). */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
    const { token } = await params;
    let name = 'Shared dashboard';
    let description = `A shared analytics dashboard, made with ${BRAND_NAME}.`;
    if (isShareToken(token)) {
        try {
            const row = await getPublicRow(token, false);
            if (row) {
                const rec = toRecord(row);
                name = rec.doc.name || name;
                if (!rec.share.hasPassword && rec.doc.description) description = rec.doc.description;
            }
        } catch {
            // admin unreachable: generic text
        }
    }
    return {
        title: name,
        description,
        openGraph: { title: name, description, siteName: BRAND_NAME, type: 'website' },
        twitter: { card: 'summary_large_image', title: name, description },
    };
}

export default async function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (await shareGone(token)) notFound();
    return (
        <Suspense fallback={null}>
            <PublicDashboard token={token} />
        </Suspense>
    );
}
