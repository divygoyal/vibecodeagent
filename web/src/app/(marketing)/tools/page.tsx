import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { SectionHeading } from '@/components/marketing/site/Section';
import { FREE_TOOLS } from '@/components/marketing/tools/catalog';
import { BRAND_NAME } from '@/lib/brand';

const TITLE = 'Free SEO tools';
const DESCRIPTION = 'Free SEO tools, no sign-up: AI search readiness checker, robots.txt analyzer, readability checker, hreflang validator and comparison page builder.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/tools' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/tools' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function ToolsIndexPage() {
    return (
        <div className="mx-auto max-w-[1200px] px-4 pt-14 pb-12 md:px-6 md:pt-20 md:pb-16">
            <SectionHeading
                as="h1"
                eyebrow="No sign-up"
                title="Free SEO tools"
                description="Check a robots.txt file, test a page for AI search, score readability, validate hreflang tags or build a comparison page. Free, in your browser."
                align="center"
            />
            <ul className="mx-auto mt-12 grid max-w-[880px] gap-4 sm:grid-cols-2">
                {FREE_TOOLS.map((tool) => (
                    <li key={tool.slug}>
                        <Link
                            href={`/tools/${tool.slug}`}
                            className="group tc-card flex h-full gap-4 rounded-card border border-border-subtle bg-surface p-5 shadow-card transition-[box-shadow,border-color,transform] duration-120 ease-standard hover:-translate-y-px hover:border-border hover:shadow-card-hover motion-reduce:hover:translate-y-0"
                        >
                            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-soft-fg">
                                <tool.icon aria-hidden size={20} strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-title-sm text-fg">{tool.title}</span>
                                <span className="mt-1 block text-body text-fg-secondary">{tool.short}</span>
                                <span className="mt-3 inline-flex items-center gap-1 text-body-sm font-medium text-fg-secondary group-hover:text-fg">
                                    Open <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                                </span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
