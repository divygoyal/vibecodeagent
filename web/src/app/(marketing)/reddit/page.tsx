import type { Metadata } from 'next';

import PublicMentionsPage from '@/components/marketing/PublicMentionsPage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Reddit Mention Embeds | ${BRAND_NAME}`,
    description:
        `Preview live Reddit mentions for any website, then turn them into a premium discussion embed with ${BRAND_NAME}.`,
};

export default function RedditPublicPage() {
    return <PublicMentionsPage platform="reddit" />;
}
