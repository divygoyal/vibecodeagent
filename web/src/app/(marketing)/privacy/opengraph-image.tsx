import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Privacy Policy';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Legal', title: 'Privacy Policy', subtitle: 'Google user data, the public leaderboard and AI apps you connect.' });
}
