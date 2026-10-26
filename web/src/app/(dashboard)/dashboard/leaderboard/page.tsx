'use client';

import AdSlotRequestsInbox from '../settings/AdSlotRequestsInbox';
import LeaderboardOptIn from '../settings/LeaderboardOptIn';

/**
 * My leaderboard profile (DESIGN 5.12). For now: the existing opt-in, ad slots
 * and sponsor requests from Settings. The leaderboard stream rebuilds this page.
 */
export default function MyLeaderboardPage() {
    return (
        <div className="space-y-6">
            <LeaderboardOptIn />
            <AdSlotRequestsInbox />
        </div>
    );
}
