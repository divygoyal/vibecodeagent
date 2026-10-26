import { notFound } from 'next/navigation';

import { StyleguideClient } from './StyleguideClient';

export const metadata = { title: 'Styleguide', robots: { index: false, follow: false } };

/** Every design-system component in every state (dev only, 404 in production). */
export default function StyleguidePage() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <StyleguideClient />;
}
