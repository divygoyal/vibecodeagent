'use client';

import AuditPage from '../../../audit/page';
import { LegacySitePage } from '../LegacySitePage';

/** Actions ("What to fix next", DESIGN 5.8). For now: the old site audit. */
export default function SiteActionsPage() {
    return (
        <LegacySitePage section="actions">
            <AuditPage />
        </LegacySitePage>
    );
}
