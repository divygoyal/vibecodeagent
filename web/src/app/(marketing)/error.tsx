'use client';

import { ErrorScreen } from '@/components/app/ErrorScreen';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Marketing-segment error boundary. Catches render crashes (most often Chrome
 * auto-translate vs React: "Failed to execute 'removeChild' on 'Node'") inside
 * the light public layout, before they reach global-error.tsx.
 */
export default function MarketingError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
    return <ErrorScreen error={error} scope="marketing" description={`${BRAND_NAME} hit an unexpected error loading this page. Reload to try again.`} />;
}
