import type { Metadata } from 'next';

import PublicMentionsPage from '@/components/marketing/PublicMentionsPage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `X Mention Embeds | ${BRAND_NAME}`,
    description:
        `Preview live X mentions for any website, then turn them into a premium embed with ${BRAND_NAME}.`,
};

export default function XPublicPage() {
    return <PublicMentionsPage platform="x" />;
}
