import type { Metadata } from 'next';

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/** Chrome-less shell for the iframe widget. Theme comes from ?theme=light|dark (default light). */
export default function LeaderboardEmbedLayout({ children }: { children: React.ReactNode }) {
    return children;
}
