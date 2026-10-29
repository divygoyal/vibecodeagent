import type { Metadata } from 'next';

import { AlternativePage } from '@/components/marketing/alternatives/AlternativePage';
import { getAlternative } from '@/components/marketing/alternatives/data';
import { BRAND_NAME } from '@/lib/brand';

const alt = getAlternative('looker-studio');

export const metadata: Metadata = {
    title: alt.title,
    description: alt.description,
    alternates: { canonical: '/alternatives/looker-studio' },
    openGraph: { title: `${alt.title} | ${BRAND_NAME}`, description: alt.description, url: '/alternatives/looker-studio', type: 'website' },
    twitter: { card: 'summary_large_image', title: `${alt.title} | ${BRAND_NAME}`, description: alt.description },
};

export default function Page() {
    return <AlternativePage alt={alt} />;
}
