import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'How TrafficClaw compares';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Compare', title: 'How TrafficClaw compares', subtitle: 'Looker Studio, SEOgets and QuickSEO, side by side and honest.' });
}
