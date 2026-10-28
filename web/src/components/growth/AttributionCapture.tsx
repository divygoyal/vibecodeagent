'use client';

import { useEffect } from 'react';

import { captureFirstTouch } from '@/lib/growth/track';

/** Remembers where a visitor came from (?ref=, utm_*) so the sign-up can say so. Renders nothing. */
export function AttributionCapture() {
    useEffect(() => { captureFirstTouch(); }, []);
    return null;
}
