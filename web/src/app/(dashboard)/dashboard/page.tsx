import { Suspense } from 'react';

import { PortfolioPage } from '@/components/portfolio/PortfolioPage';

export const metadata = { title: 'Portfolio' };

/** App home: every GA4 property and Search Console site on one screen. */
export default function DashboardHome() {
    return (
        <Suspense fallback={null}>
            <PortfolioPage />
        </Suspense>
    );
}
