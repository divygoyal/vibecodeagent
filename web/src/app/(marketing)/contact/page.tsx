import type { Metadata } from 'next';

import { ContentPage } from '@/components/marketing/site/ContentPage';
import { BRAND_NAME } from '@/lib/brand';
import { ContactAlternatives, ContactForm } from './ContactClient';

const TITLE = 'Contact us';
const DESCRIPTION = `Questions about ${BRAND_NAME}, pricing, the leaderboard or the ChatGPT and Claude connector? Send us a message and we will get back to you.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/contact' },
    openGraph: { title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION, url: '/contact' },
    twitter: { card: 'summary_large_image', title: `${TITLE} | ${BRAND_NAME}`, description: DESCRIPTION },
};

export default function ContactPage() {
    return (
        <ContentPage
            crumb="Contact"
            title="Got a question?"
            lead="Features, pricing, the leaderboard or just feedback: send us a message and we'll get back to you as soon as we can."
        >
            <ContactForm />
            <ContactAlternatives />
        </ContentPage>
    );
}
