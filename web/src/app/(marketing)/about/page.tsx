"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="inline-flex items-center text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold mb-8">About TrafficClaw</h1>

                <div className="space-y-6 text-zinc-300 leading-relaxed">
                    <p>
                        TrafficClaw is an AI-powered growth intelligence platform designed to help website owners monitor, analyze, and improve their online presence.
                    </p>

                    <p>
                        Our mission is to democratize access to advanced analytics and SEO tools by providing a simple, conversational interface that lives where you do—in your chat app.
                    </p>

                    <h2 className="text-2xl font-semibold text-white mt-12 mb-4">What We Do</h2>
                    <p>
                        We connect directly to your Google Analytics and Search Console data to provide real-time insights, actionable recommendations, and automated fixes for common SEO issues.
                    </p>

                    <h2 className="text-2xl font-semibold text-white mt-12 mb-4">Our Technology</h2>
                    <p>
                        Built on top of advanced large language models, TrafficClaw understands natural language queries about your data and can execute complex analysis tasks that would normally require a data scientist.
                    </p>
                </div>
            </div>
        </div>
    );
}
