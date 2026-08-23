import { NextResponse } from 'next/server';

const LLMS_TXT = `# TrafficClaw

TrafficClaw is an AI-powered SEO and web-analytics platform. Connect Google Analytics 4 and Google Search Console, then ask your data questions in plain English. TrafficClaw answers instantly, sends daily AI insights and traffic-drop alerts, and suggests automated SEO fixes. It also includes a realtime traffic globe, embeddable brand-mention widgets for Reddit and X, and a suite of free SEO tools. Plans start at $19/month with a free tier.

## Key pages

- [Home](https://trafficclaw.com/): AI co-pilot for GA4 + Search Console — overview and product demo
- [Features](https://trafficclaw.com/features): Everything TrafficClaw does
- [Pricing](https://trafficclaw.com/pricing): Growth and Pro plans (from $19/month)
- [Globe](https://trafficclaw.com/globe): Realtime global traffic globe
- [Leaderboard](https://trafficclaw.com/leaderboard): Public site leaderboard
- [Reddit mentions](https://trafficclaw.com/reddit): Track and embed Reddit brand mentions
- [X mentions](https://trafficclaw.com/x): Track and embed X/Twitter brand mentions
- [Free SEO tools](https://trafficclaw.com/tools): AI search-readiness checker, robots.txt analyzer, hreflang validator, readability checker, and comparison builder
- [About](https://trafficclaw.com/about): About TrafficClaw and the team
- [Contact](https://trafficclaw.com/contact): Contact and support
- [Privacy policy](https://trafficclaw.com/privacy): Privacy policy
- [Terms of service](https://trafficclaw.com/terms): Terms of service

## Optional

In-product documentation, guides, and setup help are available in the Docs area of the dashboard after signing in at https://trafficclaw.com.

## Context

TrafficClaw is a web application (SaaS) built for marketers, SEOs, founders, and agencies who want a simpler way to monitor organic and overall web traffic than dedicated analytics suites provide. It pairs Google Analytics 4 / Search Console data with an AI assistant so non-technical users can get answers without learning GA4's interface. The product and its official website both live at trafficclaw.com.
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