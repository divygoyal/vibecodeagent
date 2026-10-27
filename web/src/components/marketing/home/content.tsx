import Link from 'next/link';

import { BRAND_NAME } from '@/lib/brand';
import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';
import type { FaqItem } from '../site/Faq';

const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
const pro = PAID_PLANS.find((p) => p.key === 'pro')!;

export const HOME_FAQ: FaqItem[] = [
    {
        q: `Is ${BRAND_NAME} really free?`,
        a: `Yes. The portfolio, site pages, dashboards, the public leaderboard and the ChatGPT and Claude connector are free, with no site limit. Paid plans only add more Ask messages in ${BRAND_NAME}'s built-in AI chat.`,
    },
    {
        q: `What can ${BRAND_NAME} see in my Google account?`,
        a: `Only what you allow when you sign in: read-only access to Google Analytics and Search Console, plus your name, email and profile photo to sign you in. ${BRAND_NAME} cannot change anything in Analytics or Search Console, and it never sees Gmail, Drive or any other Google data. The Security and data page lists exactly what we read and store.`,
        body: (
            <>
                Only what you allow when you sign in: read-only access to Google Analytics and Search Console, plus your name, email
                and profile photo to sign you in. {BRAND_NAME} cannot change anything in Analytics or Search Console, and it never sees
                Gmail, Drive or any other Google data. <Link href="/security" className="text-brand-text underline underline-offset-4 hover:text-fg">Security and data</Link>{' '}
                lists exactly what we read and store.
            </>
        ),
    },
    {
        q: 'Do I need to install a tracking script?',
        a: `No. ${BRAND_NAME} reads the Google Analytics 4 and Search Console data you already collect. Nothing changes on your site.`,
    },
    {
        q: 'How is this different from Looker Studio?',
        a: `Looker Studio gives you a blank canvas: you connect each data source, build every chart and keep it working. ${BRAND_NAME} starts finished: a portfolio of every site, pages for each site with Analytics and Search Console side by side, and a ranked list of what to fix next. When you want your own layout, the dashboard builder has templates, and its links and embeds are read-only.`,
    },
    {
        q: 'Do I need both Google Analytics 4 and Search Console?',
        a: 'No. A site with only one of them shows that half, and the other half appears once your Google account can see it.',
    },
    {
        q: "Why don't my numbers match Google's own screens exactly?",
        a: `We read the same Google APIs, so the numbers come from Google. Small gaps usually come from the date range (each chart shows its dates), today's partial day, and Search Console data arriving about two days late. If a gap looks wrong, tell us and we will check it.`,
    },
    {
        q: 'How fresh is the data?',
        a: `Your portfolio syncs in the background about every six hours. Site pages ask Google when you open them, and keep the answer for a few minutes. Search Console itself runs about two days behind, and the Realtime tab updates every 30 seconds.`,
    },
    {
        q: 'How many sites can I add?',
        a: 'Every Google Analytics 4 property and Search Console site your Google account can see shows up in your portfolio. There is no site limit on any plan.',
    },
    {
        q: 'Can I use it for client sites?',
        a: 'Yes, for any site your Google account can see. Share a read-only dashboard link, optionally with a password or an end date, or embed it on a client page. Clients do not need an account, and you can switch a link off at any time.',
    },
    {
        q: 'How does the ChatGPT and Claude connector work?',
        a: `${BRAND_NAME} runs a hosted MCP server. Add its URL in ChatGPT, Claude or another MCP client, sign in, approve read-only access for all of your sites or only some, then ask questions. You can revoke access at any time.`,
    },
    {
        q: 'What shows on the public leaderboard?',
        a: 'Only sites you add yourself, and only the numbers you choose to make public. To rank, you have to be a verified owner of the site in Search Console.',
    },
    {
        q: 'Can I delete my data?',
        a: `Yes. Ask for deletion in Settings, under Danger zone, or email privacy@trafficclaw.com, and we delete your account and the data stored with it within 30 days. You can also remove ${BRAND_NAME}'s access at any time in your Google Account permissions.`,
    },
];

export const PRICING_FAQ: FaqItem[] = [
    {
        q: 'Why is it free?',
        a: `Most of what ${BRAND_NAME} does is read numbers from your own Google account and show them well, which costs us little to run. The expensive part is AI. When you ask ChatGPT or Claude through the connector, the AI runs on your plan with them. Only ${BRAND_NAME}'s built-in Ask chat costs us AI fees, so extra Ask messages are the one paid thing. Later we plan to earn from clearly labelled sponsor slots on the leaderboard.`,
    },
    {
        q: 'What is an Ask message?',
        a: `One question to ${BRAND_NAME}'s built-in AI chat, which answers from your Analytics and Search Console data. Free accounts start with ${FREE_START_CREDITS} Ask messages. ${growth.name} adds ${growth.credits} a month and ${pro.name} adds ${pro.credits} a month.`,
    },
    {
        q: 'What happens when I run out of Ask messages?',
        a: 'Everything else keeps working: portfolio, dashboards, leaderboard and the ChatGPT and Claude connector. Paid allowances reset at the start of each billing cycle and do not roll over.',
    },
    {
        q: 'Do I need a paid plan to use ChatGPT or Claude with my data?',
        a: `No. The connector is free on every plan. The AI runs on your own ChatGPT or Claude account, so it does not use ${BRAND_NAME} Ask messages.`,
    },
    {
        q: 'Can I cancel any time?',
        a: 'Yes. Cancel from the Plan page in your dashboard. Your plan stays active until the end of the period you paid for, then your account goes back to Free.',
    },
    {
        q: 'How do payments work?',
        a: 'Payments are handled by Dodo Payments, which accepts major credit and debit cards and some digital wallets. We never see your full card details.',
    },
];
