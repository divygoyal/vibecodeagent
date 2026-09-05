import type { Metadata } from 'next';

import LandingHomepage from '@/components/marketing/home/LandingHomepage';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Talk to your Google Analytics — AI for GA4 + Search Console | ${BRAND_NAME}`,
    description:
        `${BRAND_NAME} is your AI co-pilot for Google Analytics and Search Console. Ask in plain English, get answers, daily insights, and SEO wins — plus a realtime globe and embeddable mentions.`,
    alternates: { canonical: '/' },
    openGraph: {
        title: `Talk to your Google Analytics — AI for GA4 + Search Console | ${BRAND_NAME}`,
        description:
            'Your AI co-pilot for Google Analytics and Search Console. Ask anything in plain English. Get answers, daily insights, and SEO wins in seconds.',
        url: '/',
    },
};

const reviewSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: `${BRAND_NAME}`,
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
            reviewBody: `We replaced three SEO tools with ${BRAND_NAME}. The striking distance finder alone paid for our subscription in the first week.`,
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
            <LandingHomepage />
        </>
    );
}
