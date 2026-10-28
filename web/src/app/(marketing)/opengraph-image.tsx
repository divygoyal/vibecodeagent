import { homeOgImage, OG_SIZE } from '@/components/marketing/site/og';

export const alt = 'TrafficClaw: all your Google Analytics and Search Console sites on one free screen.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
    return homeOgImage('light');
}
