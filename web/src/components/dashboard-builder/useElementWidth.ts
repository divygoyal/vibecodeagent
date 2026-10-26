'use client';

import { useCallback, useEffect, useState } from 'react';

/** Width of an element that may mount later (callback ref + ResizeObserver). */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
    const [el, setEl] = useState<T | null>(null);
    const [w, setW] = useState(0);
    const ref = useCallback((node: T | null) => setEl(node), []);
    useEffect(() => {
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [ref, w];
}
