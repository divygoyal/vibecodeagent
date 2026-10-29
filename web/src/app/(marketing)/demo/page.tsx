import type { Metadata } from 'next';

import { buildMarketingDemoPortfolio } from '@/components/marketing/demo/data';
import { DemoBanner } from '@/components/marketing/demo/DemoBanner';
import { DemoPortfolioView } from '@/components/marketing/demo/DemoPortfolioView';
import { DEMO_RANGES, type DemoPortfolio, type DemoRange } from '@/components/marketing/demo/types';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { BRAND_NAME } from '@/lib/brand';

// Sample data changes once a day; regenerate hourly. Built from lib/demo, never from Google.
export const revalidate = 3600;

const TITLE = 'Live demo: 11 sample sites, no sign-in';
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
        <>
            <div className="mx-auto max-w-[1200px] space-y-6 px-4 pt-6 md:px-6 md:pt-8">
                <DemoBanner sites={portfolios['28d'].totals.sites.total} />
                <DemoPortfolioView portfolios={portfolios} />
            </div>
            <FinalCta
                title="See your own sites like this."
                description={<>Connect Google once and every site you own lands here, with what changed and what to fix next. <span className="whitespace-nowrap">Read-only</span>, nothing to install, no card.</>}
                secondary={{ href: '/security', label: 'What we read and store' }}
            />
        </>
    );
}
