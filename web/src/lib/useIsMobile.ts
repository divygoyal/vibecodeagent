'use client';

import { useEffect, useState } from 'react';

/**
 * useIsMobile — SSR-safe hook that tracks `(max-width: 767px)`.
 *
 * Returns `false` during SSR / first render so server and client agree, then
 * flips to the real value after mount. Use sparingly: Tailwind responsive
 * prefixes handle most styling; this hook is for cases where mobile and
 * desktop need different *components* mounted (e.g. MobileOverviewAppShell
 * vs the desktop overview, or a touch-friendly fallback for HTML5 DnD).
 */
export function useIsMobile(query = '(max-width: 767px)') {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia(query);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, [query]);

    return isMobile;
}
