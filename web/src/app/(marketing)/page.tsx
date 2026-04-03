import type { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
    title: 'TrafficClaw — AI for Google Analytics & Search Console',
    description:
        'Connect your Google Analytics & Search Console to AI. Ask why traffic dropped, which keywords to fix, and get step-by-step verdicts backed by your real data. Free to start.',
    alternates: { canonical: '/' },
    openGraph: {
        title: 'TrafficClaw — AI for Google Analytics & Search Console',
        description:
            'GA4 is confusing. Connect your Google Analytics & Search Console to AI — ask anything about your traffic and get actionable verdicts in seconds.',
        url: '/',
    },
};

const reviewSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TrafficClaw',
    url: 'https://trafficclaw.com',
    applicationCategory: 'BusinessApplication',
    review: [
        {
            '@type': 'Review',
            author: { '@type': 'Person', name: 'Sarah Chen' },
            reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
            reviewBody: 'The AI chat is incredible. I asked why my traffic dropped and it found the exact page, the exact date, and gave me a fix in under 10 seconds.',
        },
        {
            '@type': 'Review',
            author: { '@type': 'Person', name: 'Marcus Rodriguez' },
            reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
            reviewBody: 'We replaced three SEO tools with TrafficClaw. The striking distance finder alone paid for our subscription in the first week.',
        },
        {
            '@type': 'Review',
            author: { '@type': 'Person', name: 'Priya Patel' },
            reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' },
            reviewBody: 'Content decay detection saved us from losing 40% of our organic traffic. The daily briefings keep me informed without opening a single tab.',
        },
    ],
};

export default function HomePage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
            />
            <HomeClient />
        </>
    );
}
