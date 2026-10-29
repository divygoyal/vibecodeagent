'use client';

import { useState } from 'react';

/** A directory's badge image; when the directory stops serving it, its name shows instead (the link stays). */
export function FeaturedBadge({ name, src, decorative }: { name: string; src?: string; decorative?: boolean }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return <span className="whitespace-nowrap rounded-control border border-border px-2.5 py-1.5 text-meta font-medium text-fg-muted">{name}</span>;
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element -- third-party badges as each directory issued them
        <img
            // An image that failed before hydration never fires onError for React, so check when it mounts too.
            ref={(img) => { if (img?.complete && img.naturalWidth === 0) setFailed(true); }}
            src={src} alt={decorative ? '' : `${name} badge`} loading="lazy" decoding="async" onError={() => setFailed(true)}
            className="h-9 w-auto max-w-none"
        />
    );
}
