"use client";

import { VideoPhoneFrame } from "@/components/VideoPhoneFrame";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function DemoVideoPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center py-12 px-4 selection:bg-purple-500/30">

            {/* Top Navigation */}
            <div className="w-full max-w-5xl mb-12 flex justify-between items-center px-4">
                <Link
                    href="/"
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group"
                >
                    <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                        <ChevronLeft size={16} />
                    </div>
                    <span className="font-medium text-sm">Back to Home</span>
                </Link>

                <div className="flex items-center gap-3">
                    <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20">
                        Optimized Video Preview
                    </div>
                    <p className="text-xs text-gray-500 font-mono hidden sm:block">
                        /demo/telegram-video
                    </p>
                </div>
            </div>

            {/* Hero Section */}
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                {/* Left Side: Marketing Copy */}
                <div className="flex flex-col gap-8 order-2 lg:order-1 text-center lg:text-left">

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium w-fit mx-auto lg:mx-0 border border-purple-500/20">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                        Meet Traffic Claw
                    </div>

                    <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
                        SEO & Analytics,<br />
                        <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            Straight from your phone.
                        </span>
                    </h1>

                    <p className="text-lg text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
                        Get real-time insights, traffic drop alerts, and quick SEO wins without ever logging into a clunky dashboard. Just open Telegram and ask your personalized AI.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-4">
                        <button className="h-12 px-8 rounded-full bg-white text-black font-semibold hover:bg-gray-100 transition-colors w-full sm:w-auto">
                            Start for Free
                        </button>
                        <button className="h-12 px-8 rounded-full bg-white/5 text-white font-medium hover:bg-white/10 border border-white/10 transition-colors w-full sm:w-auto">
                            View Documentation
                        </button>
                    </div>

                    <div className="pt-8 border-t border-white/10 mt-4 text-left">
                        <p className="text-sm text-gray-500 mb-4 font-medium uppercase tracking-wider">Using the optimized video approach:</p>
                        <ul className="space-y-3">
                            {[
                                "Compressed from 13MB to ~7MB using HEVC",
                                "Wrapped in a hardware-accelerated phone frame",
                                "Plays inline on iOS devices without taking over the screen",
                                "Preload disabled so your text loads instantly first"
                            ].map((feature, i) => (
                                <li key={i} className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Right Side: The Simulation Component */}
                <div className="order-1 lg:order-2 flex justify-center lg:justify-end relative">

                    <div className="transform hover:scale-[1.02] transition-transform duration-500 shadow-2xl shadow-green-900/20 rounded-[3rem]">
                        <VideoPhoneFrame />
                    </div>
                </div>
            </div>
        </div>
    );
}
