import type { Metadata } from 'next';
import FeaturesClient from './FeaturesClient';

export const metadata: Metadata = {
    title: 'Features — Analytics, SEO Intelligence & AI Tools',
    description:
        'Explore TrafficClaw features: real-time analytics dashboard, SEO keyword tracking, AI chat assistant, site audit, Telegram bot, smart alerts, and AI-powered SEO tools.',
    alternates: { canonical: '/features' },
    openGraph: {
        title: 'Features — Analytics, SEO Intelligence & AI Tools | TrafficClaw',
        description:
            'Real-time analytics, SEO tracking, AI chat, site audit, Telegram bot, smart alerts, and AI SEO tools — all in one dashboard.',
        url: '/features',
    },
};

const featuresFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'What data sources does TrafficClaw support?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'TrafficClaw connects to Google Analytics 4 and Google Search Console. We also integrate with GitHub for code-level SEO fixes and Telegram for mobile notifications and queries.',
            },
        },
        {
            '@type': 'Question',
            name: 'How does the AI Chat work?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'The AI Chat uses Google Gemini to analyze your real analytics and SEO data. Ask questions in plain English like "why is my traffic dropping?" and get data-backed answers with specific evidence and actionable recommendations.',
            },
        },
        {
            '@type': 'Question',
            name: 'What does the Site Audit check?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Our audit runs 100+ checks covering meta tags, heading structure, image optimization, internal links, page speed indicators, mobile-friendliness, accessibility, and structured data validation.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I use TrafficClaw for multiple websites?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. Growth and Pro plans support multiple Google Analytics properties and Search Console sites. Switch between sites instantly from the dashboard.',
            },
        },
    ],
};

export default function FeaturesPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(featuresFaqSchema) }}
            />
            <FeaturesClient />
        </>
    );
}
