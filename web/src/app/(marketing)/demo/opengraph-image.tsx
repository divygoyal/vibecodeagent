import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Live demo: 11 sample sites';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Live demo', title: 'Live demo: 11 sample sites', subtitle: 'A read-only portfolio and sample dashboards. No sign-in.' });
}
