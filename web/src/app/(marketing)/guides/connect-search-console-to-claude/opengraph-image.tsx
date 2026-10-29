import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Connect Search Console and GA4 to Claude';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Guide', title: 'Connect Search Console and GA4 to Claude', subtitle: 'One free, read-only connector. Works with ChatGPT too.' });
}
