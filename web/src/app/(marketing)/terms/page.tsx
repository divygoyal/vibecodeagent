import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentPage, CrossLinks, Prose } from '@/components/marketing/site/ContentPage';
import { BRAND_NAME } from '@/lib/brand';

const TITLE = 'Terms of Service';
const DESCRIPTION = `The terms that govern your use of ${BRAND_NAME}: accounts, acceptable use, public leaderboard content, connected AI apps and paid plans.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/terms' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/terms' },
    twitter: { card: 'summary', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function TermsPage() {
    return (
        <ContentPage
            crumb="Terms"
            title={TITLE}
            meta={<>Last updated: <time dateTime="2026-10-26">October 26, 2026</time></>}
            footer={<CrossLinks links={[{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Contact', href: '/contact' }]} />}
        >
            <Prose>
                <h2>1. Acceptance of terms</h2>
                <p>
                    By accessing or using {BRAND_NAME}, you agree to be bound by these Terms of Service. If you disagree with any part of
                    the terms, you may not access the service.
                </p>

                <h2>2. Description of service</h2>
                <p>
                    {BRAND_NAME} shows data from your Google Analytics and Search Console accounts in a portfolio of your sites and in
                    dashboards, lets you publish selected numbers on a public leaderboard, provides a built-in AI chat (Ask), and lets you
                    connect AI apps such as ChatGPT or Claude through a Model Context Protocol (MCP) server. We may modify or discontinue
                    any part of the service at any time.
                </p>

                <h2>3. User accounts</h2>
                <p>
                    You are responsible for maintaining the security of your account and of any API keys or tokens associated with it,
                    including access you grant to AI apps. You engage with the service at your own risk.
                </p>

                <h2>4. Acceptable use</h2>
                <p>
                    You agree not to misuse the service or help anyone else do so. This includes not probing, scanning, or testing the
                    vulnerability of any system or network, and not using the service or its API to get around rate limits or access data
                    you are not authorised to see.
                </p>

                <h2>5. Public leaderboard</h2>
                <ul>
                    <li>Only list sites you own or are authorised to represent.</li>
                    <li>You are responsible for the names, descriptions, links and other content you publish, and for the numbers you choose to make public.</li>
                    <li>Rankings and verification depend on data from Google and on our verification checks. We may change how ranking and verification work.</li>
                    <li>We may hide or remove listings that are misleading, infringe others&apos; rights or break these terms.</li>
                    <li>Sponsored placements are labelled as sponsored and are not part of the ranking.</li>
                </ul>

                <h2>6. Connected AI apps</h2>
                <p>
                    When you connect a third-party AI app, that app&apos;s own terms and privacy policy govern how it uses the data you
                    allow it to read. AI-generated answers, including those from the Ask chat, can be wrong; check important numbers in
                    your dashboard or in Google&apos;s tools before acting on them.
                </p>

                <h2>7. Paid plans</h2>
                <p>
                    Paid plans add Ask messages each month, are billed monthly through our payment provider, and can be cancelled at any
                    time from the Plan page. A cancelled plan stays active until the end of the period you paid for. Unused Ask messages
                    do not roll over. Current prices are on the <Link href="/pricing">pricing page</Link>.
                </p>

                <h2>8. Disclaimer</h2>
                <p>
                    The service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that the service will meet
                    your specific requirements or be uninterrupted, or that data shown by the service is complete or accurate.
                </p>

                <h2>9. Contact</h2>
                <p>
                    Questions about these Terms of Service should be sent to{' '}
                    <a href="mailto:support@trafficclaw.com">support@trafficclaw.com</a>.
                </p>
            </Prose>
        </ContentPage>
    );
}
