import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentPage, CrossLinks, Prose } from '@/components/marketing/site/ContentPage';
import { BRAND_NAME } from '@/lib/brand';

const TITLE = 'Privacy Policy';
const DESCRIPTION = `How ${BRAND_NAME} collects, uses and protects your data, including Google user data (Limited Use), the public leaderboard and AI apps you connect through MCP.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/privacy' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/privacy' },
    twitter: { card: 'summary', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function PrivacyPage() {
    return (
        <ContentPage
            crumb="Privacy"
            title={TITLE}
            meta={<>Last updated: <time dateTime="2026-10-26">October 26, 2026</time></>}
            footer={<CrossLinks links={[{ label: 'Terms of Service', href: '/terms' }, { label: 'Contact', href: '/contact' }]} />}
        >
            <Prose>
                <h2>1. Introduction</h2>
                <p>
                    {BRAND_NAME} (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy
                    Policy explains how we collect, use, share and safeguard your information when you use our website and services.
                </p>

                <h2>2. Information we collect</h2>
                <ul>
                    <li><strong>Account information:</strong> your name, email address and profile picture from the provider you sign in with.</li>
                    <li>
                        <strong>Google user data:</strong> data from the Google Analytics and Search Console accounts you authorise, with
                        read-only access only. This includes aggregate metrics (such as users, sessions, page views, key events, clicks,
                        impressions and average position) broken down by date, page path, search query, country, device and traffic
                        channel, and the list of properties and sites you can access.
                    </li>
                    <li>
                        <strong>Content you create:</strong> dashboards, leaderboard profiles and their settings, questions you ask in
                        the built-in Ask chat, and messages you send us through the contact form.
                    </li>
                    <li>
                        <strong>Billing information:</strong> payments are processed by our payment provider, Dodo Payments. We receive
                        your email address and plan status, not your full card details.
                    </li>
                    <li>
                        <strong>Website usage:</strong> we use Google Analytics and Microsoft Clarity on our own website to understand how
                        it is used.
                    </li>
                </ul>

                <h2>3. Google user data</h2>
                <p>
                    {BRAND_NAME} uses your Google Analytics and Search Console data only to provide the features you use: your portfolio,
                    site pages, dashboards, alerts, the leaderboard profiles you publish, the Ask chat and the AI apps you connect.
                </p>
                <ul>
                    <li><strong>Access:</strong> we only access data you explicitly grant permission for, with read-only scopes. We never change anything in your Google accounts.</li>
                    <li>
                        <strong>Data sharing and disclosure:</strong> we do <strong>not</strong> sell your Google user data, and we do not
                        share it with advertisers or data brokers. We disclose it only when you direct us to, as described in sections 4,
                        5 and 6 (the public leaderboard, the Ask chat and AI apps you connect), or where required by law.
                    </li>
                    <li><strong>AI models:</strong> we do not use your Google user data to train AI models, ours or anyone else&apos;s.</li>
                    <li>
                        <strong>Data retention and deletion:</strong> we retain Google user data only while your account is active and as
                        long as needed to provide the service. You can request deletion at any time by emailing{' '}
                        <a href="mailto:privacy@trafficclaw.com">privacy@trafficclaw.com</a> or by revoking {BRAND_NAME}&apos;s access in your
                        Google Account security settings. After a deletion request or account closure, all associated Google user data is
                        permanently removed from our databases within 30 days.
                    </li>
                    <li>
                        <strong>Limited Use:</strong> {BRAND_NAME}&apos;s use and transfer to any other app of information received from Google
                        APIs will adhere to the{' '}
                        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
                            Google API Services User Data Policy
                        </a>
                        , including the Limited Use requirements.
                    </li>
                </ul>

                <h2>4. Public leaderboard</h2>
                <p>
                    The leaderboard is opt-in. Nothing about your sites is public unless you add a site to it yourself. When you do, the
                    information you choose to publish (for example the site name, URL, description, category, verification status and
                    the metrics you set to public) is shown on our website to anyone, may be indexed by search engines, and can be shared
                    or embedded by others.
                </p>
                <ul>
                    <li>For each metric you choose whether it is shown exactly, as a range, or hidden. Sections such as top pages, search queries and countries stay hidden unless you turn them on.</li>
                    <li>You can pause a listing or delete your profile at any time. Copies that others have already saved, shared or embedded are outside our control.</li>
                    <li>Enquiries that visitors send through your profile (for example about sponsorships or acquisition) are stored and passed on to you.</li>
                </ul>

                <h2>5. Ask (built-in AI chat)</h2>
                <p>
                    When you ask a question in the Ask chat, the question and the data needed to answer it are sent to an AI model
                    provider (currently Google&apos;s Gemini API) to generate the answer. Conversations are stored with your account so the
                    chat can show your history and keep context between questions.
                </p>

                <h2>6. AI apps you connect (MCP)</h2>
                <p>
                    You can connect AI apps such as ChatGPT or Claude to {BRAND_NAME} through our Model Context Protocol (MCP) server or a
                    personal API key. When you do:
                </p>
                <ul>
                    <li>
                        We send the AI app only the data it requests on your behalf, for the sites you approved: aggregate Analytics and
                        Search Console metrics, page paths and search queries. We do not send your email address, user IDs, IP addresses or
                        visitor-level data.
                    </li>
                    <li>
                        The AI app&apos;s provider (for example OpenAI or Anthropic) processes that data under its own terms and privacy
                        policy. We do not control what it does with the data.
                    </li>
                    <li>
                        Access starts only after you approve the connection, and you can revoke it at any time from your dashboard.
                        Revoking stops further access immediately.
                    </li>
                    <li>
                        We keep connection tokens until they expire or you revoke them, a log of tool calls without their results for up to
                        30 days, and short-lived caches of results for a few minutes.
                    </li>
                </ul>

                <h2>7. Data security</h2>
                <p>
                    All connections to {BRAND_NAME} are encrypted with TLS. OAuth tokens are stored encrypted, and data is kept separate
                    for each user. No method of transmission or storage is completely secure, but we work to protect your data.
                </p>

                <h2>8. Your choices</h2>
                <ul>
                    <li>Revoke {BRAND_NAME}&apos;s access to Google at any time in your Google Account security settings.</li>
                    <li>Change what your leaderboard profile shows, pause it or delete it from your dashboard.</li>
                    <li>Disconnect AI apps and delete personal API keys from your dashboard.</li>
                    <li>Ask us to access, correct or delete your data at <a href="mailto:privacy@trafficclaw.com">privacy@trafficclaw.com</a>.</li>
                </ul>

                <h2>9. Changes to this policy</h2>
                <p>
                    We may update this policy from time to time. We will change the date at the top of this page, and tell signed-in users
                    about significant changes.
                </p>

                <h2>10. Contact us</h2>
                <p>
                    Questions about this Privacy Policy: <a href="mailto:privacy@trafficclaw.com">privacy@trafficclaw.com</a>, or use the{' '}
                    <Link href="/contact">contact form</Link>.
                </p>
            </Prose>
        </ContentPage>
    );
}
