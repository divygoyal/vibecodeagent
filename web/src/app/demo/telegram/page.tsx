"use client";

import { TelegramChatSimulation } from "@/components/TelegramChatSimulation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function DemoPage() {
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
                        Live Preview
                    </div>
                    <p className="text-xs text-gray-500 font-mono hidden sm:block">
                        /demo/telegram-bot
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
                        <p className="text-sm text-gray-500 mb-4 font-medium uppercase tracking-wider">Why we use code over video:</p>
                        <ul className="space-y-3">
                            {[
                                "0MB file size (Instant load times)",
                                "Perfectly crisp text on retina displays",
                                "Fully responsive and mobile-friendly",
                            ].map((feature, i) => (
                                <li key={i} className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                    {feature}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Right Side: The Simulation Component */}
                <div className="order-1 lg:order-2 flex justify-center lg:justify-end relative">

                    {/* Decorative Glow Elements */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-tr from-purple-500/20 via-transparent to-cyan-500/20 rounded-full blur-3xl -z-10" />

                    {/* Refresh Button to replay animation */}
                    <div className="absolute -right-4 top-1/2 -translate-y-1/2 hidden xl:flex flex-col items-center gap-2">
                        <button
                            onClick={() => window.location.reload()}
                            className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all group"
                            title="Replay Animation"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="group-hover:rotate-180 transition-transform duration-500"
                            >
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                        </button>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold [writing-mode:vertical-rl] rotate-180 mt-2">
                            Replay Demo
                        </span>
                    </div>

                    <div className="transform hover:scale-[1.02] transition-transform duration-500 shadow-2xl shadow-purple-900/20 rounded-[3rem]">
                        <TelegramChatSimulation />
                    </div>
                </div>
            </div>
        </div>
    );
}
