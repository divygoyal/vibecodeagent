"use client";

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#09090b] text-white pt-24 pb-12 px-6">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="inline-flex items-center text-sm text-zinc-400 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
                <p className="text-zinc-500 mb-8">Last updated: February 18, 2026</p>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
                        <p>
                            TrafficClaw ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our website and services.
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
                            <li><strong>Data Retention and Deletion:</strong> We securely retain Google user data only for as long as your account is active and necessary to provide our core features. You may request the complete deletion of your data at any time by contacting us at privacy@trafficclaw.com or by revoking the application's access in your Google Account security settings. Upon a deletion request or account closure, all associated Google user data is permanently removed from our databases within 30 days.</li>
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
                            If you have any questions about this Privacy Policy, please contact us at privacy@trafficclaw.com.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
