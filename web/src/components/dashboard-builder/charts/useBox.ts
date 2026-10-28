'use client';

import { useCallback, useLayoutEffect, useState } from 'react';

/** Width and height of an element (callback ref + ResizeObserver); 0 until measured. */
export function useBox<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
    const [el, setEl] = useState<T | null>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const ref = useCallback((node: T | null) => setEl(node), []);
    useLayoutEffect(() => {
        if (!el) return;
        const read = () => setBox({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
        read();
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, [el]);
    return [ref, box];
}
