import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'QuickSEO alternative with GA4 + Search Console';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Compare', title: 'QuickSEO alternative with GA4 + Search Console', subtitle: 'Both Google sources, dashboards and a free AI connector.' });
}
