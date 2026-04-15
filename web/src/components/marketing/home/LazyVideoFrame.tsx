'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

interface LazyVideoFrameProps {
    src: string;
    title: string;
    posterSrc?: string;
    className?: string;
    videoClassName?: string;
    viewportClassName?: string;
    chromeLabel?: string;
    chromeMeta?: string;
    children?: ReactNode;
}

export default function LazyVideoFrame({
    src,
    title,
    posterSrc,
    className = '',
    videoClassName = 'object-contain',
    viewportClassName = '',
    chromeLabel,
    chromeMeta,
    children,
}: LazyVideoFrameProps) {
    const [mounted, setMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setMounted(true);
                observer.disconnect();
            },
            { rootMargin: '260px' },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={`relative isolate overflow-hidden rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-3 shadow-[0_34px_100px_rgba(0,0,0,0.44)] ${className}`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(122,217,218,0.1),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_40%)]" />

            <div className="relative flex h-full flex-col rounded-[28px] border border-white/[0.08] bg-[#030406] p-3 sm:p-4">
                <div className="flex items-center gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 sm:px-4">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                        <span className="h-2.5 w-2.5 rounded-full bg-white/16" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#14C4E1]/70" />
                    </div>

                    <div className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-black/30 px-3 py-1.5 text-center text-[11px] text-zinc-300">
                        <span className="block truncate">{chromeLabel ?? title}</span>
                    </div>

                    <div className="hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#dff9ff] sm:inline-flex">
                        {chromeMeta ?? 'Autoplay demo'}
                    </div>
                </div>

                <div
                    className={`relative mt-3 flex-1 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_38%),linear-gradient(180deg,#050608_0%,#020304_100%)] ${viewportClassName}`}
                >
                    {mounted ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,6,9,0.64),rgba(2,3,4,0.92))] p-3 sm:p-4">
                            <video
                                autoPlay
                                loop
                                muted
                                playsInline
                                preload="metadata"
                                poster={posterSrc}
                                aria-label={title}
                                className={`h-full w-full bg-[#020304] ${videoClassName}`}
                            >
                                <source src={src} type="video/mp4" />
                            </video>
                        </div>
                    ) : (
                        <div className="absolute inset-0">
                            {children}
                        </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(180deg,transparent,rgba(1,2,3,0.3)_55%,rgba(1,2,3,0.72))]" />
                </div>
            </div>
        </div>
    );
}
