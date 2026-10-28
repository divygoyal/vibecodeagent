import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { FeatureRows, type FeatureRow } from '@/components/marketing/home/FeatureRows';
import { HOME_FAQ } from '@/components/marketing/home/content';
import { HeroCopy, SECONDARY_CTA } from '@/components/marketing/home/Hero';
import { HeroPortfolio } from '@/components/marketing/home/HeroPortfolio';
import { buildHomeData } from '@/components/marketing/home/homeData';
import { HOME_THEME_SCRIPT } from '@/components/marketing/home/homeTheme';
import { HomeThemeSync } from '@/components/marketing/home/HomeThemeSync';
import { WhyFree } from '@/components/marketing/home/HomeSections';
import { JobStory } from '@/components/marketing/home/JobStory';
import { LeaderboardPreview } from '@/components/marketing/home/LeaderboardPreview';
import { McpSection } from '@/components/marketing/home/McpSection';
import { ConnectGoogleButton } from '@/components/marketing/site/ConnectGoogleButton';
import { Faq } from '@/components/marketing/site/Faq';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { BrowserFrame, Section, SectionHeading } from '@/components/marketing/site/Section';
import { SignInNotice } from '@/components/marketing/site/SignInNotice';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';
import { PAID_PLANS } from '@/lib/plans';

// Every product number on this page comes from the demo generator (sample data, never Google); it changes
// once a UTC day, so the page is rebuilt hourly.
export const revalidate = 3600;

const TITLE = `${BRAND_NAME}: All your sites. One screen. Free.`;
const DESCRIPTION =
    'Every Google Analytics 4 and Search Console site you own on one free screen: what changed, what to fix next, shareable dashboards, a verified leaderboard, and ChatGPT or Claude on your numbers. Read-only, nothing to install.';

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

/** FAQ on the home page: the questions that block a first sign-in. The full list stays in content.tsx. */
const HOME_FAQ_PICK = [0, 1, 2, 3, 5, 7, 8, 9, 11];

export default function HomePage() {
    const { byRange, story, tour, boardSample } = buildHomeData();
    const p28 = byRange['28d'];

    const features: FeatureRow[] = [
        {
            key: 'site',
            label: 'Site page',
            title: 'Every number for one site',
            bullets: ['Users, sessions, pageviews, key events', 'A trend line on every tile', 'Search Console on the same page'],
            href: tour.site,
            cta: 'Open a site page',
            alt: `Site overview for ${tour.host}: users, sessions, pageviews and key events with trend lines`,
        },
        {
            key: 'traffic',
            label: 'Traffic & AI',
            title: 'See what ChatGPT sends you',
            bullets: ['AI assistants as their own number', 'Daily chart against the period before', 'Notes and Google updates on the chart'],
            href: tour.traffic,
            cta: 'Open Traffic',
            alt: 'Traffic page: AI traffic per day against the previous period, with notes on the chart',
        },
        {
            key: 'fixes',
            label: 'Search fixes',
            title: 'A to-do list ranked by clicks',
            bullets: ['Ranked by the clicks it could bring', 'The numbers behind every task', 'A suggested fix, step by step'],
            href: tour.fixes,
            cta: 'See what to fix',
            alt: 'Actions page: a high-impact task with its numbers and a suggested fix',
        },
        {
            key: 'dashboards',
            label: 'Dashboards',
            title: 'Client dashboards in minutes',
            bullets: ['Scorecards and charts from any site', 'Share a read-only link or embed', 'Templates, themes and dark mode'],
            href: tour.dashboards,
            cta: 'Open a dashboard',
            alt: 'A sample dashboard: scorecards for clicks, impressions, position, users and sessions, and two charts',
        },
    ];

    return (
        // Dark mode: stronger sparkline fills on this page (the app's 8% reads as flat on the marketing cards).
        <div className="contents dark:[--tc-spark-fill-top:24%]">
            <script dangerouslySetInnerHTML={{ __html: HOME_THEME_SCRIPT }} />
            <HomeThemeSync />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
            <SignInNotice />

            <section aria-label="Introduction" className="bg-canvas">
                <HeroCopy demoHref={tour.portfolio} />
                <div id="tour-portfolio" className="mx-auto mt-10 max-w-[1200px] scroll-mt-20 px-3 pb-16 sm:px-4 md:mt-14 md:px-6 md:pb-24">
                    <BrowserFrame url="trafficclaw.com/dashboard" className="shadow-[0_24px_64px_-24px_rgb(0_0_0/0.25)]">
                        <HeroPortfolio byRange={byRange} />
                    </BrowserFrame>
                </div>
            </section>

            <Section id="how-it-works" tone="surface" labelledBy="how-title">
                <SectionHeading
                    id="how-title"
                    eyebrow="How it works"
                    title="Sign in. See everything. Fix the drop."
                    description="No script, no setup. Sites appear on their own."
                    align="center"
                />
                <div className="mt-10 md:mt-12">
                    <JobStory {...story} />
                </div>
                <CtaRow note="Read-only. Nothing to install. No card." demoHref={tour.portfolio} />
            </Section>

            <Section id="tour" labelledBy="tour-title">
                <SectionHeading
                    id="tour-title"
                    eyebrow="Product tour"
                    title="One sign-in. Everything you need."
                    description="Real screens on sample data. Each one opens in the live demo."
                    align="center"
                />
                <div className="mt-12 md:mt-16">
                    <FeatureRows rows={features} />
                </div>
                <CtaRow note="All of it, free, on your own sites." />
            </Section>

            <McpSection portfolio={p28} askHref={tour.ask} />

            <span id="tour-leaderboard" aria-hidden className="block scroll-mt-20" />
            <LeaderboardPreview sampleRows={boardSample} />

            <WhyFree />

            <Section id="faq" labelledBy="faq-title">
                <div className="mx-auto max-w-[800px]">
                    <SectionHeading
                        id="faq-title"
                        eyebrow="FAQ"
                        title="Before you connect"
                        description={<>More in <Link href="/security" className="text-brand-text underline underline-offset-4 hover:text-fg">Security and data</Link>, or <Link href="/contact" className="text-brand-text underline underline-offset-4 hover:text-fg">ask us</Link>.</>}
                        align="center"
                    />
                    <div className="mt-8">
                        <Faq items={HOME_FAQ_PICK.map((i) => HOME_FAQ[i]).filter(Boolean)} />
                    </div>
                </div>
            </Section>

            <FinalCta
                title="See all your sites in one place."
                description={<>Free, <span className="whitespace-nowrap">read-only</span>, nothing to install, no card.</>}
                secondary={{ href: tour.portfolio, label: SECONDARY_CTA }}
                className="pt-0 md:pt-0"
            />
        </div>
    );
}

/** Mid-page call to action: the filled Google button, the demo as a quiet second choice, one short line. */
function CtaRow({ note, demoHref }: { note: string; demoHref?: string }) {
    return (
        <div className="mt-10 flex flex-col items-center gap-3 text-center md:mt-12">
            <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                <ConnectGoogleButton size="xl" mark />
                {demoHref ? (
                    <Link href={demoHref} className="tap-area inline-flex h-12 items-center justify-center gap-1.5 px-4 text-body font-medium text-fg-secondary hover:text-fg">
                        {SECONDARY_CTA}
                        <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                    </Link>
                ) : null}
            </div>
            <p className="text-body-sm text-fg-muted">{note}</p>
        </div>
    );
}
