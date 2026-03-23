"use client";

export function VideoPhoneFrame() {
    return (
        <div className="relative mx-auto w-[220px] sm:w-[240px] lg:w-[260px] aspect-[9/19.5] p-[4px] rounded-[2.5rem] bg-[#1a1a1a] shadow-2xl border border-white/10 mb-8 sm:mb-0 transition-transform duration-700 hover:scale-[1.02]">
            {/* Screen container */}
            <div className="relative w-full h-full overflow-hidden rounded-[2.2rem] bg-black">
                {/* 
                  CRITICAL PERFORMANCE TAGS: 
                  - playsInline: Prevents iOS from opening the video in fullscreen mode automatically.
                  - muted: Required for browsers to allow autoplay.
                */}
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="none"
                    className="w-full h-full object-cover"
                >
                    <source src="/telegram-demo-final.mp4" type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            </div>
        </div>
    );
}
