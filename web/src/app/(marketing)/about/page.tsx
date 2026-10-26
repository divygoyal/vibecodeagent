import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentPage, CrossLinks, Prose } from '@/components/marketing/site/ContentPage';
import { FinalCta } from '@/components/marketing/site/FinalCta';
import { BRAND_NAME } from '@/lib/brand';

const TITLE = `About ${BRAND_NAME}`;
const DESCRIPTION = `${BRAND_NAME} puts every site you own on one screen, free: Google Analytics 4 and Search Console in one portfolio, dashboards, a verified traffic leaderboard and a ChatGPT and Claude connector.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/about' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/about' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function AboutPage() {
    return (
        <>
            <ContentPage
                crumb="About"
                title={TITLE}
                lead="All your sites. One screen. Free."
                footer={<CrossLinks links={[{ label: 'See the live demo', href: '/demo' }, { label: 'Pricing', href: '/pricing' }, { label: 'Contact', href: '/contact' }]} />}
            >
                <Prose>
                    <h2>What {BRAND_NAME} is</h2>
                    <p>
                        {BRAND_NAME} connects to Google Analytics 4 and Google Search Console with read-only access and shows every
                        site you own in one portfolio: clicks, impressions, visitors, what changed, and what dropped. From there you
                        can build dashboards and share them, publish verified traffic on a public leaderboard, and ask ChatGPT or
                        Claude about your numbers.
                    </p>

                    <h2>Who it is for</h2>
                    <p>
                        Founders, indie makers, bloggers, SEOs and agencies who look after more than one site and are tired of
                        switching between properties in Google&apos;s own tools.
                    </p>

                    <h2>What we believe</h2>
                    <ul>
                        <li><strong>Free means free.</strong> No site limit and no feature gates. The only paid thing is extra Ask messages in our built-in AI chat.</li>
                        <li><strong>Read-only, always.</strong> {BRAND_NAME} never changes anything in your Analytics or Search Console.</li>
                        <li><strong>Honest numbers.</strong> Data comes straight from Google. To rank on the leaderboard, you have to be a verified owner of the site in Search Console.</li>
                        <li><strong>Your data, your call.</strong> You decide what is public, which AI apps can read your numbers, and you can revoke either at any time.</li>
                    </ul>

                    <h2>How {BRAND_NAME} makes money</h2>
                    <p>
                        Two ways, both optional for you: paid plans that add Ask messages (see <Link href="/pricing">pricing</Link>), and
                        sponsor slots on the public leaderboard, which are always labelled “Sponsored”. We do not sell data.
                    </p>

                    <h2>How it is built</h2>
                    <p>
                        A Next.js and React web app on the official Google Analytics and Search Console APIs. The built-in Ask chat uses
                        Google&apos;s Gemini models, and the ChatGPT and Claude connector is a hosted server for the Model Context
                        Protocol (MCP).
                    </p>

                    <h2>Get in touch</h2>
                    <p>
                        Questions, ideas or bugs: use the <Link href="/contact">contact form</Link> or find us on X at{' '}
                        <a href="https://x.com/devdivygoyal" target="_blank" rel="noopener noreferrer">@devdivygoyal</a>.
                    </p>
                </Prose>
            </ContentPage>
            <FinalCta />
        </>
    );
}
