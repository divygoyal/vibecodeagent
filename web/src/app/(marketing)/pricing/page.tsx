import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Bot, Check, Minus, Megaphone } from 'lucide-react';

import { Button } from '@/components/ui';
import { PRICING_FAQ } from '@/components/marketing/home/content';
import { DiscountBanner } from '@/components/marketing/pricing/DiscountBanner';
import { PricingPlans } from '@/components/marketing/pricing/PricingPlans';
import { Faq } from '@/components/marketing/site/Faq';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { Section, SectionHeading } from '@/components/marketing/site/Section';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';
import { FREE_START_CREDITS, PAID_PLANS, pricePerMessage } from '@/lib/plans';

const TITLE = 'Pricing: free, with optional Ask messages';
const DESCRIPTION = `${BRAND_NAME} is free for every site you own: portfolio, dashboards, leaderboard and the ChatGPT and Claude connector. Paid plans only add Ask messages: ${PAID_PLANS.map((p) => `${p.name} $${p.priceUsd}/month for ${p.credits}`).join(', ')}.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/pricing' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/pricing' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
const pro = PAID_PLANS.find((p) => p.key === 'pro')!;

type Cell = boolean | string;
const ROWS: Array<{ label: string; free: Cell; growth: Cell; pro: Cell }> = [
    { label: 'Sites', free: 'No limit', growth: 'No limit', pro: 'No limit' },
    { label: 'Portfolio of all your sites', free: true, growth: true, pro: true },
    { label: 'Site pages: Traffic, Search, What to fix next, Audit', free: true, growth: true, pro: true },
    { label: 'Dashboards, public links and embeds', free: true, growth: true, pro: true },
    { label: 'Public leaderboard profile', free: true, growth: true, pro: true },
    { label: 'ChatGPT & Claude connector (MCP)', free: true, growth: true, pro: true },
    { label: 'Ask messages (built-in AI chat)', free: `${FREE_START_CREDITS} to start`, growth: `${growth.credits} a month`, pro: `${pro.credits} a month` },
    { label: 'Price per Ask message', free: false, growth: pricePerMessage(growth), pro: pricePerMessage(pro) },
];

const productSchema = PAID_PLANS.map((p) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${BRAND_NAME} ${p.name}`,
    description: `Everything in ${BRAND_NAME} Free, plus ${p.credits} Ask messages (built-in AI chat) a month.`,
    url: `${SITE_URL}/pricing`,
    brand: { '@type': 'Brand', name: BRAND_NAME },
    offers: { '@type': 'Offer', price: String(p.priceUsd), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: `${SITE_URL}/pricing` },
}));

function CellView({ value }: { value: Cell }) {
    if (value === true) return <Check aria-label="Included" size={16} strokeWidth={2} className="mx-auto text-up" />;
    if (value === false) return <Minus aria-label="Not applicable" size={16} strokeWidth={1.75} className="mx-auto text-fg-faint" />;
    return <span className="text-body tabular-nums text-fg">{value}</span>;
}

export default function PricingPage() {
    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />

            <section aria-labelledby="pricing-title" className="bg-canvas">
                <div className="mx-auto max-w-[1200px] px-4 pt-14 pb-16 md:px-6 md:pt-20 md:pb-24">
                    <SectionHeading
                        as="h1"
                        id="pricing-title"
                        eyebrow="Pricing"
                        title="Free. Really."
                        description={`Every feature is free for every site you own. Pay only if you want more Ask messages in ${BRAND_NAME}'s built-in AI chat.`}
                        align="center"
                    />
                    <div className="mx-auto mt-10 max-w-[880px]">
                        <DiscountBanner />
                    </div>
                    <div className="mt-6">
                        <PricingPlans />
                    </div>
                    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-meta text-fg-muted">
                        <span>Every plan:</span>
                        <Link href="/security" className="underline decoration-border-strong decoration-dotted underline-offset-4 hover:text-fg hover:decoration-solid">read-only Google access</Link>
                        <span aria-hidden>·</span>
                        <span>nothing to install</span>
                        <span aria-hidden>·</span>
                        <span>no site limit</span>
                    </p>

                    <div className="mt-6 flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-5 shadow-card sm:flex-row sm:items-center">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                            <Bot aria-hidden size={20} strokeWidth={1.75} />
                        </span>
                        <div className="flex-1">
                            <p className="text-title-sm text-fg">Ask ChatGPT or Claude instead, free</p>
                            <p className="mt-0.5 text-body text-fg-secondary">
                                The connector is free on every plan and does not use Ask messages: the AI runs on your own ChatGPT or Claude account.
                            </p>
                        </div>
                        <Button asChild variant="secondary" trailingIcon={<ArrowRight aria-hidden size={16} strokeWidth={1.75} />} className="self-start sm:self-auto">
                            <Link href="/ai">How it works</Link>
                        </Button>
                    </div>
                </div>
            </section>

            <Section tone="surface" labelledBy="compare-title">
                <SectionHeading id="compare-title" title="Compare plans" description="The only difference between plans is the number of Ask messages." />
                <div className="mt-8 overflow-x-auto rounded-card border border-border-subtle bg-surface shadow-card">
                    <table className="w-full min-w-[560px] text-left">
                        <caption className="sr-only">Features by plan</caption>
                        <thead className="sticky top-0 bg-surface-sunken">
                            <tr className="border-b border-border-subtle text-body-sm text-fg-muted">
                                <th scope="col" className="px-4 py-3 font-medium">Feature</th>
                                <th scope="col" className="w-[22%] px-4 py-3 text-center font-medium">Free</th>
                                <th scope="col" className="w-[22%] px-4 py-3 text-center font-medium">{growth.name} · ${growth.priceUsd}</th>
                                <th scope="col" className="w-[22%] px-4 py-3 text-center font-medium">{pro.name} · ${pro.priceUsd}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ROWS.map((row) => (
                                <tr key={row.label} className="border-b border-border-subtle last:border-b-0">
                                    <th scope="row" className="px-4 py-3 text-body font-normal text-fg">{row.label}</th>
                                    <td className="px-4 py-3 text-center"><CellView value={row.free} /></td>
                                    <td className="px-4 py-3 text-center"><CellView value={row.growth} /></td>
                                    <td className="px-4 py-3 text-center"><CellView value={row.pro} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-card border border-border-subtle bg-canvas p-5 sm:flex-row sm:items-center">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-subtle text-fg-secondary">
                        <Megaphone aria-hidden size={20} strokeWidth={1.75} />
                    </span>
                    <div className="flex-1">
                        <p className="text-title-sm text-fg">Advertisers: reach founders on the leaderboard</p>
                        <p className="mt-0.5 text-body text-fg-secondary">Sponsor slots on the public leaderboard are always labelled “Sponsored”.</p>
                    </div>
                    <Button asChild variant="secondary" trailingIcon={<ArrowRight aria-hidden size={16} strokeWidth={1.75} />} className="self-start sm:self-auto">
                        <Link href="/leaderboard/advertise">See sponsor slots</Link>
                    </Button>
                </div>
            </Section>

            <Section id="faq" labelledBy="pricing-faq-title">
                <div className="grid gap-10 grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
                    <SectionHeading
                        id="pricing-faq-title"
                        eyebrow="FAQ"
                        title="Pricing questions"
                        description={<>Still unsure? <Link href="/contact" className="text-brand-text underline underline-offset-4 hover:text-fg">Ask us</Link>.</>}
                    />
                    <Faq items={PRICING_FAQ} />
                </div>
            </Section>

            <FinalCta title="Start free. Add Ask messages only if you want them." />
        </>
    );
}
