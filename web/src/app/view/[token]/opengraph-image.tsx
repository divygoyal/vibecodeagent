import { sharedOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';
import { shareCardData } from '@/lib/builder/server/shareCard';
import type { ShareCardNumbers } from '@/lib/builder/shareCard';

export const alt = 'Shared analytics dashboard';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/**
 * Share card for /view/<token>: the dashboard's own name, its site, the date range and two or three real KPI numbers with
 * their change, from its first KPI widgets (the same query path as the public page, cached). Without numbers it is the title
 * card: a password-protected dashboard (never any numbers), a dashboard with no KPI widget, or data that takes over
 * 2.5 s or fails. A missing or revoked token shows the generic card.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    let name = 'Shared dashboard';
    let description: string | undefined = 'Live Google Analytics and Search Console, shared with you.';
    let lock = false;
    let numbers: ShareCardNumbers | null = null;
    if (isShareToken(token)) {
        try {
            const row = await getPublicRow(token, false);
            if (row) {
                const rec = toRecord(row);
                name = rec.doc.name || name;
                lock = rec.share.hasPassword;
                description = lock ? 'Password protected.' : rec.doc.description || description;
                numbers = await shareCardData(row, rec);
            }
        } catch {
            // admin unreachable: the title card
        }
    }
    // With numbers the card says where they come from; the description stays on the page.
    const subtitle = numbers?.site && numbers.site !== name ? numbers.site : numbers ? undefined : description;
    return sharedOgImage({ eyebrow: lock ? 'Protected dashboard' : 'Shared dashboard', title: name, subtitle, lock, numbers });
}
