import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Free SEOgets alternative';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Compare', title: 'Free SEOgets alternative', subtitle: 'Search Console, GA4 and the AI connector, free for every site.' });
}
