import { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Verified Traffic Leaderboard - ${BRAND_NAME}`,
    description: 'See verified GA4 traffic numbers for top startups.',
    robots: {
        index: false,
        follow: true,
    },
};

export default function LeaderboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
