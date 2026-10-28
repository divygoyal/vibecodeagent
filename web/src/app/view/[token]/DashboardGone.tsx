'use client';

/**
 * "This dashboard is no longer shared" for a link that does not exist or was turned off: the not-found page of
 * /view/<token> and /embed/d/<token> (they answer 404, round 7 audit #19). Same frame as PublicDashboard's own
 * message, in the theme the link asks for (?theme=light|dark).
 */
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { EmptyState } from '@/components/ui';

export function DashboardGone({ embed }: { embed?: boolean }) {
    const sp = useSearchParams();
    const param = sp.get('theme');
    const theme = param === 'dark' ? 'dark' : 'light';
    useEffect(() => {
        const el = document.documentElement;
        el.setAttribute('data-theme', theme);
        el.style.colorScheme = theme;
    }, [theme]);
    return (
        <div data-theme={theme} className="tc-root min-h-dvh bg-canvas text-fg">
            <div className={embed ? 'p-3 sm:p-4' : 'mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8'}>
                <EmptyState variant="page" title="This dashboard is no longer shared" description="Ask the owner for a new link." />
            </div>
        </div>
    );
}
