import type { Metadata } from 'next';

import XWebsiteEmbed from '@/components/social/XWebsiteEmbed';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'TrafficClaw X Embed',
    description: 'Official X mentions embed powered by TrafficClaw',
    robots: {
        index: false,
        follow: false,
    },
};

export default async function XEmbedPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ preview?: string }>;
}) {
    const { token } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const mode = resolvedSearchParams?.preview === '1' ? 'preview' : 'embed';

    return <XWebsiteEmbed token={token} mode={mode} />;
}
