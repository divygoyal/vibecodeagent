import type { Metadata } from 'next';
import Link from 'next/link';
import { Ban, ExternalLink, KeyRound, Lock, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react';

import { ContentPage, CrossLinks, Prose } from '@/components/marketing/site/ContentPage';
import { BRAND_NAME } from '@/lib/brand';

const TITLE = 'Security and data';
const DESCRIPTION = `Exactly what ${BRAND_NAME} reads from Google (read-only Analytics and Search Console scopes), what we store and how, what we never do, how to revoke access and how to delete your data.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/security' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/security' },
    twitter: { card: 'summary', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

/*
 * Every statement here is checked against the code (round 2, 2026-10-27):
 * scopes in web/src/lib/auth.ts; token encryption in admin/security/token_crypto.py
 * (key derived from ADMIN_API_KEY in production, DEPLOY.md); MCP hashing and
 * lifetimes in admin/migrations/019_add_mcp_oauth.sql, web/src/lib/mcp/config.ts and
 * admin/mcp_api.py (30-day audit log); snapshots in admin/migrations/020_add_portfolio.sql
 * and web/src/lib/portfolio/ranges.ts; caches in web/src/app/api/site/_lib/google.ts;
 * deletion in Settings > Danger zone and the privacy policy. Keep it in sync.
 */

const SUMMARY: Array<{ icon: LucideIcon; title: string; text: string }> = [
    { icon: ShieldCheck, title: 'Read-only', text: 'We can see your Analytics and Search Console data. Google will not let us change it.' },
    { icon: Lock, title: 'Encrypted or hashed', text: 'Google tokens are encrypted in our database. AI connection tokens are stored only as hashes.' },
    { icon: KeyRound, title: 'Yours to revoke', text: 'Remove our access in your Google account, or any connected AI app from Connect AI, at any time.' },
];

const SCOPES: Array<{ what: string; detail: string; scope: string }> = [
    {
        what: 'See your Google Analytics data',
        detail: 'Users, sessions, pages, channels, countries, devices and events for the GA4 properties your account can open, and the list of those properties.',
        scope: 'analytics.readonly',
    },
    {
        what: 'See your Search Console data',
        detail: 'Queries, pages, clicks, impressions, CTR and position for the sites your account can open, the list of those sites, sitemaps and URL inspection.',
        scope: 'webmasters.readonly',
    },
    {
        what: 'Know who you are',
        detail: 'Your name, email address and profile photo, to sign you in.',
        scope: 'openid email profile',
    },
];

const STORED: Array<{ what: string; why: string; kept: string }> = [
    { what: 'Your account: name, email, profile photo, plan and Ask message balance', why: 'To sign you in and run your plan', kept: 'Until you delete your account' },
    { what: 'Google access and refresh tokens, encrypted at rest', why: 'To read your data, including background syncs while you are away', kept: 'Until you delete your account; they stop working as soon as you remove our access in Google' },
    { what: 'Daily totals per property and site: users, sessions, pageviews, key events, engagement rate, clicks, impressions, CTR and position', why: 'So the portfolio opens instantly instead of waiting for Google', kept: 'Up to the last 25 months (Analytics) and 16 months (Search Console), until you delete your account' },
    { what: 'Dashboards and their versions, share links, notes, goals, funnels and the tasks you mark done or dismiss', why: 'The features you use', kept: 'Until you delete them or your account' },
    { what: 'Ask conversations and the facts Ask remembers about your sites', why: 'Chat history and context', kept: 'Until you delete your account' },
    { what: 'Connected AI apps: which sites each app may see, token and API key hashes, and a log of tool calls without their results', why: 'To check each request and show you the activity', kept: 'Tokens until they expire or you revoke them; the log for 30 days' },
    { what: 'Weekly summaries of your sites', why: 'The weekly report', kept: '26 weeks' },
    { what: 'Your leaderboard profile, only if you list a site', why: 'The public profile, with only the numbers you chose to show', kept: 'Public until you pause it; kept until you delete it' },
    { what: 'Google answers in memory', why: 'Speed, and to spare your Google quota', kept: 'A few minutes' },
];

const NEVER: string[] = [
    'Change anything in Google Analytics or Search Console. Our permissions are read-only, so Google would refuse.',
    'Ask for Gmail, Drive, Google Ads or any other Google data.',
    'Put a tracking script on your site, or ask you to.',
    'Sell your data, or share it with advertisers or data brokers.',
    'Use your Google data to train AI models, ours or anyone else’s.',
    'Publish anything about your sites unless you add a site to the leaderboard, and then only the numbers you choose.',
    'Send your email address, user IDs, IP addresses or visitor-level data to an AI app you connect.',
    'Keep AI connection tokens or API keys in a readable form. We store only their SHA-256 hashes.',
];

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
    return <h2 id={id} className="scroll-mt-24 text-heading text-fg">{children}</h2>;
}

export default function SecurityPage() {
    return (
        <ContentPage
            crumb="Security and data"
            title="Security and data"
            lead={`Exactly what ${BRAND_NAME} reads from your Google account, what we keep and how, what we never do, and how to take it all back.`}
            meta={<>Last updated: <time dateTime="2026-10-27">October 27, 2026</time></>}
            footer={<CrossLinks links={[{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms of service', href: '/terms' }, { label: 'Contact', href: '/contact' }]} />}
        >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SUMMARY.map((s) => (
                    <li key={s.title} className="rounded-card border border-border-subtle bg-surface p-4 shadow-card">
                        <s.icon aria-hidden size={18} strokeWidth={1.75} className="text-brand-text" />
                        <p className="mt-2.5 text-title-sm text-fg">{s.title}</p>
                        <p className="mt-1 text-body-sm text-fg-secondary">{s.text}</p>
                    </li>
                ))}
            </ul>

            <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
                {[
                    ['read', 'What we read'],
                    ['store', 'What we store'],
                    ['never', 'What we never do'],
                    ['others', 'Who else sees data'],
                    ['revoke', 'Revoke access'],
                    ['delete', 'Delete your data'],
                ].map(([id, label]) => (
                    <a key={id} href={`#${id}`} className="tap-area text-fg-secondary underline decoration-border-strong underline-offset-4 hover:text-fg">
                        {label}
                    </a>
                ))}
            </nav>

            <section aria-labelledby="read" className="mt-12">
                <SectionTitle id="read">What we read</SectionTitle>
                <p className="mt-4 text-body-lg text-fg-secondary">
                    When you sign in, Google shows you these permissions and nothing else. Both data permissions are read-only.
                    We also ask Google for offline access, so your portfolio can sync in the background when you are not signed in.
                </p>
                <ul className="mt-6 divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface shadow-card">
                    {SCOPES.map((s) => (
                        <li key={s.scope} className="p-4 md:p-5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <p className="text-body-lg font-medium text-fg">{s.what}</p>
                                <code className="rounded-badge bg-subtle px-1.5 py-0.5 font-mono text-caption text-fg-secondary">{s.scope}</code>
                            </div>
                            <p className="mt-1 text-body text-fg-secondary">{s.detail}</p>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 text-body text-fg-muted">
                    Full scope names: <code className="font-mono text-caption">https://www.googleapis.com/auth/analytics.readonly</code> and{' '}
                    <code className="font-mono text-caption">https://www.googleapis.com/auth/webmasters.readonly</code>.
                </p>
            </section>

            <section aria-labelledby="store" className="mt-14">
                <SectionTitle id="store">What we store</SectionTitle>
                <p className="mt-4 text-body-lg text-fg-secondary">
                    Totals, not visitors: Google only gives us aggregate numbers, and that is all we keep. Each account’s data is
                    kept separate, and every connection to TrafficClaw uses HTTPS.
                </p>
                <div className="mt-6 overflow-hidden rounded-card border border-border-subtle bg-surface shadow-card">
                    <table className="w-full text-left">
                        <caption className="sr-only">What we store, why, and for how long</caption>
                        <thead className="hidden bg-surface-sunken text-body-sm text-fg-muted md:table-header-group">
                            <tr className="border-b border-border-subtle">
                                <th scope="col" className="w-[46%] px-4 py-3 font-medium">What</th>
                                <th scope="col" className="px-4 py-3 font-medium">Why</th>
                                <th scope="col" className="w-[26%] px-4 py-3 font-medium">Kept</th>
                            </tr>
                        </thead>
                        <tbody>
                            {STORED.map((row) => (
                                <tr key={row.what} className="block border-b border-border-subtle px-4 py-3 last:border-b-0 md:table-row md:p-0">
                                    <th scope="row" className="block text-body font-medium text-fg md:table-cell md:px-4 md:py-3 md:align-top">{row.what}</th>
                                    <td className="mt-1 block text-body-sm text-fg-secondary md:mt-0 md:table-cell md:px-4 md:py-3 md:align-top">
                                        <span className="font-medium text-fg-muted md:hidden">Why: </span>{row.why}
                                    </td>
                                    <td className="mt-0.5 block text-body-sm text-fg-secondary md:mt-0 md:table-cell md:px-4 md:py-3 md:align-top">
                                        <span className="font-medium text-fg-muted md:hidden">Kept: </span>{row.kept}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Prose className="mt-6">
                    <h3>How tokens are protected</h3>
                    <ul>
                        <li>
                            <strong>Google tokens</strong> are encrypted before they are written to our database (Fernet: AES-128 with an
                            HMAC-SHA256 check) and decrypted when we call Google for you.
                        </li>
                        <li>
                            <strong>AI connections</strong> (ChatGPT, Claude and other MCP apps) get their own tokens, never your Google
                            ones. We store only SHA-256 hashes of them. Access tokens last one hour; a refresh token lapses after 30 days
                            without use, and every connection has to be approved again after 180 days at most.
                        </li>
                        <li>
                            <strong>Personal API keys</strong> for Connect AI are shown once when you create them and stored only as
                            hashes. You can have up to five at a time.
                        </li>
                        <li>
                            <strong>Payments</strong> go through Dodo Payments. We keep your plan and subscription reference, never your
                            card details.
                        </li>
                    </ul>
                </Prose>
            </section>

            <section aria-labelledby="never" className="mt-14">
                <SectionTitle id="never">What we never do</SectionTitle>
                <ul className="mt-6 space-y-3">
                    {NEVER.map((t) => (
                        <li key={t} className="flex gap-3 text-body-lg text-fg-secondary">
                            <Ban aria-hidden size={18} strokeWidth={1.75} className="mt-1 shrink-0 text-fg-muted" />
                            <span>{t}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="others" className="mt-14">
                <SectionTitle id="others">Who else sees data</SectionTitle>
                <Prose className="mt-4">
                    <ul>
                        <li>
                            <strong>Google</strong> answers our read-only requests for your Analytics and Search Console data.
                        </li>
                        <li>
                            <strong>Google’s Gemini API</strong>, only when you use the built-in Ask chat: your question and the numbers
                            needed to answer it.
                        </li>
                        <li>
                            <strong>The AI app you connect</strong> (for example OpenAI’s ChatGPT or Anthropic’s Claude) receives the
                            results of the tools it calls, for the sites you approved, under its own terms. You can hide your search
                            queries from it when you approve it.
                        </li>
                        <li>
                            <strong>Dodo Payments</strong> handles payments for paid plans.
                        </li>
                        <li>
                            <strong>On our own website</strong> we use Google Analytics and Microsoft Clarity to see how trafficclaw.com
                            is used, and Tawk.to for the support chat.
                        </li>
                    </ul>
                    <p>
                        The <Link href="/privacy">privacy policy</Link> covers Google user data (Limited Use), the leaderboard and
                        connected AI apps in full.
                    </p>
                </Prose>
            </section>

            <section aria-labelledby="revoke" className="mt-14">
                <SectionTitle id="revoke">Revoke access</SectionTitle>
                <ol className="mt-6 space-y-4">
                    {[
                        {
                            title: 'In your Google account',
                            body: (
                                <>
                                    Open{' '}
                                    <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text underline underline-offset-4 hover:text-fg">
                                        Google account permissions<ExternalLink aria-hidden size={12} />
                                    </a>
                                    , pick {BRAND_NAME} and remove access. Google then refuses our requests, background syncs included. You can
                                    connect again at any time.
                                </>
                            ),
                        },
                        {
                            title: `In ${BRAND_NAME}`,
                            body: (
                                <>
                                    Settings › Google shows the account you connected and the permissions above. On the Connect AI page you can
                                    revoke one AI app, all of them, or a personal API key; they lose access within seconds.
                                </>
                            ),
                        },
                        {
                            title: 'Public links and the leaderboard',
                            body: <>Switch off or reset a dashboard’s public link in its Share dialog. Pause or delete a leaderboard profile from the Leaderboard page in the app.</>,
                        },
                    ].map((step, i) => (
                        <li key={step.title} className="flex gap-4">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-body-sm font-medium tabular-nums text-fg-secondary">{i + 1}</span>
                            <div className="min-w-0">
                                <p className="text-body-lg font-medium text-fg">{step.title}</p>
                                <p className="mt-1 text-body-lg text-fg-secondary">{step.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section aria-labelledby="delete" className="mt-14">
                <SectionTitle id="delete">Delete your data</SectionTitle>
                <div className="mt-6 flex gap-4 rounded-card border border-border-subtle bg-surface p-5 shadow-card">
                    <Trash2 aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-muted" />
                    <div className="min-w-0 text-body-lg text-fg-secondary">
                        <p>
                            In the app, go to Settings › Danger zone and choose <strong className="font-medium text-fg">Delete account</strong>,
                            or email <a href="mailto:privacy@trafficclaw.com" className="text-brand-text underline underline-offset-4 hover:text-fg">privacy@trafficclaw.com</a>.
                            We delete your account and the data stored with it within 30 days.
                        </p>
                        <p className="mt-3">
                            Want a copy first? Settings › Data &amp; privacy › <strong className="font-medium text-fg">Export my data</strong> downloads
                            everything we keep about you as a JSON file. Your Analytics and Search Console data itself stays in Google.
                        </p>
                    </div>
                </div>
            </section>

            <section aria-labelledby="report" className="mt-14">
                <SectionTitle id="report">Questions or a security issue</SectionTitle>
                <p className="mt-4 text-body-lg text-fg-secondary">
                    Email <a href="mailto:privacy@trafficclaw.com" className="text-brand-text underline underline-offset-4 hover:text-fg">privacy@trafficclaw.com</a> or
                    use the <Link href="/contact" className="text-brand-text underline underline-offset-4 hover:text-fg">contact form</Link>. If you think you have
                    found a vulnerability, please tell us before sharing it publicly.
                </p>
            </section>
        </ContentPage>
    );
}
