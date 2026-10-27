import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { FeatureTour, type TourStop } from '@/components/marketing/home/FeatureTour';
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
    const { byRange, story, tour } = buildHomeData();
    const p28 = byRange['28d'];

    const stops: TourStop[] = [
        {
            key: 'portfolio',
            tab: 'Portfolio',
            title: 'Your whole portfolio at a glance',
            bullets: ['Sort by clicks, users or change', 'Combined trend for all sites', 'Table view and CSV export'],
            href: tour.portfolio,
            cta: 'Open the portfolio',
            alt: 'Portfolio: every site with clicks, impressions, position, users, sessions and a trend line, and the combined trend',
        },
        {
            key: 'site',
            tab: 'Site page',
            title: 'Analytics and Search, side by side',
            bullets: ['GA4 and Search Console together', 'One-line summary on every chart', 'Notes and Google updates on charts'],
            href: tour.site,
            cta: 'Open a site page',
            alt: `Site overview for ${tour.host}: users, sessions, clicks and impressions with daily charts`,
        },
        {
            key: 'fixes',
            tab: 'Search fixes',
            title: 'A to-do list ranked by clicks',
            bullets: ['Queries close to page one', 'Clicks each fix could bring', 'Suggested fix, step by step'],
            href: tour.fixes,
            cta: 'See what to fix',
            alt: 'Actions page: tasks ranked by impact, each with the evidence and a suggested fix',
        },
        {
            key: 'traffic',
            tab: 'Traffic & AI',
            title: 'See what ChatGPT sends you',
            bullets: ['AI assistants as their own channel', 'Sources, pages, countries, devices', 'Realtime, funnels, journeys, retention'],
            href: tour.traffic,
            cta: 'Open Traffic',
            alt: 'Traffic page with AI traffic per day and the key Analytics numbers',
        },
        {
            key: 'dashboards',
            tab: 'Dashboards',
            title: 'Client dashboards in minutes',
            bullets: ['Templates, themes and dark mode', 'Public links, embeds, passwords', 'TV mode for the office screen'],
            href: tour.dashboards,
            cta: 'Open dashboards',
            alt: 'A shared dashboard with scorecards, a users chart, a devices donut and a top pages table',
        },
        {
            key: 'leaderboard',
            tab: 'Leaderboard',
            title: 'Show traffic Google has verified',
            bullets: ['Numbers straight from Google', 'Only verified owners rank', 'You choose what is public'],
            href: '/leaderboard',
            cta: 'See the leaderboard',
            alt: 'The public leaderboard: sites ranked by visitors, with verified-owner badges and trends',
        },
        {
            key: 'ask',
            tab: 'Ask AI',
            title: 'Ask in plain English, get numbers',
            bullets: ['Answers from your own data', 'Tables you can check', 'Or ask from ChatGPT and Claude'],
            href: tour.ask,
            cta: 'Try Ask in the demo',
            alt: 'Ask: the question "Which of my sites grew the most this month?" answered with growing and falling sites',
        },
    ];

    return (
        <>
            <script dangerouslySetInnerHTML={{ __html: HOME_THEME_SCRIPT }} />
            <HomeThemeSync />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }} />
            <SignInNotice />

            <section aria-label="Introduction" className="bg-canvas">
                <HeroCopy demoHref={tour.portfolio} />
                <div className="mx-auto mt-10 max-w-[1200px] px-3 pb-16 sm:px-4 md:mt-14 md:px-6 md:pb-24">
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
                    description="Real screens on sample data. Every one opens in the live demo."
                    align="center"
                />
                <div className="mt-10">
                    <FeatureTour stops={stops} />
                </div>
                <CtaRow note="All of it, free, on your own sites." />
            </Section>

            <McpSection portfolio={p28} />

            <LeaderboardPreview />

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
        </>
    );
}

/** Mid-page call to action: the filled Google button, the demo as a quiet second choice, one short line. */
function CtaRow({ note, demoHref }: { note: string; demoHref?: string }) {
    return (
        <div className="mt-10 flex flex-col items-center gap-3 text-center md:mt-12">
            <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                <ConnectGoogleButton size="lg" mark />
                {demoHref ? (
                    <Link href={demoHref} className="tap-area inline-flex h-11 items-center justify-center gap-1.5 px-4 text-body font-medium text-fg-secondary hover:text-fg">
                        {SECONDARY_CTA}
                        <ArrowRight aria-hidden size={16} strokeWidth={1.75} />
                    </Link>
                ) : null}
            </div>
            <p className="text-body-sm text-fg-muted">{note}</p>
        </div>
    );
}
