import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy | TrafficClaw',
    description:
        'Learn how TrafficClaw collects, uses, and protects your data. We adhere to Google API Services User Data Policy including Limited Use requirements.',
    alternates: { canonical: '/privacy' },
    openGraph: {
        title: 'Privacy Policy | TrafficClaw',
        description: 'How TrafficClaw handles your data — Google API compliance, data retention, and security practices.',
        url: '/privacy',
    },
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-black text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                {/* Breadcrumb */}
                <nav aria-label="Breadcrumb" className="mb-8">
                    <ol className="flex items-center gap-2 text-sm text-zinc-400">
                        <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
                        <li aria-hidden="true">/</li>
                        <li className="text-white font-medium">Privacy Policy</li>
                    </ol>
                </nav>

                <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
                <p className="text-zinc-500 mb-8">
                    Last updated: <time dateTime="2026-02-25">February 25, 2026</time>
                </p>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
                        <p>
                            TrafficClaw (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our website and services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">2. Information We Collect</h2>
                        <p className="mb-4">We collect information needed to provide our services:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Account Information:</strong> Name, email address, and profile picture from your authentication provider (Google/GitHub).</li>
                            <li><strong>Usage Data:</strong> Analytics data from your connected Google Analytics and Search Console accounts (only as authorized by you).</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">3. Google User Data</h2>
                        <p className="mb-4">
                            TrafficClaw accesses your Google Analytics and Search Console data solely to provide you with insights and analysis.
                        </p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li><strong>Access:</strong> We only access data you explicitly grant permissions for.</li>
                            <li><strong>Data Retention and Deletion:</strong> We securely retain Google user data only for as long as your account is active and necessary to provide our core features. You may request the complete deletion of your data at any time by contacting us at privacy@trafficclaw.com or by revoking the application&apos;s access in your Google Account security settings. Upon a deletion request or account closure, all associated Google user data is permanently removed from our databases within 30 days.</li>
                            <li><strong>Data Sharing and Disclosure:</strong> We do <strong>not</strong> share, transfer, sell, or disclose your Google user data to any third parties, affiliates, advertisers, or external data brokers. Your data is used strictly to provide the requested service directly to you.</li>
                            <li><strong>AI Models:</strong> We explicitly do not share or use your Google user data with third-party or internal AI models for training purposes.</li>
                            <li><strong>Limited Use:</strong> Our use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">4. Data Security</h2>
                        <p>
                            We implement industry-standard security measures to protect your data. All connections are encrypted via SSL/TLS. Sensitive tokens are stored using military-grade encryption.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">5. Contact Us</h2>
                        <p>
                            If you have any questions about this Privacy Policy, please contact us at{' '}
                            <a href="mailto:privacy@trafficclaw.com" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                                privacy@trafficclaw.com
                            </a>.
                        </p>
                    </section>
                </div>

                {/* Cross-links */}
                <div className="mt-12 pt-8 border-t border-white/[0.06] flex items-center gap-6 text-sm">
                    <Link href="/terms" className="text-zinc-400 hover:text-white transition-colors">
                        Terms of Service &rarr;
                    </Link>
                    <Link href="/about" className="text-zinc-400 hover:text-white transition-colors">
                        About Us &rarr;
                    </Link>
                </div>
            </div>
        </div>
    );
}
