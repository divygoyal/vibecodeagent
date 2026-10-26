import type { Metadata } from 'next';

import MyLeaderboard from '@/components/leaderboard/app/MyLeaderboard';

export const metadata: Metadata = { title: 'Leaderboard' };

/**
 * My public profiles (DESIGN 5.12): join a site, verification and re-check, edit the profile,
 * privacy, "open to" offers and the inbox, ad slots, badge and widget.
 */
export default function MyLeaderboardPage() {
    return <MyLeaderboard />;
}
