import { lookupShare } from '@/app/api/share/route';
import { sharedOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { shareSiteLabel } from '@/components/share/ShareChrome';

export const alt = 'Shared analytics';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/** Share card for /share/<token>: the site's host (the page header shows it too), no numbers. Unknown tokens get the generic card. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const { share } = await lookupShare(token, { incrementView: false }).catch(() => ({ share: null }));
    const host = share ? shareSiteLabel(share.siteUrl) : '';
    return sharedOgImage({ eyebrow: 'Shared analytics', title: host || 'Shared analytics', subtitle: 'Live traffic from Google Analytics, shared with you.' });
}
