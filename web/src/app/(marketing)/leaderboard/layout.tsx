import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Verified Traffic Leaderboard - TrafficClaw',
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
