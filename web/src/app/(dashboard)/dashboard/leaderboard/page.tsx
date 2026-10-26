import type { Metadata } from 'next';

import MyLeaderboard from '@/components/leaderboard/app/MyLeaderboard';
import { SITE_ORIGIN } from '@/lib/leaderboard/constants';

export const metadata: Metadata = { title: 'Leaderboard' };

/**
 * My public profiles (DESIGN 5.12): join a site, verification and re-check, edit the profile,
 * privacy, "open to" offers and the inbox, ad slots, badge and widget.
 */
export default function MyLeaderboardPage() {
    // SITE_ORIGIN is read on the server (NEXTAUTH_URL) and passed down: client bundles cannot see it.
    return <MyLeaderboard origin={SITE_ORIGIN} />;
}
