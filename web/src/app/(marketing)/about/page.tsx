import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `About ${BRAND_NAME} — AI-Powered Growth Intelligence Platform`,
    description:
        `${BRAND_NAME} is an AI-powered growth intelligence platform that connects to Google Analytics & Search Console to deliver real-time insights, SEO recommendations, and automated fixes.`,
    alternates: { canonical: '/about' },
    openGraph: {
        title: `About ${BRAND_NAME} — AI-Powered Growth Intelligence Platform`,
        description:
            `Learn how ${BRAND_NAME} uses AI to democratize access to advanced analytics and SEO tools through a simple, conversational interface.`,
        url: '/about',
    },
};

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-black text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="mb-8">
                    <ol className="flex items-center gap-2 text-sm text-zinc-400">
                        <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li className="text-white font-medium">About</li>
                    </ol>
                </nav>

                <h1 className="text-4xl font-bold mb-4">About TrafficClaw</h1>
                <p className="text-zinc-500 mb-8">The AI-powered growth intelligence platform for modern teams.</p>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mt-2 mb-4">Our Mission</h2>
                        <p>
                            {BRAND_NAME} is an AI-powered growth intelligence platform designed to help website owners
                            monitor, analyze, and improve their online presence. We believe that advanced analytics and
                            SEO tools shouldn&apos;t be reserved for enterprises with dedicated data teams.
                        </p>
                        <p className="mt-4">
                            Our mission is to democratize access to these tools by providing a simple, conversational
                            interface that works where you already do — in your browser, your dashboard, or even
                            Telegram.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mt-12 mb-4">What We Do</h2>
                        <p>
                            We connect directly to your Google Analytics 4 and Search Console data to provide
                            real-time insights, actionable recommendations, and automated fixes for common SEO issues.
                            Our platform offers:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-4">
                            <li><strong className="text-white">Real-time Analytics Dashboard</strong> — GA4 data with traffic trends, source breakdowns, and page-level metrics.</li>
                            <li><strong className="text-white">SEO Intelligence</strong> — Keyword rankings, CTR optimization, striking distance opportunities, and position tracking from Search Console.</li>
                            <li><strong className="text-white">AI Chat Assistant</strong> — Ask questions about your data in plain English and get data-backed answers with actionable recommendations.</li>
                            <li><strong className="text-white">Comprehensive Site Audit</strong> — Over 100 technical SEO checks with prioritized issues and fix suggestions.</li>
                            <li><strong className="text-white">Smart Alerts</strong> — Proactive anomaly detection for traffic drops, ranking changes, and SEO issues.</li>
                            <li><strong className="text-white">AI SEO Tools</strong> — Schema markup generator, blog outline creator, keyword clustering, and internal link finder.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mt-12 mb-4">Our Technology</h2>
                        <p>
                            Built on top of advanced large language models (including Google&apos;s Gemini), {BRAND_NAME}
                            understands natural language queries about your data and can execute complex analysis tasks
                            that would normally require a data scientist. Our platform is built with:
                        </p>
                        <ul className="list-disc pl-6 space-y-2 mt-4">
                            <li><strong className="text-white">Next.js &amp; React</strong> — A fast, server-rendered dashboard that loads in under 2 seconds.</li>
                            <li><strong className="text-white">Real-time Streaming</strong> — AI responses stream in real-time using Server-Sent Events for an instant, conversational experience.</li>
                            <li><strong className="text-white">Enterprise Security</strong> — OAuth 2.0 authentication, encrypted token storage, and strict data isolation between users.</li>
                            <li><strong className="text-white">Per-user Containers</strong> — Each Pro user gets an isolated Telegram bot container for maximum privacy and reliability.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mt-12 mb-4">Built for Growth Teams</h2>
                        <p>
                            Whether you&apos;re a solo founder tracking your side project, a content creator optimizing
                            for discoverability, a marketing team scaling paid and organic channels, or an e-commerce
                            brand monitoring revenue attribution — {BRAND_NAME} adapts to your workflow and delivers
                            insights that matter.
                        </p>
                    </section>

                    {/* Cross-links */}
                    <div className="mt-12 pt-8 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Link
                            href="/features"
                            className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-all group"
                        >
                            <div>
                                <div className="text-sm font-semibold text-white">Explore Features</div>
                                <div className="text-xs text-zinc-500">See everything TrafficClaw offers</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                        </Link>
                        <Link
                            href="/pricing"
                            className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-all group"
                        >
                            <div>
                                <div className="text-sm font-semibold text-white">View Pricing</div>
                                <div className="text-xs text-zinc-500">Simple plans starting at $9/mo</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
