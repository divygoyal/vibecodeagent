import type { Metadata } from 'next';

import PublicMentionsPage from '@/components/marketing/PublicMentionsPage';

export const metadata: Metadata = {
    title: 'X Mention Embeds | TrafficClaw',
    description:
        'Preview live X mentions for any website, then turn them into a premium embed with TrafficClaw.',
};

export default function XPublicPage() {
    return <PublicMentionsPage platform="x" />;
}
