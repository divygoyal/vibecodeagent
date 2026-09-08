import type { Metadata } from 'next';
import ContactClient from './ContactClient';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
    title: `Contact Us | ${BRAND_NAME}`,
    description: 'Have a question or need help? Send us a message and we\'ll get back to you as soon as possible.',
};

export default function ContactPage() {
    return <ContactClient />;
}
