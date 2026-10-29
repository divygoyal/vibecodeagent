import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Your Google Analytics and Search Console in ChatGPT and Claude';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'ChatGPT and Claude', title: 'Your analytics, in your AI app', subtitle: 'One read-only connector for every site you own. Free.' });
}
