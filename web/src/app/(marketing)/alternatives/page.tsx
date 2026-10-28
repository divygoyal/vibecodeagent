import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Breadcrumbs, breadcrumbLd, HeroActions, JsonLd } from '@/components/marketing/alternatives/AlternativePage';
import { OverviewTable } from '@/components/marketing/alternatives/ComparisonTable';
import { ALTERNATIVES, CHECKED_ON } from '@/components/marketing/alternatives/data';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { Section, SectionHeading } from '@/components/marketing/site/Section';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';

const TITLE = 'Compare TrafficClaw: Looker Studio, SEOgets, QuickSEO';
const DESCRIPTION = 'How TrafficClaw compares with Looker Studio, SEOgets and QuickSEO for Google Analytics 4 and Search Console reporting: pricing, features and where each one wins.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/alternatives' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/alternatives', type: 'website' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

const listLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Alternatives compared with TrafficClaw',
    itemListElement: ALTERNATIVES.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.title, url: `${SITE_URL}/alternatives/${a.slug}` })),
};

export default function AlternativesIndexPage() {
    return (
        <>
            <JsonLd data={listLd} />
            <JsonLd data={breadcrumbLd([{ label: 'Alternatives', path: '/alternatives' }])} />
            <section aria-labelledby="alts-title" className="bg-canvas">
                <div className="mx-auto max-w-[1200px] px-4 pt-10 pb-12 md:px-6 md:pt-14 md:pb-16">
                    <Breadcrumbs trail={[{ label: 'Alternatives' }]} />
                    <div className="mt-8 max-w-[760px]">
                        <SectionHeading as="h1" id="alts-title" eyebrow="Compare" title="How TrafficClaw compares" description="Honest side-by-sides with the tools people ask us about, including where they are better. All for Google Analytics 4 and Search Console." />
                        <HeroActions />
                    </div>
                </div>
            </section>

            <Section tone="surface" labelledBy="cards-title" className="py-12 md:py-16">
                <h2 id="cards-title" className="sr-only">Pick a comparison</h2>
                <ul className="grid gap-4 grid-cols-1 md:grid-cols-3">
                    {ALTERNATIVES.map((a) => (
                        <li key={a.slug}>
                            <Link
                                href={`/alternatives/${a.slug}`}
                                className="group tc-card flex h-full flex-col rounded-card border border-border-subtle bg-canvas p-6 shadow-card transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0"
                            >
                                <span className="text-body-sm font-medium text-brand-text">{BRAND_NAME} vs {a.name}</span>
                                <span className="mt-2 block text-title text-fg">{a.h1}</span>
                                <span className="mt-2 block text-body text-fg-secondary">{a.blurb}</span>
                                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-body-sm font-medium text-fg-secondary group-hover:text-fg">
                                    Read the comparison <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section labelledBy="overview-title">
                <SectionHeading id="overview-title" eyebrow="At a glance" title="Four tools, four questions" description={`Competitor facts are from their own sites and docs, checked on ${CHECKED_ON}. Each page above has the detail.`} />
                <div className="mt-8">
                    <OverviewTable
                        caption="TrafficClaw compared with Looker Studio, SEOgets and QuickSEO"
                        columns={[BRAND_NAME, 'Looker Studio', 'SEOgets', 'QuickSEO']}
                        rows={[
                            { label: 'Price', values: ['Free, no site limit', 'Free (Pro is paid)', 'Free sites; core sites from $49/month', 'Free plan; Lite $39/month'] },
                            { label: 'Search Console for all your sites', values: [{ yes: true, text: 'Automatic portfolio' }, { yes: true, text: 'You build it' }, true, true] },
                            { label: 'Google Analytics 4', values: [true, { yes: true, text: 'Separate connector' }, { yes: true, text: 'Listed under core sites' }, { yes: false, text: 'Not mentioned on their site' }] },
                            { label: 'Claude and ChatGPT connector (MCP)', values: [{ yes: true, text: 'Free' }, 'Not checked', { yes: true, text: 'Listed under core sites' }, { yes: true, text: 'Lite plan only' }] },
                        ]}
                    />
                </div>
            </Section>

            <FinalCta title="See it on your own sites." secondary={{ href: '/demo', label: 'Try the live demo' }} className="pt-0 md:pt-0" />
        </>
    );
}
