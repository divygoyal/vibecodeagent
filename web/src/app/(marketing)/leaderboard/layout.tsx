import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Verified traffic leaderboard',
    description: 'Visitors from Google Analytics and clicks from Search Console, for sites whose owners are verified in Google Search Console, checked daily.',
};

/**
 * The public leaderboard and profiles are always light (DESIGN 2.1); the marketing
 * layout around this one already sets data-theme="light" and `.tc-root`.
 */
export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
    return <div className="min-h-[60vh] bg-canvas text-fg">{children}</div>;
}
