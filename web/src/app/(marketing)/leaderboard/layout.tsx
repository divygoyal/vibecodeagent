import type { Metadata } from 'next';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Verified traffic leaderboard | ${BRAND_NAME}`,
    description: 'Real Google Analytics and Search Console numbers from sites whose owners are verified, checked daily.',
};

/**
 * The public leaderboard and profiles are always light (DESIGN 2.1): the wrapper sets
 * data-theme="light" so the token blocks resolve to the light values whatever the
 * visitor's app theme is. `pt-[72px]` clears the fixed marketing navbar.
 */
export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div data-theme="light" className="tc-root min-h-screen bg-canvas text-fg">
            {/* TEMP: the marketing navbar is still the dark legacy one. This strip gives its
                transparent bar a dark backdrop; delete it when the marketing layout is light. */}
            <div aria-hidden className="h-[72px] bg-[#04070d]" />
            {children}
        </div>
    );
}
