import type { Metadata } from 'next';

import { toolBySlug } from '@/components/marketing/tools/catalog';
import { BRAND_NAME } from '@/lib/brand';

const tool = toolBySlug('comparison-builder');

export const metadata: Metadata = {
    title: `${tool.title}: free tool`,
    description: tool.description,
    alternates: { canonical: '/tools/comparison-builder' },
    openGraph: { title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description, url: '/tools/comparison-builder' },
    twitter: { card: 'summary_large_image', title: `${tool.title}: free tool | ${BRAND_NAME}`, description: tool.description },
};

export default function ToolLayout({ children }: { children: React.ReactNode }) {
    return children;
}
