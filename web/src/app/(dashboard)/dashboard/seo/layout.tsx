'use client';

import { LegacySiteRedirect } from '@/components/shell/LegacySiteRedirect';

/** /dashboard/seo moved to /dashboard/s/<host>/search (keeps the query). Waits for the saved site; never shows a demo site. */
export default function SeoLegacyLayout() {
    return <LegacySiteRedirect section="search" />;
}
