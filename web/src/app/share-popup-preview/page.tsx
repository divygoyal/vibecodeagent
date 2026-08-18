'use client';

/**
 * Throwaway preview route for SharePromoPopup. Lets us iterate on the
 * design without wiring it into the share view yet. Delete or gate this
 * once the popup ships to the real /share/[token] flow.
 */

import { useState } from 'react';
import SharePromoPopup from '@/components/share/SharePromoPopup';

export default function SharePromoPreviewPage() {
    const [reopenKey, setReopenKey] = useState(0);

    return (
        <main className="min-h-screen bg-[#050507] px-6 py-16 text-zinc-100">
            <div className="mx-auto max-w-2xl text-center">
                <h1 className="mb-3 text-2xl font-semibold text-white">
                    SharePromoPopup preview
                </h1>
                <p className="mb-6 text-sm text-zinc-500">
                    Click below to re-open the popup. Production will mount it inside the
                    full /share/[token] page (not in iframes/embeds).
                </p>
                <button
                    type="button"
                    onClick={() => setReopenKey((k) => k + 1)}
                    className="rounded-full border border-white/[0.1] bg-white/[0.04] px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/[0.18] hover:bg-white/[0.08]"
                >
                    Re-open popup
                </button>
            </div>
            <SharePromoPopup key={reopenKey} initialOpen />
        </main>
    );
}
