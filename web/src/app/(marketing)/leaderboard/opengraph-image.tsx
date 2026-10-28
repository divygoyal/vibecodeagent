import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Verified traffic leaderboard';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Leaderboard', title: 'Verified traffic leaderboard', subtitle: 'Real visitor numbers, confirmed through Google Search Console. Add your site free.' });
}
