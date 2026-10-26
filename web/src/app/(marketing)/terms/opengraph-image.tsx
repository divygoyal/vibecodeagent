import { marketingOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'Terms of Service';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return marketingOgImage({ eyebrow: 'Legal', title: 'Terms of Service', subtitle: 'Accounts, acceptable use, leaderboard content and paid plans.' });
}
