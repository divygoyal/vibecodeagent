import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
    title: 'Contact Us | TrafficClaw',
    description: 'Have a question or need help? Send us a message and we\'ll get back to you as soon as possible.',
};

export default function ContactPage() {
    return <ContactClient />;
}
