import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Looker Studio alternative for GA4 + Search Console';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Compare', title: 'Looker Studio alternative for GA4 + Search Console', subtitle: 'Starts finished. Free, read-only, every site on one screen.' });
}
