import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Sponsor verified sites';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Ad slots', title: 'Sponsor verified sites', subtitle: 'Ad slots at publisher-set prices, on sites with proven traffic.' });
}
