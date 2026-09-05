import type { Metadata } from 'next';
import PricingClient from './PricingClient';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: 'Pricing — Simple Plans Starting at $19/mo',
    description:
        `Choose your ${BRAND_NAME} plan: Growth ($19/mo, 50 AI credits) or Pro ($29/mo, 100 credits + Telegram bot). Start free with 5 messages.`,
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: `Pricing — Simple Plans Starting at $19/mo | ${BRAND_NAME}`,
        description:
            'Growth $19/mo, Pro $29/mo. All plans include analytics dashboard, SEO tools, AI chat. Start free with 5 messages.',
        url: '/pricing',
    },
};

const pricingFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: 'Is there a free plan?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: `Every new account gets 5 free AI messages to try ${BRAND_NAME}. No credit card required. The full analytics dashboard, SEO tools, and site audit are available on all plans.`,
            },
        },
        {
            '@type': 'Question',
            name: 'What happens when I run out of credits?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'You can still access your analytics dashboard, SEO data, and audit tools. AI chat responses require credits. Credits reset at the start of each billing cycle — no rollover.',
            },
        },
        {
            '@type': 'Question',
            name: 'Can I upgrade or downgrade anytime?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Yes. You can switch plans at any time. When you upgrade, you get immediate access to the new credit amount. Downgrades take effect at the next billing cycle.',
            },
        },
        {
            '@type': 'Question',
            name: 'What payment methods do you accept?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'We accept all major credit cards, debit cards, and select digital wallets through our payment provider Dodo Payments. All transactions are encrypted and secure.',
            },
        },
        {
            '@type': 'Question',
            name: 'Do I need to connect Google Analytics?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Google Analytics and Search Console connections are optional but recommended. Without them, you can still use site audit, AI SEO tools, and content generation features.',
            },
        },
        {
            '@type': 'Question',
            name: 'Is my data safe?',
            acceptedAnswer: {
                '@type': 'Answer',
                text: 'Absolutely. We use OAuth 2.0 for secure authentication, encrypted token storage, and strict data isolation. We never share your data with third parties or use it for AI training.',
            },
        },
    ],
};

const productSchema = [
    {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: `${BRAND_NAME} Growth`,
        description: 'AI-powered SEO & analytics with 50 AI credits per month. Includes full analytics dashboard, SEO tools, audit, AI chat, priority AI, advanced SEO intelligence, and multi-site support.',
        url: 'https://trafficclaw.com/pricing',
        brand: { '@type': 'Brand', name: `${BRAND_NAME}` },
        offers: {
            '@type': 'Offer',
            price: '19',
            priceCurrency: 'USD',
            priceValidUntil: '2027-12-31',
            availability: 'https://schema.org/InStock',
            url: 'https://trafficclaw.com/pricing',
        },
    },
    {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: `${BRAND_NAME} Pro`,
        description: 'Full-power AI SEO & analytics with 100 AI credits per month. Includes Telegram bot, priority support, custom alerts, unlimited audits, and early feature access.',
        url: 'https://trafficclaw.com/pricing',
        brand: { '@type': 'Brand', name: `${BRAND_NAME}` },
        offers: {
            '@type': 'Offer',
            price: '29',
            priceCurrency: 'USD',
            priceValidUntil: '2027-12-31',
            availability: 'https://schema.org/InStock',
            url: 'https://trafficclaw.com/pricing',
        },
    },
];

export default function PricingPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingFaqSchema) }}
            />
            {productSchema.map((schema, i) => (
                <script
                    key={i}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
                />
            ))}
            <PricingClient />
        </>
    );
}
