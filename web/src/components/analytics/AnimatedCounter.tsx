'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
    value: number;
    duration?: number;
    className?: string;
    formatter?: (n: number) => string;
}

export default function AnimatedCounter({ value, duration = 800, className = '', formatter }: AnimatedCounterProps) {
    const [display, setDisplay] = useState(value);
    const prev = useRef(value);
    const raf = useRef<number>(0);

    useEffect(() => {
        const start = prev.current;
        const diff = value - start;
        if (diff === 0) return;

        const startTime = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + diff * eased);
            setDisplay(current);

            if (progress < 1) {
                raf.current = requestAnimationFrame(animate);
            } else {
                prev.current = value;
            }
        };

        raf.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf.current);
    }, [value, duration]);

    const formatted = formatter ? formatter(display) : display.toLocaleString();

    return <span className={className}>{formatted}</span>;
}
