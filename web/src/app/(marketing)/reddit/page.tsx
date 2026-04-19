import type { Metadata } from 'next';

import PublicMentionsPage from '@/components/marketing/PublicMentionsPage';

export const metadata: Metadata = {
    title: 'Reddit Mention Embeds | TrafficClaw',
    description:
        'Preview live Reddit mentions for any website, then turn them into a premium discussion embed with TrafficClaw.',
};

export default function RedditPublicPage() {
    return <PublicMentionsPage platform="reddit" />;
}
