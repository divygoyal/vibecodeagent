import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Changelog';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Changelog', title: 'What’s new in TrafficClaw', subtitle: 'Everything that shipped, in plain words.' });
}
