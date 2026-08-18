'use client';

import { useEffect, useRef, useState } from 'react';

interface DeferredEmbedProps {
    src: string;
    title: string;
    className?: string;
    iframeClassName?: string;
    mountStrategy?: 'idle' | 'visible';
    interactive?: boolean;
    openHref?: string;
    openLabel?: string;
    children?: React.ReactNode;
}

export default function DeferredEmbed({
    src,
    title,
    className = '',
    iframeClassName = '',
    mountStrategy = 'visible',
    interactive = true,
    openHref,
    openLabel,
    children,
}: DeferredEmbedProps) {
    const [mounted, setMounted] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (mountStrategy === 'idle') {
            if (typeof window === 'undefined') return;

            const idleWindow = window as Window & {
                requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
                cancelIdleCallback?: (handle: number) => void;
            };
            let timeoutId: number | undefined;
            let idleId: number | undefined;

            const start = () => setMounted(true);

            if (idleWindow.requestIdleCallback) {
                idleId = idleWindow.requestIdleCallback(start, { timeout: 1400 });
            } else {
                timeoutId = window.setTimeout(start, 420);
            }

            return () => {
                if (idleId !== undefined && idleWindow.cancelIdleCallback) {
                    idleWindow.cancelIdleCallback(idleId);
                }
                if (timeoutId !== undefined) {
                    window.clearTimeout(timeoutId);
                }
            };
        }

        const node = ref.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setMounted(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '220px' },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [mountStrategy]);

    return (
        <div ref={ref} className={`relative isolate overflow-hidden ${className}`}>
            {mounted ? (
                <iframe
                    src={src}
                    title={title}
                    loading="lazy"
                    allow="fullscreen"
                    className={`absolute inset-0 h-full w-full border-0 ${interactive ? '' : 'pointer-events-none'} ${iframeClassName}`}
                />
            ) : (
                <div className="absolute inset-0">
                    {children}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,196,225,0.08),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_28%,rgba(255,255,255,0.01))]" />
                </div>
            )}

            {openHref && openLabel ? (
                <a
                    href={openHref}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 z-10 flex items-end bg-[linear-gradient(180deg,transparent_40%,rgba(1,5,11,0.84)_100%)] p-4 sm:p-5"
                >
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#14C4E1]/24 bg-[#08131b]/88 px-3 py-2 text-xs font-medium text-[#dff9ff] shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                        {openLabel}
                        <span className="text-[#7AD9DA]">↗</span>
                    </span>
                </a>
            ) : null}
        </div>
    );
}
