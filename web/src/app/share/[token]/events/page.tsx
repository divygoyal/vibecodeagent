import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { lookupShare } from '@/app/api/share/route';
import SharedEventsReportClient from '@/components/share-overview/openpanel/SharedEventsReportClient';
import { ShareNotFound } from '@/components/share/ShareChrome';
import { BRAND_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared events report',
    description: `View a shared events report powered by ${BRAND_NAME}`,
};

export default async function SharedEventsReportPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const { share, gone } = await lookupShare(token, { incrementView: false });

    if (!share) {
        if (gone) notFound();
        return <ShareNotFound what="events report" temporary />;
    }

    return (
        <SharedEventsReportClient
            token={token}
            siteUrl={share.siteUrl}
        />
    );
}
