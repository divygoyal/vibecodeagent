import { sharedOgImage, OG_SIZE } from '@/components/marketing/site/og';
import { getPublicRow, isShareToken, toRecord } from '@/lib/builder/server/store';

export const alt = 'Shared analytics dashboard';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

/**
 * Share card for /view/<token>: the dashboard's name and description (the same text the page header shows), nothing
 * from its data. A password-protected dashboard shows its name only; a missing or revoked token shows the generic card.
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    let name = 'Shared dashboard';
    let description: string | undefined = 'Live Google Analytics and Search Console, shared with you.';
    let lock = false;
    if (isShareToken(token)) {
        try {
            const row = await getPublicRow(token, false);
            if (row) {
                const rec = toRecord(row);
                name = rec.doc.name || name;
                lock = rec.share.hasPassword;
                description = lock ? 'Password protected.' : rec.doc.description || description;
            }
        } catch {
            // admin unreachable: the generic card
        }
    }
    return sharedOgImage({ eyebrow: lock ? 'Protected dashboard' : 'Shared dashboard', title: name, subtitle: description, lock });
}
