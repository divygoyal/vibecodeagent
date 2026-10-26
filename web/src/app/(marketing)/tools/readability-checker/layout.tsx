import type { Metadata } from 'next';

import { toolBySlug } from '@/components/marketing/tools/catalog';
import { BRAND_NAME } from '@/lib/brand';

const tool = toolBySlug('readability-checker');

export const metadata: Metadata = {
    title: `${tool.title}: free tool`,
    description: tool.description,
    alternates: { canonical: '/tools/readability-checker' },
    openGraph: { title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description, url: '/tools/readability-checker' },
    twitter: { card: 'summary_large_image', title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description },
};

export default function ToolLayout({ children }: { children: React.ReactNode }) {
    return children;
}
