import type { Metadata } from 'next';

import RedditWebsiteEmbed from '@/components/social/RedditWebsiteEmbed';
import { BRAND_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: `${BRAND_NAME} Reddit Embed`,
    description: `Reddit mentions embed powered by ${BRAND_NAME}`,
    robots: {
        index: false,
        follow: false,
    },
};

export default async function RedditEmbedPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ preview?: string }>;
}) {
    const { token } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const mode = resolvedSearchParams?.preview === '1' ? 'preview' : 'embed';

    return <RedditWebsiteEmbed token={token} mode={mode} />;
}
