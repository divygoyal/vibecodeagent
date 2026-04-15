'use client';

import { useRef, useEffect, useState, ReactNode } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';

export function JourneyNode({
    number,
    children,
}: {
    number: number;
    children: ReactNode;
}) {
    const [active, setActive] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
                    setActive(true);
                } else if (entry.boundingClientRect.top > 0) {
                    setActive(false);
                }
            },
            { threshold: [0, 0.4, 1] }
        );

        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className="relative pl-12 sm:pl-16 lg:pl-24">
            <div
                className={`absolute left-4 top-16 z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-500 sm:left-6 lg:left-8 ${
                    active
                        ? 'border-[#14C4E1] bg-[#14C4E1] shadow-[0_0_16px_rgba(20,196,225,0.4)]'
                        : 'border-white/[0.15] bg-[#0a0c0f] shadow-[0_0_12px_rgba(0,0,0,0.5)]'
                }`}
            >
                {active ? (
                    <motion.svg
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[#031017]"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                ) : (
                    <span className="text-[10px] font-bold text-white transition-colors delay-100">
                        {number}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

export function JourneyLine({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ['start center', 'end center'],
    });

    const scaleY = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001,
    });

    return (
        <div ref={ref} className="relative mt-14">
            {/* Background Line */}
            <div className="absolute bottom-16 left-4 top-16 w-[1px] bg-white/[0.08] sm:left-6 lg:left-8" />

            {/* Active Scrolling Line */}
            <motion.div
                className="absolute left-4 top-16 w-[1px] origin-top bg-gradient-to-b from-[#14C4E1]/80 to-[#7AD9DA] sm:left-6 lg:left-8"
                style={{ scaleY, bottom: '4rem' }}
            />

            <div className="space-y-12 lg:space-y-16">{children}</div>
        </div>
    );
}
