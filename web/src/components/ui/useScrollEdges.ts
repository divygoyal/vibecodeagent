'use client';

import { useEffect, useState } from 'react';

/**
 * Whether a horizontal scroller has more content to its right (`more`) and has been scrolled (`scrolled`), for edge
 * fades, "scroll for more" hints and sticky-column rules. Returns a callback ref (works for scrollers that mount
 * later, after data loads); re-checked on scroll and resize.
 */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>() {
    const [el, setEl] = useState<T | null>(null);
    const [edges, setEdges] = useState({ more: false, scrolled: false });
    useEffect(() => {
        if (!el) return;
        const check = () => {
            const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
            const scrolled = el.scrollLeft > 2;
            setEdges((p) => (p.more === more && p.scrolled === scrolled ? p : { more, scrolled }));
        };
        check();
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
        ro?.observe(el);
        if (el.firstElementChild) ro?.observe(el.firstElementChild);
        el.addEventListener('scroll', check, { passive: true });
        return () => {
            ro?.disconnect();
            el.removeEventListener('scroll', check);
        };
    }, [el]);
    return [setEl, edges] as const;
}
