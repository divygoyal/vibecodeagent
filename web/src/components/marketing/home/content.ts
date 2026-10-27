import { BRAND_NAME } from '@/lib/brand';
import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';
import type { FaqItem } from '../site/Faq';

const growth = PAID_PLANS.find((p) => p.key === 'growth')!;
const pro = PAID_PLANS.find((p) => p.key === 'pro')!;

export const HOME_FAQ: FaqItem[] = [
    {
        q: `Is ${BRAND_NAME} really free?`,
        a: `Yes. The portfolio, dashboards, the public leaderboard and the ChatGPT and Claude connector are free, with no site limit. Paid plans only add more Ask messages in ${BRAND_NAME}'s built-in AI chat.`,
    },
    {
        q: `What can ${BRAND_NAME} see in my Google account?`,
        a: `Only what you allow when you sign in: read-only access to Google Analytics and Search Console. ${BRAND_NAME} cannot change anything in Analytics or Search Console, and it never sees Gmail, Drive or any other Google data.`,
    },
    {
        q: 'How many sites can I add?',
        a: 'Every Google Analytics 4 property and Search Console site your Google account can see shows up in your portfolio. There is no site limit on any plan.',
    },
    {
        q: 'Do I need to install a tracking script?',
        a: `No. ${BRAND_NAME} reads the Google Analytics 4 and Search Console data you already collect. Nothing changes on your site.`,
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
        a: `Yes. Revoke ${BRAND_NAME}'s access in your Google Account settings or email privacy@trafficclaw.com, and we delete your Google data within 30 days.`,
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
