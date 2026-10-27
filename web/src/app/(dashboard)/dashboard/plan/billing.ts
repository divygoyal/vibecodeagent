/**
 * Billing config for the Plan page. Names, prices and message counts live here
 * only; the layout reads them. The Dodo product ids are the live ones: do not
 * change them without changing the Dodo products and the webhook
 * (app/api/webhooks/dodo/route.ts) together.
 */
export interface PlanDef {
    key: 'free' | 'starter' | 'growth' | 'pro';
    label: string;
    /** USD per month. */
    price: number;
    /** Ask messages: per month for paid plans, once at sign-up for Free. */
    messages: number;
    blurb: string;
    /** Dodo product id (paid plans that can be bought). */
    productId?: string;
    /** Sold today. Starter is kept for people who already have it. */
    available: boolean;
    recommended?: boolean;
}

export const PLANS: PlanDef[] = [
    { key: 'free', label: 'Free', price: 0, messages: 5, blurb: 'Everything, with 5 Ask messages to start', available: true },
    { key: 'starter', label: 'Starter', price: 9, messages: 50, blurb: 'Legacy plan, not sold any more', available: false },
    { key: 'growth', label: 'Growth', price: 19, messages: 50, blurb: 'For regular questions', productId: 'pdt_0NaLMM1bLW9wAbmxcsebm', available: true, recommended: true },
    { key: 'pro', label: 'Pro', price: 29, messages: 100, blurb: 'For heavy use and agencies', productId: 'pdt_0NaLMM4r23kncRahthuyj', available: true },
];

export function planByKey(key: string): PlanDef {
    return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

/** What every plan includes: the product is free, plans only change Ask. */
export const INCLUDED_IN_ALL = [
    'Portfolio of every site',
    'Dashboards and sharing',
    'Leaderboard profile',
    'Connect AI for ChatGPT and Claude',
];

export const FAQ: { q: string; a: string }[] = [
    {
        q: 'What counts as one message?',
        a: 'One question you send in Ask. The tools it runs behind the scenes (reports, audits, comparisons) are included. If an answer fails, the message is given back.',
    },
    {
        q: 'Do ChatGPT and Claude use my messages?',
        a: 'No. Questions you ask through Connect AI run in your own ChatGPT or Claude account and do not use Ask messages.',
    },
    {
        q: 'Why is everything else free?',
        a: 'Ask is the only part that costs us money each time it runs, because it uses an AI model. Charts, portfolio, dashboards, leaderboard and Connect AI cost very little, so they are free with no limit on sites.',
    },
    {
        q: 'What happens if I cancel or change plan?',
        a: 'Cancelling stops the next renewal and keeps your plan until the end of the billing period. Messages reset at the start of each cycle and do not roll over. Upgrades are instant and prorated.',
    },
    {
        q: 'Is my data safe?',
        a: 'Google access is read only and tokens are encrypted on our servers. Payments are handled by Dodo Payments, so we never see your card.',
    },
];
