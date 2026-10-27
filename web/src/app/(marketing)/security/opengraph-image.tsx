import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Security and data';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Trust', title: 'Security and data', subtitle: 'Read-only Google access, what we store, and how to revoke it.' });
}
