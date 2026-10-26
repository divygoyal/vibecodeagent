import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Free. Really.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Pricing', title: 'Free. Really.', subtitle: 'Every feature is free. Paid plans only add Ask messages.' });
}
