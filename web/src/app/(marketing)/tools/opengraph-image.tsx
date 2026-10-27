import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Free SEO tools';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'No sign-up', title: 'Free SEO tools', subtitle: 'AI search readiness, robots.txt, readability, hreflang, comparison pages.' });
}
