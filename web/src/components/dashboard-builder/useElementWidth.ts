'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Width of an element that may mount later (callback ref + ResizeObserver). */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [el, setEl] = useState<T | null>(null);
    const [w, setW] = useState(0);
    const ref = useCallback((node: T | null) => setEl(node), []);
    useIsoLayoutEffect(() => {
        if (!el) return;
        // First width before paint (a ResizeObserver reports only after layout, sometimes after the
        // first frame): charts sized from width 0 painted a fallback size first (donut sizing race).
        const cs = getComputedStyle(el);
        const first = el.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
        if (first > 0) setW(Math.floor(first));
        const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [ref, w];
}

/** Border-box height of an element (callback ref + ResizeObserver); layout px, unaffected by transforms. */
export function useElementHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [el, setEl] = useState<T | null>(null);
    const [h, setH] = useState(0);
    const ref = useCallback((node: T | null) => setEl(node), []);
    useIsoLayoutEffect(() => {
        if (!el) return;
        setH(el.offsetHeight);
        const ro = new ResizeObserver(() => setH(el.offsetHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [ref, h];
}
