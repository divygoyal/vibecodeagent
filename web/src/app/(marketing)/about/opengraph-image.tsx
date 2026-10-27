import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'All your sites. One screen. Free.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'About', title: 'All your sites. One screen. Free.', subtitle: 'Read-only, no site limit, honest numbers.' });
}
