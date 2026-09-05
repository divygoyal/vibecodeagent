import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Terms of Service | ${BRAND_NAME}`,
    description:
        `Terms of Service for ${BRAND_NAME} — AI-powered analytics and SEO platform. Read about acceptable use, user accounts, and service terms.`,
    alternates: { canonical: '/terms' },
    openGraph: {
        title: `Terms of Service | ${BRAND_NAME}`,
        description: `Terms governing use of the ${BRAND_NAME} platform and services.`,
        url: '/terms',
    },
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-black text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="mb-8">
                    <ol className="flex items-center gap-2 text-sm text-zinc-400">
                        <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li className="text-white font-medium">Terms of Service</li>
                    </ol>
                </nav>

                <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
                <p className="text-zinc-500 mb-8">
                    Last updated: <time dateTime="2026-02-18">February 18, 2026</time>
                </p>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using {BRAND_NAME}, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">2. Description of Service</h2>
                        <p>
                            {BRAND_NAME} provides AI-powered analytics and SEO insights via a web dashboard and Telegram bot interface. We reserve the right to modify or discontinue the service at any time.
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
                            The service is provided &quot;as is&quot; without warranties of any kind. We generally do not guarantee that the service will meet your specific requirements or be uninterrupted.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">6. Contact</h2>
                        <p>
                            Questions about the Terms of Service should be sent to us at{' '}
                            <a href="mailto:support@trafficclaw.com" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                                support@trafficclaw.com
                            </a>.
                        </p>
                    </section>
                </div>

                {/* Cross-links */}
                <div className="mt-12 pt-8 border-t border-white/[0.06] flex items-center gap-6 text-sm">
                    <Link href="/privacy" className="text-zinc-400 hover:text-white transition-colors">
                        Privacy Policy &rarr;
                    </Link>
                    <Link href="/about" className="text-zinc-400 hover:text-white transition-colors">
                        About Us &rarr;
                    </Link>
                </div>
            </div>
        </div>
    );
}
