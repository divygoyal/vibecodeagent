import { lookupShare } from '@/app/api/share/route';
import { sharedOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { shareSiteLabel } from '@/components/share/ShareChrome';
import { shareSiteCardData } from '@/lib/shareSiteCard';
import type { ShareCardNumbers } from '@/lib/builder/shareCard';

export const alt = 'Shared analytics';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/**
 * Share card for /share/<token>: the site's host (the page header shows it too), the date range and the page's three lead
 * numbers (users, sessions, pageviews) with their change, cached; the title card when the share hides its metrics or the
 * numbers take over 2.5 s or fail. Unknown tokens get the generic card.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const { share } = await lookupShare(token, { incrementView: false }).catch(() => ({ share: null }));
    const host = share ? shareSiteLabel(share.siteUrl) : '';
    const numbers: ShareCardNumbers | null = share ? await shareSiteCardData(share).catch(() => null) : null;
    return sharedOgImage({
        eyebrow: 'Shared analytics',
        title: host || 'Shared analytics',
        subtitle: numbers ? undefined : 'Live traffic from Google Analytics, shared with you.',
        numbers,
    });
}
