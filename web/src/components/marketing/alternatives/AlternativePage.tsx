import Link from 'next/link';
import { ArrowRight, Check, Minus } from 'lucide-react';

import { Faq } from '../site/Faq';
import { FinalCta } from '../site/FinalCta';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';
import { Section, SectionHeading } from '../site/Section';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { BRAND_NAME, SITE_URL } from '@/lib/brand';
import { ComparisonTable } from './ComparisonTable';
import { ALTERNATIVES, CHECKED_ON, type Alternative } from './data';
import { ProductShot } from './ProductShot';

export function Breadcrumbs({ trail }: { trail: Array<{ label: string; href?: string }> }) {
    return (
        <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
                <li><Link href="/" className="tap-area inline-block hover:text-fg">Home</Link></li>
                {trail.map((t) => (
                    <li key={t.label} className="flex items-center gap-2">
                        <span aria-hidden>/</span>
                        {t.href ? <Link href={t.href} className="tap-area inline-block hover:text-fg">{t.label}</Link> : <span aria-current="page" className="text-fg-secondary">{t.label}</span>}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

export function JsonLd({ data }: { data: unknown }) {
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function breadcrumbLd(trail: Array<{ label: string; path: string }>) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ label: 'Home', path: '/' }, ...trail].map((t, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t.label,
            item: `${SITE_URL}${t.path === '/' ? '' : t.path}`,
        })),
    };
}

/** The two hero actions of every page here: the sign-up button and the live demo. */
export function HeroActions({ callbackUrl }: { callbackUrl?: string }) {
    return (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ConnectGoogleButton size="xl" mark callbackUrl={callbackUrl} className="w-full sm:w-auto" />
            <Link href="/demo" className={buttonClasses({ variant: 'secondary', size: 'xl', className: 'w-full sm:w-auto' })}>
                Try the live demo
                <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
            </Link>
        </div>
    );
}

function WinCard({ tone, title, items }: { tone: 'them' | 'us'; title: string; items: Array<{ title: string; body: string }> }) {
    const Icon = tone === 'us' ? Check : Minus;
    return (
        <div className="rounded-card border border-border-subtle bg-surface p-6 shadow-card">
            <h3 className="text-title text-fg">{title}</h3>
            <ul className="mt-4 space-y-4">
                {items.map((it) => (
                    <li key={it.title} className="flex gap-3">
                        <span className={tone === 'us' ? 'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-up-soft text-up' : 'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted'}>
                            <Icon aria-hidden size={12} strokeWidth={2.5} />
                        </span>
                        <span>
                            <span className="block text-body-lg font-medium text-fg">{it.title}</span>
                            <span className="mt-0.5 block text-body text-fg-secondary">{it.body}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function PickList({ title, items }: { title: string; items: string[] }) {
    return (
        <div>
            <h3 className="text-title-sm text-fg">{title}</h3>
            <ul className="mt-3 space-y-2 text-body-lg text-fg-secondary">
                {items.map((i) => (
                    <li key={i} className="flex gap-2.5">
                        <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fg-faint" />
                        {i}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** One "alternative to" page: hero + real product crop, three points, the table, where each side wins, FAQ. */
export function AlternativePage({ alt }: { alt: Alternative }) {
    const path = `/alternatives/${alt.slug}`;
    const others = ALTERNATIVES.filter((a) => a.slug !== alt.slug);
    const pageLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: alt.h1,
        description: alt.description,
        url: `${SITE_URL}${path}`,
        isPartOf: { '@type': 'WebSite', name: BRAND_NAME, url: SITE_URL },
    };
    return (
        <>
            <JsonLd data={pageLd} />
            <JsonLd data={breadcrumbLd([{ label: 'Alternatives', path: '/alternatives' }, { label: alt.name, path }])} />

            <section aria-labelledby="alt-title" className="bg-canvas">
                <div className="mx-auto max-w-[1200px] px-4 pt-10 pb-12 md:px-6 md:pt-14 md:pb-16">
                    <Breadcrumbs trail={[{ label: 'Alternatives', href: '/alternatives' }, { label: alt.name }]} />
                    <div className="mt-8 max-w-[760px]">
                        <SectionHeading as="h1" id="alt-title" eyebrow={`${BRAND_NAME} vs ${alt.name}`} title={alt.h1} description={alt.lead} />
                        <HeroActions />
                        <p className="mt-4 text-meta text-fg-muted">Free. Read-only Google access. No card, no site limit.</p>
                    </div>
                    <div className="mt-12">
                        <ProductShot name={alt.shot} alt={alt.shotAlt} eager caption="The real product, with demo data. Open the live demo to click around." />
                    </div>
                </div>
            </section>

            <Section tone="surface" labelledBy="switch-title" className="py-12 md:py-16">
                <h2 id="switch-title" className="sr-only">What changes if you switch</h2>
                <ul className="grid gap-4 grid-cols-1 md:grid-cols-3">
                    {alt.points.map((p, i) => (
                        <li key={p.title} className="rounded-card border border-border-subtle bg-canvas p-6">
                            <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-body-sm font-semibold text-brand-soft-fg tabular-nums">{i + 1}</span>
                            <h3 className="mt-3 text-title text-fg">{p.title}</h3>
                            <p className="mt-1 text-body-lg text-fg-secondary">{p.body}</p>
                        </li>
                    ))}
                </ul>
            </Section>

            <Section labelledBy="compare-title">
                <SectionHeading id="compare-title" eyebrow="Side by side" title={`${BRAND_NAME} and ${alt.name}`} description={`${alt.name} facts are from its own site and docs, checked on ${CHECKED_ON}.`} />
                <div className="mt-8">
                    <ComparisonTable competitor={alt.name} rows={alt.rows} caption={`${BRAND_NAME} compared with ${alt.name}`} />
                </div>
            </Section>

            <Section tone="surface" labelledBy="wins-title">
                <SectionHeading id="wins-title" eyebrow="Honest take" title="Where each one wins" />
                <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-2">
                    <WinCard tone="them" title={`Where ${alt.name} wins`} items={alt.theyWin} />
                    <WinCard tone="us" title={`Where ${BRAND_NAME} wins`} items={alt.weWin} />
                </div>
                <div className="mt-10 grid gap-8 grid-cols-1 md:grid-cols-2">
                    <PickList title={`Pick ${alt.name} if`} items={alt.pickThem} />
                    <PickList title={`Pick ${BRAND_NAME} if`} items={alt.pickUs} />
                </div>
            </Section>

            <Section labelledBy="faq-title" innerClassName="max-w-[760px]">
                <SectionHeading id="faq-title" title="Questions" />
                <Faq items={alt.faq} className="mt-8" />
                <div className="mt-8 text-body-sm text-fg-muted">
                    <p>
                        Sources, checked {CHECKED_ON}:{' '}
                        {alt.sources.map((s, i) => (
                            <span key={s.href}>
                                {i > 0 ? ', ' : ''}
                                <a href={s.href} rel="noopener nofollow" className="underline underline-offset-4 hover:text-fg">{s.label}</a>
                            </span>
                        ))}
                        . Prices and features change; check the vendor before you buy. {BRAND_NAME} is not affiliated with {alt.name}.
                    </p>
                    <p className="mt-3">
                        Also compare:{' '}
                        {others.map((o, i) => (
                            <span key={o.slug}>
                                {i > 0 ? ', ' : ''}
                                <Link href={`/alternatives/${o.slug}`} className="underline underline-offset-4 hover:text-fg">{o.name}</Link>
                            </span>
                        ))}
                        .
                    </p>
                </div>
            </Section>

            <FinalCta
                title={`Try ${BRAND_NAME} on your own sites.`}
                primaryLabel="Connect Google — it's free"
                secondary={{ href: '/demo', label: 'Try the live demo' }}
                className="pt-0 md:pt-0"
            />
        </>
    );
}
