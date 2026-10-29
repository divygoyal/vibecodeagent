import type { Metadata } from 'next';

import { AlternativePage } from '@/components/marketing/alternatives/AlternativePage';
import { getAlternative } from '@/components/marketing/alternatives/data';
import { BRAND_NAME } from '@/lib/brand';

const alt = getAlternative('seogets');

export const metadata: Metadata = {
    title: alt.title,
    description: alt.description,
    alternates: { canonical: '/alternatives/seogets' },
    openGraph: { title: `${alt.title} | ${BRAND_NAME}`, description: alt.description, url: '/alternatives/seogets', type: 'website' },
    twitter: { card: 'summary_large_image', title: `${alt.title} | ${BRAND_NAME}`, description: alt.description },
};

export default function Page() {
    return <AlternativePage alt={alt} />;
}
