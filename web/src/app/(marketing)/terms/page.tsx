"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="inline-flex items-center text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
                <p className="text-zinc-500 mb-8">Last updated: February 18, 2026</p>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using TrafficClaw, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
                        <p>
                            TrafficClaw provides AI-powered analytics and SEO insights via a web dashboard and Telegram bot interface. We reserve the right to modify or discontinue the service at any time.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">3. User Accounts</h2>
                        <p>
                            You are responsible for maintaining the security of your account and any API keys or tokens associated with it. You engage with the service at your own risk.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">4. Acceptable Use</h2>
                        <p>
                            You agree not to misuse the service or help anyone else do so. This includes not probing, scanning, or testing the vulnerability of any system or network.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">5. Disclaimer</h2>
                        <p>
                            The service is provided "as is" without warranties of any kind. We generally do not guarantee that the service will meet your specific requirements or be uninterrupted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">6. Contact</h2>
                        <p>Questions about the Terms of Service should be sent to us at support@trafficclaw.com.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
