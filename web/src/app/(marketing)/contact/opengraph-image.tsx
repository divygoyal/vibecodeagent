import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Got a question?';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Contact', title: 'Got a question?', subtitle: "Send us a message and we'll get back to you." });
}
