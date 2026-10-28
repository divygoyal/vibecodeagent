import type { FaqItem } from '../site/Faq';
import type { CompareRow } from './ComparisonTable';
import type { ShotKey } from './ProductShot';

/**
 * Content of the "alternative to" pages. Competitor facts were checked on their own sites on CHECKED_ON; every
 * fact has a source URL in `sources`. Anything we could not verify is left out or worded as "not mentioned".
 */
export const CHECKED_ON = '28 October 2026';

export interface Alternative {
    slug: 'looker-studio' | 'seogets' | 'quickseo';
    name: string;
    /** <title> (the site template adds " | TrafficClaw"). */
    title: string;
    description: string;
    h1: string;
    lead: string;
    /** Short line for the index card. */
    blurb: string;
    shot: ShotKey;
    shotAlt: string;
    /** Three visual points under the hero: what changes if you switch. */
    points: Array<{ title: string; body: string }>;
    rows: CompareRow[];
    /** Where the competitor is better. Honest. */
    theyWin: Array<{ title: string; body: string }>;
    /** Where TrafficClaw is better. */
    weWin: Array<{ title: string; body: string }>;
    pickThem: string[];
    pickUs: string[];
    faq: FaqItem[];
    sources: Array<{ label: string; href: string }>;
}

export const ALTERNATIVES: Alternative[] = [
    {
        slug: 'looker-studio',
        name: 'Looker Studio',
        title: 'Looker Studio alternative for GA4 and Search Console',
        description: 'A free Looker Studio alternative for Google Analytics 4 and Search Console: every site on one screen, no data-source wiring, read-only share links and embeds. Where Looker Studio is still better, too.',
        h1: 'A Looker Studio alternative for GA4 and Search Console',
        lead: 'Looker Studio gives you a blank canvas. TrafficClaw starts finished: connect Google once and every site is already there, Analytics and Search Console side by side.',
        blurb: 'Starts finished: no data sources to wire, no reports to keep working.',
        shot: 'dashboards',
        shotAlt: 'A TrafficClaw dashboard with scorecards, a trend chart and tables, built from Search Console and Analytics (demo data).',
        points: [
            { title: 'Nothing to wire', body: 'Sign in with Google. Every GA4 property and Search Console site you can see is paired by website, with no data source to add per site.' },
            { title: 'Same shareable output', body: 'The dashboard builder has 24 templates, read-only public links with a password or end date, iframe embeds, PDF and CSV export.' },
            { title: 'Ask it in Claude or ChatGPT', body: 'A free connector lets your AI assistant read the same numbers, read-only.' },
        ],
        rows: [
            { label: 'Price', us: 'Free, no site limit', them: 'Free (the Pro tier is paid, per user)' },
            { label: 'First useful screen', us: 'Immediately: sign in and it is built', them: 'You connect each data source and build the report' },
            { label: 'GA4 and Search Console together', us: { yes: true, text: 'Side by side per site, paired by website' }, them: { yes: true, text: 'Separate connectors, which you combine yourself' } },
            { label: 'All your sites in one view', us: { yes: true, text: 'Portfolio, built automatically' }, them: 'You build it' },
            { label: 'Ranked list of what to fix next', us: true, them: false },
            { label: 'Other data sources (Google Ads, BigQuery, …)', us: { yes: false, text: 'GA4 and Search Console only' }, them: { yes: true, text: 'Many connectors' } },
            { label: 'Layout freedom and calculated fields', us: { yes: false, text: 'Templates and 11 widget types' }, them: { yes: true, text: 'Full canvas' } },
            { label: 'Scheduled email delivery of reports', us: { yes: false, text: 'Weekly digest only, not tied to dashboards' }, them: { yes: true, text: 'Yes (Pro raises the limits)' } },
        ],
        theyWin: [
            { title: 'Any data source', body: 'Google Ads, BigQuery, spreadsheets and many more. TrafficClaw reads GA4 and Search Console only.' },
            { title: 'Total layout freedom', body: 'Calculated fields, custom charts and a free-form canvas. Our builder is deliberately smaller.' },
            { title: 'Scheduled report emails', body: 'Looker Studio can email a report on a schedule. TrafficClaw does not do this for dashboards yet.' },
        ],
        weWin: [
            { title: 'Starts finished', body: 'No connectors to add per site, no report to rebuild when you launch a new one.' },
            { title: 'A portfolio, not a page', body: 'All sites ranked and compared on one screen, with what changed and what to fix next.' },
            { title: 'Built for AI assistants', body: 'The same numbers, read-only, inside Claude and ChatGPT.' },
        ],
        pickThem: ['You need data from more than GA4 and Search Console.', 'You want full control of layout, calculated fields and branding in every chart.', 'Your team already lives in Google Cloud.'],
        pickUs: ['You look after several sites and want them all on one screen today.', 'You mostly need Analytics and Search Console, read well.', 'You want to ask questions in Claude or ChatGPT instead of building charts.'],
        faq: [
            { q: 'Is TrafficClaw a Looker Studio replacement?', a: 'For Google Analytics 4 and Search Console reporting, often yes. If you rely on other data sources or calculated fields, keep Looker Studio for those and use TrafficClaw for the all-sites view. Many people use both.' },
            { q: 'Can I still build my own dashboards?', a: 'Yes. The dashboard builder has 24 templates, scorecards, charts, tables and a map. Dashboards can be shared by a read-only link with an optional password or end date, embedded in an iframe, exported as PDF and CSV, and shown in TV mode.' },
            { q: 'Is Looker Studio the same as Data Studio?', a: 'Yes. Google has renamed Looker Studio back to Data Studio, and its documentation now uses that name. This page says Looker Studio because that is what most people still search for.' },
            { q: 'Will my numbers match Looker Studio?', a: 'Both read Google\'s own APIs, so they should be close. Small gaps usually come from the date range, a partial current day, and Search Console data arriving about two days late.' },
            { q: 'Does it cost anything?', a: 'No. Every feature is free for every site you own. The only paid thing is extra Ask messages in the built-in AI chat.' },
        ],
        sources: [
            { label: 'Google: Connect to Search Console', href: 'https://docs.cloud.google.com/looker/docs/studio/connect-to-search-console' },
            { label: 'Google: Connect to Google Analytics', href: 'https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics' },
            { label: 'Google: Data Studio Pro subscription', href: 'https://docs.cloud.google.com/data-studio/pro-subscription-overview' },
        ],
    },
    {
        slug: 'seogets',
        name: 'SEOgets',
        title: 'Free SEOgets alternative: GA4, Search Console and MCP',
        description: 'A free SEOgets alternative: Search Console and GA4 for every site, dashboards and a Claude and ChatGPT connector, all free. What SEOgets does better, with its pricing as published.',
        h1: 'A free SEOgets alternative',
        lead: 'SEOgets charges per core site. TrafficClaw is free for every site: Search Console, GA4, dashboards and the Claude and ChatGPT connector.',
        blurb: 'Free for every site, including GA4 and the AI connector. No per-site price.',
        shot: 'site',
        shotAlt: 'A TrafficClaw site page with Search Console clicks and impressions next to Analytics sessions (demo data).',
        points: [
            { title: 'No per-site price', body: 'SEOgets lists $49 a month for the first core site and $4 for each extra one. TrafficClaw has no site limit and no paid tier for features.' },
            { title: 'GA4 and MCP included', body: 'GA4 and the Claude and ChatGPT connector are free on every site, read-only.' },
            { title: 'Portfolio first', body: 'Every site on one screen, with what changed and what to fix next.' },
        ],
        rows: [
            { label: 'Price', us: 'Free', them: 'Free sites, or core sites at $49/month for the first and $4 for each extra' },
            { label: 'Number of sites', us: 'No limit', them: 'Unlimited free sites; unlimited core tier from 35 core sites' },
            { label: 'Search Console dashboard for all sites', us: true, them: true },
            { label: 'GA4 analytics', us: { yes: true, text: 'Free, on every site' }, them: { yes: true, text: 'Listed under core sites' } },
            { label: 'Claude and ChatGPT connector (MCP)', us: { yes: true, text: 'Free, read-only' }, them: { yes: true, text: 'Listed under core sites; can also write annotations' } },
            { label: 'Content groups and topic clusters', us: false, them: true },
            { label: 'SEO testing', us: false, them: true },
            { label: 'White-labeled client portals', us: { yes: false, text: 'Brand kit on shared dashboards and PDFs, no custom portal' }, them: true },
            { label: 'Human onboarding and support', us: { yes: false, text: 'Self-serve' }, them: true },
        ],
        theyWin: [
            { title: 'Content groups and topic clusters', body: 'Group pages by topic or site section and see performance per group. TrafficClaw has no page groups.' },
            { title: 'SEO testing', body: 'Test the effect of changes. TrafficClaw does not run SEO tests.' },
            { title: 'Client portals and human help', body: 'White-labeled portals, plus personal onboarding and customer support. TrafficClaw is self-serve.' },
        ],
        weWin: [
            { title: 'Free, with no catch per site', body: 'Add every site you own. Nothing locks behind a core-site price.' },
            { title: 'GA4 and the AI connector for all sites', body: 'Ask Claude or ChatGPT about any site, not only the ones you pay for.' },
            { title: 'Public leaderboard', body: 'Optionally show verified traffic for sites you own.' },
        ],
        pickThem: ['You run client SEO and need white-labeled portals.', 'You want content groups, topic clusters or SEO testing.', 'You want a person to help you set up.'],
        pickUs: ['You want every site covered without a per-site bill.', 'You want GA4 and an AI connector on all your sites for free.', 'You are happy to self-serve.'],
        faq: [
            { q: 'Is TrafficClaw really free compared with SEOgets?', a: 'Yes. Every TrafficClaw feature is free with no site limit. SEOgets says free sites are always free, and lists its core sites at $49 a month for the first and $4 for each additional one, with an unlimited tier from 35 core sites.' },
            { q: 'Does TrafficClaw have content groups or SEO testing?', a: 'No. If you need page groups, topic clusters or SEO testing, SEOgets is the better fit. TrafficClaw shows what changed and what to fix next across all your sites.' },
            { q: 'Can I use both?', a: 'Yes. TrafficClaw is read-only and needs no tracking script, so it can sit next to any other tool.' },
            { q: 'What does the connector do?', a: 'It lets Claude, ChatGPT, Cursor or any MCP app read your Analytics and Search Console numbers through 13 read-only tools. It is free.' },
        ],
        sources: [
            { label: 'SEOgets: home', href: 'https://seogets.com' },
            { label: 'SEOgets: pricing', href: 'https://seogets.com/pricing' },
        ],
    },
    {
        slug: 'quickseo',
        name: 'QuickSEO',
        title: 'QuickSEO alternative with GA4 and Search Console',
        description: 'A QuickSEO alternative that adds Google Analytics 4 to Search Console: every site on one free screen, dashboards and a free Claude and ChatGPT connector. Where QuickSEO is better, too.',
        h1: 'A QuickSEO alternative with GA4 and Search Console',
        lead: 'QuickSEO shows Search Console for all your sites. TrafficClaw adds Google Analytics 4 next to it, plus dashboards and a free AI connector.',
        blurb: 'Search Console and GA4 together, with dashboards and a free AI connector.',
        shot: 'traffic',
        shotAlt: 'A TrafficClaw traffic page with Analytics sessions by channel, including visits from AI assistants (demo data).',
        points: [
            { title: 'GA4 next to Search Console', body: 'See what visitors do after the click, on the same screen as the queries that brought them.' },
            { title: 'Dashboards you can share', body: 'A builder with 24 templates, read-only public links and iframe embeds.' },
            { title: 'AI connector, free', body: 'QuickSEO lists MCP access on its paid Lite plan. TrafficClaw\'s connector is free.' },
        ],
        rows: [
            { label: 'Price', us: 'Free', them: 'Free plan; Lite $39/month with a 14-day trial' },
            { label: 'Number of sites', us: 'No limit', them: 'Unlimited on the free plan' },
            { label: 'Search Console dashboard for all sites', us: true, them: true },
            { label: 'Google Analytics 4', us: { yes: true, text: 'Side by side with Search Console' }, them: { yes: false, text: 'Not mentioned on their site' } },
            { label: 'Opportunities / what to fix next', us: true, them: { yes: true, text: 'Every opportunity on every site needs Lite' } },
            { label: 'Dashboard builder, share links, embeds', us: true, them: { yes: false, text: 'Not mentioned on their site' } },
            { label: 'Claude and ChatGPT connector (MCP)', us: { yes: true, text: 'Free' }, them: { yes: true, text: 'Lite plan only' } },
            { label: 'Index monitor (URL Inspection over time)', us: { yes: false, text: 'URL Inspection through the AI connector only' }, them: { yes: true, text: 'Lite plan' } },
            { label: 'Page groups', us: false, them: { yes: true, text: 'Lite plan' } },
        ],
        theyWin: [
            { title: 'Index monitoring', body: 'It watches indexing with Google\'s URL Inspection over time. TrafficClaw can inspect a URL through the AI connector but has no monitor.' },
            { title: 'Page groups', body: 'Track sections of a site by URL pattern. TrafficClaw has no page groups.' },
            { title: 'A focused Search Console tool', body: 'If Search Console is all you need, its free plan covers every site and it is simple.' },
        ],
        weWin: [
            { title: 'Analytics and Search together', body: 'Sessions, key events and channels next to clicks and queries, on one page per site.' },
            { title: 'Dashboards and embeds', body: 'Build, share and embed read-only dashboards, or export a PDF.' },
            { title: 'AI connector at no cost', body: 'Use Claude or ChatGPT on all your sites without a paid plan.' },
        ],
        pickThem: ['You only care about Search Console.', 'You want an index monitor or page groups.'],
        pickUs: ['You also want GA4 for every site.', 'You want shareable dashboards.', 'You want the AI connector without a paid plan.'],
        faq: [
            { q: 'Does QuickSEO include Google Analytics?', a: 'Its own pages describe Search Console data only ("Every click and impression in QuickSEO comes from Google Search Console itself") and we found no mention of GA4. TrafficClaw shows GA4 and Search Console side by side.' },
            { q: 'Is TrafficClaw free like QuickSEO\'s free plan?', a: 'Yes, with no site limit. QuickSEO has a free plan for unlimited websites and a paid Lite plan at $39 a month. TrafficClaw has no paid feature tier; extra Ask messages in the built-in AI chat are the only paid thing.' },
            { q: 'Which is better for MCP and AI assistants?', a: 'QuickSEO lists MCP access on Lite only. TrafficClaw\'s connector is free and covers both Search Console and GA4 with 13 read-only tools.' },
            { q: 'Can I use both?', a: 'Yes. Both read your Google data with read-only access.' },
        ],
        sources: [
            { label: 'QuickSEO: home', href: 'https://quickseo.ai' },
            { label: 'QuickSEO: pricing', href: 'https://quickseo.ai/pricing' },
        ],
    },
];

export function getAlternative(slug: Alternative['slug']): Alternative {
    const a = ALTERNATIVES.find((x) => x.slug === slug);
    if (!a) throw new Error(`Unknown alternative ${slug}`);
    return a;
}
