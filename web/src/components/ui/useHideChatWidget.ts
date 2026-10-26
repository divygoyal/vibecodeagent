'use client';

import { useEffect } from 'react';

type TawkApi = { hideWidget?: () => void; showWidget?: () => void; onLoad?: () => void };

let openSheets = 0;

function tawk(): TawkApi | undefined {
    return typeof window === 'undefined' ? undefined : (window as unknown as { Tawk_API?: TawkApi }).Tawk_API;
}

/**
 * Hide the Tawk.to chat bubble while a Modal, Drawer or sheet is open. The
 * bubble sits above every layer (max z-index) and on phones covers the bottom
 * corner of bottom sheets, where it swallows taps on footer buttons and on
 * Select options. Counted, so nested sheets show it again only when the last
 * one closes.
 */
export function useHideChatWidget(open: boolean): void {
    useEffect(() => {
        if (!open) return;
        openSheets += 1;
        const api = tawk();
        try {
            if (api?.hideWidget) api.hideWidget();
            else if (api) {
                // Script still loading: hide it as soon as it is ready if a sheet is still open.
                const prev = api.onLoad;
                api.onLoad = () => {
                    prev?.();
                    if (openSheets > 0) api.hideWidget?.();
                };
            }
        } catch { /* widget not ready */ }
        return () => {
            openSheets = Math.max(0, openSheets - 1);
            if (openSheets === 0) {
                try { tawk()?.showWidget?.(); } catch { /* widget not ready */ }
            }
        };
    }, [open]);
}
