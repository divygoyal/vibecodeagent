import { Metadata } from 'next';
import Link from 'next/link';
import { getShareData } from '@/app/api/share/route';
import SharedEventsReportClient from '@/components/share-overview/openpanel/SharedEventsReportClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared Events Report — TrafficClaw',
    description: 'View a shared events report powered by TrafficClaw',
};

export default async function SharedEventsReportPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const share = await getShareData(token, { incrementView: false });

    if (!share) {
        return (
            <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-semibold text-zinc-100 mb-2">Dashboard Not Found</h1>
                    <p className="text-sm text-zinc-500 mb-6">
                        This shared dashboard doesn&apos;t exist or has been revoked by the owner.
                    </p>
                    <Link
                        href="https://trafficclaw.com"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-all"
                    >
                        Visit TrafficClaw
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <SharedEventsReportClient
            token={token}
            siteUrl={share.siteUrl}
        />
    );
}
