import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { buildMarketingDemoSiteDashboard, demoSiteSlugs } from '@/components/marketing/demo/data';
import { DemoBanner } from '@/components/marketing/demo/DemoBanner';
import { DemoSiteDashboardView } from '@/components/marketing/demo/DemoSiteDashboardView';
import { BRAND_NAME } from '@/lib/brand';

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
    return demoSiteSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const dash = buildMarketingDemoSiteDashboard(slug);
    if (!dash) return {};
    const title = `Sample dashboard: ${dash.site.label}`;
    const description = `A read-only ${BRAND_NAME} dashboard for the sample site ${dash.site.label}: Search Console and Google Analytics numbers, top queries, pages, channels, devices and countries.`;
    return {
        title,
        description,
        alternates: { canonical: `/demo/${slug}` },
        robots: { index: false, follow: true },
        openGraph: { title: `${title} | ${BRAND_NAME}`, description, url: `/demo/${slug}` },
        twitter: { card: 'summary_large_image', title: `${title} | ${BRAND_NAME}`, description },
    };
}

export default async function DemoSitePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const dashboard = buildMarketingDemoSiteDashboard(slug);
    if (!dashboard) notFound();

    return (
        <div className="mx-auto max-w-[1200px] space-y-6 px-4 pt-6 pb-16 md:px-6 md:pt-8 md:pb-24">
            <DemoBanner />
            <Link href="/demo" className="inline-flex items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-fg">
                <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
                All sample sites
            </Link>
            <DemoSiteDashboardView dashboard={dashboard} />
        </div>
    );
}
