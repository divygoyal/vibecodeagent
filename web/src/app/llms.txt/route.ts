import { NextResponse } from 'next/server';

import { FREE_TOOLS } from '@/components/marketing/tools/catalog';
import { BRAND_NAME, SITE_HOST, SITE_URL } from '@/lib/brand';
import { FREE_START_CREDITS, PAID_PLANS } from '@/lib/plans';

const plans = PAID_PLANS.map((p) => `${p.name} $${p.priceUsd}/month adds ${p.credits} Ask messages a month`).join('; ');

const LLMS_TXT = `# ${BRAND_NAME}

> All your sites. One screen. Free. ${BRAND_NAME} connects to Google Analytics 4 and Google Search Console with read-only access and shows every site you own in one portfolio, with dashboards you can share, a public leaderboard of verified traffic, and a connector (MCP server) for ChatGPT and Claude.

Everything is free with no site limit: the portfolio, per-site traffic and search pages, dashboards, the leaderboard and the ChatGPT and Claude connector. The only paid thing is extra Ask messages in the built-in AI chat: free accounts start with ${FREE_START_CREDITS}; ${plans}.

## Key pages

- [Home](${SITE_URL}/): what ${BRAND_NAME} does, with a portfolio preview built from sample data
- [Live demo](${SITE_URL}/demo): read-only portfolio of sample sites and a sample dashboard per site, no sign-in
- [Pricing](${SITE_URL}/pricing): free plan and the paid Ask-message plans
- [ChatGPT and Claude](${SITE_URL}/ai): connect Google Analytics and Search Console to ChatGPT, Claude, Cursor or VS Code through the hosted MCP server at ${SITE_URL}/mcp
- [Leaderboard](${SITE_URL}/leaderboard): public leaderboard of sites with traffic verified through Google; only verified Search Console owners rank
- [Sponsor slots](${SITE_URL}/leaderboard/advertise): labelled sponsor placements on the leaderboard
- [Free SEO tools](${SITE_URL}/tools): no sign-up tools
${FREE_TOOLS.map((t) => `  - [${t.title}](${SITE_URL}/tools/${t.slug}): ${t.short}`).join('\n')}
- [Security and data](${SITE_URL}/security): exactly what ${BRAND_NAME} reads (read-only scopes), what it stores and how, what it never does, how to revoke access and delete data
- [Changelog](${SITE_URL}/changelog): what shipped, newest first
- [About](${SITE_URL}/about): who it is for and how ${BRAND_NAME} makes money
- [Contact](${SITE_URL}/contact): contact form
- [Privacy policy](${SITE_URL}/privacy): Google user data (Limited Use), the public leaderboard and connected AI apps
- [Terms of service](${SITE_URL}/terms)

## Facts

- Data sources: Google Analytics 4 (analytics.readonly) and Google Search Console (webmasters.readonly). Read-only; ${BRAND_NAME} never changes Google data. No tracking script is needed.
- Sign-in: Google. Portfolio pairs each GA4 property with its Search Console site by hostname.
- Leaderboard verification: a site ranks only when the owner is a verified owner or full user of the domain in Search Console.
- MCP: remote server (Streamable HTTP) with OAuth; read-only tools for the portfolio, GA4 reports, realtime, Search Console search analytics, period comparisons, top movers and SEO opportunities.
- The product and its official website both live at ${SITE_HOST}.
`;

export const dynamic = 'force-static';

export function GET() {
    return new NextResponse(LLMS_TXT.trim() + '\n', {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
