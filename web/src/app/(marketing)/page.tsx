import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { Button } from '@/components/ui';
import { buildMarketingDemoPortfolio, buildMarketingDemoSiteDashboard } from '@/components/marketing/demo/data';
import { DashboardPreview } from '@/components/marketing/home/DashboardPreview';
import { HOME_FAQ } from '@/components/marketing/home/content';
import { HomeHero, HowItWorks, Pillars, WhyFree } from '@/components/marketing/home/HomeSections';
import { LeaderboardPreview } from '@/components/marketing/home/LeaderboardPreview';
import { McpSection } from '@/components/marketing/home/McpSection';
import { PortfolioPreview } from '@/components/marketing/home/PortfolioPreview';
import { Faq } from '@/components/marketing/site/Faq';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { Section, SectionHeading } from '@/components/marketing/site/Section';
import { SignInNotice } from '@/components/marketing/site/SignInNotice';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';
import { PAID_PLANS } from '@/lib/plans';

// The hero and the dashboard visual are rendered from the demo generator (sample data, no Google).
export const revalidate = 3600;

const TITLE = `${BRAND_NAME}: All your sites. One screen. Free.`;
const DESCRIPTION =
    'Every Google Analytics 4 property and Search Console site you own on one free screen. Build dashboards you can share, show verified traffic on a public leaderboard, and ask ChatGPT or Claude about your numbers.';

export const metadata: Metadata = {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: '/' },
    openGraph: { title: TITLE, description: DESCRIPTION, url: '/' },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const appSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: BRAND_NAME,
    url: SITE_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
        ...PAID_PLANS.map((p) => ({ '@type': 'Offer', name: p.name, price: String(p.priceUsd), priceCurrency: 'USD', description: `${p.credits} Ask messages a month` })),
    ],
};

export default function HomePage() {
    const portfolio = buildMarketingDemoPortfolio('28d');
    const dashboard = buildMarketingDemoSiteDashboard('acme', '28d');

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
            <SignInNotice />

            <section aria-label="Introduction" className="bg-canvas">
                <HomeHero />
                <div className="mx-auto mt-12 max-w-[1200px] px-4 pb-16 md:mt-16 md:px-6 md:pb-24">
                    <PortfolioPreview portfolio={portfolio} />
                </div>
            </section>

            <Pillars />

            {dashboard ? (
                <Section id="dashboards" tone="surface" labelledBy="dash-title">
                    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                        <div>
                            <SectionHeading
                                id="dash-title"
                                eyebrow="Dashboards"
                                title="Dashboards that are easy to build and share"
                                description="Start from a template or a blank grid. Each widget can use any of your sites, and every dashboard can become a public link or an embed for a client page."
                            />
                            <ul className="mt-6 space-y-3 text-body-lg text-fg-secondary">
                                {[
                                    'Scorecards, time series, tables, maps and more, with period comparison.',
                                    'One date range and filters for the whole dashboard.',
                                    'Read-only public links, embeds and optional passwords.',
                                ].map((t) => (
                                    <li key={t} className="flex gap-3">
                                        <Check aria-hidden size={18} strokeWidth={2} className="mt-1 shrink-0 text-brand-text" />
                                        <span>{t}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-8">
                                <Button asChild variant="secondary" size="lg" trailingIcon={ArrowRight}>
                                    <Link href={`/demo/${dashboard.site.slug}`}>Open a sample dashboard</Link>
                                </Button>
                            </div>
                        </div>
                        <DashboardPreview dashboard={dashboard} />
                    </div>
                </Section>
            ) : null}

            <LeaderboardPreview />

            <McpSection portfolio={portfolio} />

            <HowItWorks />

            <WhyFree />

            <Section id="faq" tone="surface" labelledBy="faq-title">
                <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
                    <SectionHeading
                        id="faq-title"
                        eyebrow="FAQ"
                        title="Questions, answered"
                        description={<>Something else? <Link href="/contact" className="text-brand-text underline underline-offset-4 hover:text-fg">Send us a message</Link>.</>}
                    />
                    <Faq items={HOME_FAQ} />
                </div>
            </Section>

            <FinalCta />
        </>
    );
}
