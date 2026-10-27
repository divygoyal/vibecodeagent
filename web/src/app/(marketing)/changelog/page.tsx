import type { Metadata } from 'next';

import { RELEASES } from '@/components/marketing/changelog/entries';
import { ContentPage, CrossLinks } from '@/components/marketing/site/ContentPage';
import { BRAND_NAME } from '@/lib/brand';
import { fmtDayYear } from '@/lib/format';

const TITLE = 'Changelog';
const DESCRIPTION = `What shipped in ${BRAND_NAME}, newest first, in plain words: the portfolio, site pages, what to fix next, dashboards, the leaderboard and the ChatGPT and Claude connector.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/changelog' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/changelog' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function ChangelogPage() {
    return (
        <ContentPage
            crumb="Changelog"
            title="Changelog"
            lead={`What shipped in ${BRAND_NAME}, newest first.`}
            footer={<CrossLinks links={[{ label: 'Try the live demo', href: '/demo' }, { label: 'Security and data', href: '/security' }, { label: 'Contact', href: '/contact' }]} />}
        >
            <ol className="relative space-y-14 border-l border-border-subtle pl-6 md:pl-8">
                {RELEASES.map((r) => (
                    <li key={r.id} id={r.id} className="relative scroll-mt-24">
                        <span aria-hidden className="absolute top-2 -left-[29px] size-2.5 rounded-full border-2 border-canvas bg-brand md:-left-[37px]" />
                        <time dateTime={r.date} className="text-body-sm font-medium text-brand-text tabular-nums">{fmtDayYear(r.date)}</time>
                        <h2 className="mt-1 text-balance text-heading text-fg">
                            <a href={`#${r.id}`} className="hover:underline hover:underline-offset-4">{r.title}</a>
                        </h2>
                        <p className="mt-3 text-body-lg text-fg-secondary">{r.summary}</p>
                        <div className="mt-6 space-y-6">
                            {r.groups.map((g) => (
                                <section key={g.title} aria-label={`${r.title}: ${g.title}`}>
                                    <h3 className="text-title-sm text-fg">{g.title}</h3>
                                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body text-fg-secondary marker:text-fg-faint">
                                        {g.items.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </li>
                ))}
            </ol>
        </ContentPage>
    );
}
