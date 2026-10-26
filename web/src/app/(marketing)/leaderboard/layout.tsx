import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Verified traffic leaderboard | ${BRAND_NAME}`,
    description: 'Real Google Analytics and Search Console numbers from sites whose owners are verified, checked daily.',
};

/**
 * The public leaderboard and profiles are always light (DESIGN 2.1); the marketing
 * layout around this one already sets data-theme="light" and `.tc-root`.
 */
export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
    return <div className="min-h-[60vh] bg-canvas text-fg">{children}</div>;
}
