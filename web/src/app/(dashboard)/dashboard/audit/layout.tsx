'use client';

import { LegacySiteRedirect } from '@/components/shell/LegacySiteRedirect';

/** /dashboard/audit moved to /dashboard/s/<host>/actions (the page file is that route's content for now). */
export default function AuditLegacyLayout() {
    return <LegacySiteRedirect section="actions" />;
}
