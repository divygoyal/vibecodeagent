import type { Metadata } from 'next';

import { toolBySlug } from '@/components/marketing/tools/catalog';
import { BRAND_NAME } from '@/lib/brand';

const tool = toolBySlug('robots-analyzer');

export const metadata: Metadata = {
    title: `${tool.title}: free tool`,
    description: tool.description,
    alternates: { canonical: '/tools/robots-analyzer' },
    openGraph: { title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description, url: '/tools/robots-analyzer' },
    twitter: { card: 'summary_large_image', title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description },
};

export default function ToolLayout({ children }: { children: React.ReactNode }) {
    return children;
}
