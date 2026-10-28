import { headers } from 'next/headers';

import { ShareNotFound } from '@/components/share/ShareChrome';

/**
 * /share/<token>/events with a token that does not exist: 404 with the not-available card (round 7, like /view and
 * /embed/d). A server component: ShareNotFound builds its button with ui/buttonStyles (no client function).
 * Inside an iframe the card has no "Visit" button, as on the page.
 */
export default async function ShareEventsNotFound() {
    const embed = (await headers()).get('sec-fetch-dest') === 'iframe';
    return <ShareNotFound isEmbed={embed} what="events report" />;
}
