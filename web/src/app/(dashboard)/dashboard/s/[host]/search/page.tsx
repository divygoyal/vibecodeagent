'use client';

import SeoPage from '../../../seo/page';
import { LegacySitePage } from '../LegacySitePage';

/** Search (GSC, DESIGN 5.5). For now: the old SEO page content. */
export default function SiteSearchPage() {
    return (
        <LegacySitePage section="search">
            <SeoPage />
        </LegacySitePage>
    );
}
