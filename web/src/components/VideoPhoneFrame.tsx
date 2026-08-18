"use client";

import { useRef, useState, useEffect } from "react";

export function VideoPhoneFrame() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: "200px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative mx-auto w-[220px] sm:w-[240px] lg:w-[260px] aspect-[9/19.5] p-[4px] rounded-[2.5rem] bg-[#1a1a1a] shadow-2xl border border-white/10 mb-8 sm:mb-0 transition-transform duration-700 hover:scale-[1.02]"
        >
            {/* Screen container */}
            <div className="relative w-full h-full overflow-hidden rounded-[2.2rem] bg-black">
                {isVisible ? (
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                    >
                        <source src="/telegram-demo-final.mp4" type="video/mp4" />
                    </video>
                ) : (
                    <div className="w-full h-full bg-zinc-900" />
                )}
            </div>
        </div>
    );
}
