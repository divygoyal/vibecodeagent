'use client';

import { LegacySiteRedirect } from '@/components/shell/LegacySiteRedirect';

/** /dashboard/seo moved to /dashboard/s/<host>/search (the page file is that route's content for now). */
export default function SeoLegacyLayout() {
    return <LegacySiteRedirect section="search" />;
}
