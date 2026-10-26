import { Metadata } from 'next';
import { getShareData } from '@/app/api/share/route';
import SharedEventsReportClient from '@/components/share-overview/openpanel/SharedEventsReportClient';
import { ShareNotFound } from '@/components/share/ShareChrome';
import { BRAND_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: `Shared events report — ${BRAND_NAME}`,
    description: `View a shared events report powered by ${BRAND_NAME}`,
};

export default async function SharedEventsReportPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const share = await getShareData(token, { incrementView: false });

    if (!share) {
        return <ShareNotFound what="events report" />;
    }

    return (
        <SharedEventsReportClient
            token={token}
            siteUrl={share.siteUrl}
        />
    );
}
