import { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getShareData } from '@/app/api/share/route';
import SharedOverviewClient from '@/components/share-overview/openpanel/SharedOverviewClient';
import SharedUmamiClient from '@/components/share-overview/umami/SharedUmamiClient';
import SharedDashboardClient from './SharedDashboardClient';
import SharePromoPopup from '@/components/share/SharePromoPopup';
import ShareConversionBar from '@/components/share/ShareConversionBar';
import { verifyShareWatermarkSignature } from '@/lib/shareWatermark';
import { BRAND_NAME, SITE_URL, SITE_HOST } from '@/lib/brand';

// Promo popup auto-opens 20s after a viewer lands on the public share view,
// OR sooner on exit-intent (mouse leaving the top of the viewport). The
// 20s window gives them time to actually engage with the dashboard before
// being pitched; exit-intent catches bouncers who would otherwise leave
// without ever seeing the popup. Only mounts when !isEmbed — never
// injected into customer iframes where it would feel intrusive.
const PROMO_POPUP_DELAY_MS = 20000;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Shared Dashboard',
    description: `View shared analytics dashboard powered by ${BRAND_NAME}`,
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
        return (
            <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-semibold text-zinc-100 mb-2">Dashboard Not Found</h1>
                    <p className="text-sm text-zinc-500 mb-6">
                        This shared dashboard doesn&apos;t exist or has been revoked by the owner.
                    </p>
                    {!isEmbed ? (
                        <Link
                            href={SITE_URL}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-all"
                        >
                            Visit {BRAND_NAME}
                        </Link>
                    ) : null}
                </div>
            </div>
        );
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
            <div className="min-h-screen overflow-x-hidden bg-[#050507] px-3 py-3 text-zinc-100 sm:px-4 sm:py-4">
                <div className="mx-auto w-full max-w-[1500px]">
                    <SharedDashboardClient
                        token={token}
                        config={share.config}
                        siteUrl={share.siteUrl}
                        views={share.views}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050507] text-zinc-100">
            {showConversionBar ? <ShareConversionBar /> : null}
            {/* Header */}
            <header className="border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-semibold text-zinc-100">Shared Dashboard</h1>
                            <p className="text-[10px] text-zinc-600">{BRAND_NAME} Analytics</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        {share.views} views
                    </div>
                </div>
            </header>

            {/* Dashboard Content */}
            <main className="mx-auto max-w-[1500px] px-6 py-8">
                {/* Client component handles data fetching, range selection, and rendering */}
                <SharedDashboardClient
                    token={token}
                    config={share.config}
                    siteUrl={share.siteUrl}
                    views={share.views}
                />
            </main>

            {/* Footer */}
            <footer className="border-t border-white/[0.06] mt-12">
                <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-3 px-6 py-8">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                        </div>
                        <span className="text-sm font-semibold text-zinc-300">{BRAND_NAME}</span>
                    </div>
                    <p className="text-xs text-zinc-600 text-center">
                        Powered by {BRAND_NAME} — Free AI-Powered Analytics
                    </p>
                    <Link
                        href={SITE_URL}
                        className="text-xs text-emerald-500/70 hover:text-emerald-400 transition-colors"
                    >
                        {SITE_HOST}
                    </Link>
                </div>
            </footer>

            <SharePromoPopup autoOpenDelayMs={PROMO_POPUP_DELAY_MS} />
        </div>
    );
}
