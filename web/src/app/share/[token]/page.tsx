import { Metadata } from 'next';
import { headers } from 'next/headers';
import { getShareData } from '@/app/api/share/route';
import SharedOverviewClient from '@/components/share-overview/openpanel/SharedOverviewClient';
import SharedUmamiClient from '@/components/share-overview/umami/SharedUmamiClient';
import SharedDashboardClient from './SharedDashboardClient';
import SharePromoPopup from '@/components/share/SharePromoPopup';
import ShareConversionBar from '@/components/share/ShareConversionBar';
import { verifyShareWatermarkSignature } from '@/lib/shareWatermark';
import { BRAND_NAME } from '@/lib/brand';
import { SHARE_CONTAINER, ShareFooter, ShareHeader, ShareNotFound, SharePage } from '@/components/share/ShareChrome';

// Promo popup auto-opens 20s after a viewer lands on the public share view,
// OR sooner on exit-intent (mouse leaving the top of the viewport). The
// 20s window gives them time to actually engage with the dashboard before
// being pitched; exit-intent catches bouncers who would otherwise leave
// without ever seeing the popup. Only mounts when !isEmbed — never
// injected into customer iframes where it would feel intrusive.
const PROMO_POPUP_DELAY_MS = 20000;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: `Shared dashboard · ${BRAND_NAME}`,
    description: `A shared analytics dashboard, powered by ${BRAND_NAME}`,
};

/* ─── Page Component ─── */
export default async function SharedDashboardPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ embed?: string | string[]; _b?: string | string[] }>;
}) {
    const { token } = await params;
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const embedParam = resolvedSearchParams?.embed;
    const isEmbed = Array.isArray(embedParam) ? embedParam.includes('true') : embedParam === 'true';
    // Owner-watermark suppression: the `_b` param is an HMAC of the token
    // signed with SHARE_WATERMARK_SECRET. Only our marketing site can mint
    // a valid sig; customer iframes never include it, so their watermark
    // always stays visible.
    const watermarkParam = resolvedSearchParams?._b;
    const watermarkSig = Array.isArray(watermarkParam) ? watermarkParam[0] : watermarkParam;
    const hideOwnerLogo = verifyShareWatermarkSignature(token, watermarkSig);
    const share = await getShareData(token, { incrementView: true });

    /* ─── Invalid / revoked token ─── */
    if (!share) {
        return <ShareNotFound isEmbed={isEmbed} />;
    }

    // Show the slim conversion bar ONLY on direct viewer-facing share views.
    // Suppress in every iframe context, whether or not the embedder used a
    // known flag — covers third-party iframes that don't pass ?embed=true.
    //
    //  - !isEmbed: ?embed=true flag (customer-iframe convention)
    //  - !hideOwnerLogo: ?_b=<sig> (our own marketing iframes)
    //  - !isInIframe: Sec-Fetch-Dest header from the browser; catches every
    //    other iframe regardless of flags. Sent by all modern browsers
    //    (Chrome 76+, Firefox 90+, Safari 16.4+).
    const h = await headers();
    const isInIframe = h.get('sec-fetch-dest') === 'iframe';
    const showConversionBar = !isEmbed && !hideOwnerLogo && !isInIframe;

    if (share.config.layoutMode === 'openpanel_overview') {
        return (
            <>
                {showConversionBar ? <ShareConversionBar /> : null}
                <SharedOverviewClient
                    token={token}
                    siteUrl={share.siteUrl}
                    views={share.views}
                    embedMode={isEmbed}
                    config={share.config}
                    hideOwnerLogo={hideOwnerLogo}
                />
                {!isEmbed ? <SharePromoPopup autoOpenDelayMs={PROMO_POPUP_DELAY_MS} /> : null}
            </>
        );
    }

    if (share.config.layoutMode === 'umami_fork') {
        return (
            <>
                {showConversionBar ? <ShareConversionBar /> : null}
                <SharedUmamiClient
                    token={token}
                    siteUrl={share.siteUrl}
                    views={share.views}
                    embedMode={isEmbed}
                />
                {!isEmbed ? <SharePromoPopup autoOpenDelayMs={PROMO_POPUP_DELAY_MS} /> : null}
            </>
        );
    }

    if (isEmbed) {
        return (
            <SharePage>
                <main className={`${SHARE_CONTAINER} py-4`}>
                    <SharedDashboardClient
                        token={token}
                        config={share.config}
                        siteUrl={share.siteUrl}
                        views={share.views}
                    />
                </main>
            </SharePage>
        );
    }

    return (
        <SharePage>
            {showConversionBar ? <ShareConversionBar /> : null}
            <ShareHeader siteUrl={share.siteUrl} views={share.views} />
            <main className={`${SHARE_CONTAINER} py-6`}>
                {/* Client component handles data fetching, range selection, and rendering */}
                <SharedDashboardClient
                    token={token}
                    config={share.config}
                    siteUrl={share.siteUrl}
                    views={share.views}
                />
            </main>
            <ShareFooter />
            <SharePromoPopup autoOpenDelayMs={PROMO_POPUP_DELAY_MS} />
        </SharePage>
    );
}
