import { NextResponse } from 'next/server';
import { BRAND_NAME, SITE_URL, SITE_HOST } from '@/lib/brand';

const LLMS_TXT = `# ${BRAND_NAME}

${BRAND_NAME} is an AI-powered SEO and web-analytics platform. Connect Google Analytics 4 and Google Search Console, then ask your data questions in plain English. ${BRAND_NAME} answers instantly, sends daily AI insights and traffic-drop alerts, and suggests automated SEO fixes. It also includes a realtime traffic globe, embeddable brand-mention widgets for Reddit and X, and a suite of free SEO tools. Plans start at $19/month with a free tier.

## Key pages

- [Home](${SITE_URL}/): AI co-pilot for GA4 + Search Console — overview and product demo
- [Features](${SITE_URL}/features): Everything ${BRAND_NAME} does
- [Pricing](${SITE_URL}/pricing): Growth and Pro plans (from $19/month)
- [Globe](${SITE_URL}/globe): Realtime global traffic globe
- [Leaderboard](${SITE_URL}/leaderboard): Public site leaderboard
- [Reddit mentions](${SITE_URL}/reddit): Track and embed Reddit brand mentions
- [X mentions](${SITE_URL}/x): Track and embed X/Twitter brand mentions
- [Free SEO tools](${SITE_URL}/tools): AI search-readiness checker, robots.txt analyzer, hreflang validator, readability checker, and comparison builder
- [About](${SITE_URL}/about): About ${BRAND_NAME} and the team
- [Contact](${SITE_URL}/contact): Contact and support
- [Privacy policy](${SITE_URL}/privacy): Privacy policy
- [Terms of service](${SITE_URL}/terms): Terms of service

## Optional

In-product documentation, guides, and setup help are available in the Docs area of the dashboard after signing in at ${SITE_URL}.

## Context

${BRAND_NAME} is a web application (SaaS) built for marketers, SEOs, founders, and agencies who want a simpler way to monitor organic and overall web traffic than dedicated analytics suites provide. It pairs Google Analytics 4 / Search Console data with an AI assistant so non-technical users can get answers without learning GA4's interface. The product and its official website both live at trafficclaw.com.
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