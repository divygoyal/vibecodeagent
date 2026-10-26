import type { Metadata } from 'next';

import { buildMarketingDemoPortfolio } from '@/components/marketing/demo/data';
import { DemoBanner } from '@/components/marketing/demo/DemoBanner';
import { DemoPortfolioView } from '@/components/marketing/demo/DemoPortfolioView';
import { DEMO_RANGES, type DemoPortfolio, type DemoRange } from '@/components/marketing/demo/types';
import { BRAND_NAME } from '@/lib/brand';

// Sample data changes once a day; regenerate hourly. Built from lib/demo, never from Google.
export const revalidate = 3600;

const TITLE = 'Live demo: a portfolio of sample sites';
const DESCRIPTION = `Try ${BRAND_NAME} without signing in: a read-only portfolio of 11 sample sites with Search Console and Google Analytics numbers, deltas, sparklines and a sample dashboard for each site.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/demo' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/demo' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function DemoPage() {
    const portfolios = Object.fromEntries(
        DEMO_RANGES.map((r) => [r.value, buildMarketingDemoPortfolio(r.value)]),
    ) as Record<DemoRange, DemoPortfolio>;

    return (
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 pt-6 pb-16 md:px-6 md:pt-8 md:pb-24">
            <DemoBanner />
            <DemoPortfolioView portfolios={portfolios} />
        </div>
    );
}
