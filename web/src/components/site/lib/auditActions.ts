/**
 * Homepage-audit issues as fix-list tasks (pure: the site pages through useSiteActions, and the home page's sample
 * fix list on the server, so both count the same tasks).
 */
import type { AuditReport } from '@/lib/siteAudit';
import { actionId } from './actionText';
import type { SiteAction } from './types';

/** Audit issues (critical + warnings) as tasks. */
export function auditActions(report: AuditReport | undefined, label: string): SiteAction[] {
    if (!report) return [];
    return report.issues
        .filter((i) => i.severity === 'critical' || i.severity === 'warning')
        .map((i) => ({
            id: actionId('audit', `${report.url}|${i.id}|${i.title}`),
            type: 'audit' as const,
            area: 'Technical' as const,
            impact: i.severity === 'critical' ? 'high' as const : 'medium' as const,
            title: i.title,
            summary: `${i.description}${i.value ? ` (${i.value})` : ''}`,
            evidence: [
                { label: 'Page', value: report.url.replace(/^https?:\/\//, '') },
                { label: 'Check', value: i.category },
                ...(i.value ? [{ label: 'Found', value: i.value }] : []),
            ],
            expectedImpact: i.severity === 'critical' ? 'Fixes a problem that can stop pages ranking' : 'Small ranking and click-through gain',
            score: i.severity === 'critical' ? 40 : 10,
            gain: null,
            fix: i.recommendation ? [i.recommendation] : ['Open the audit for details.'],
            page: report.url,
            query: null,
            askPrompt: `The site audit of ${label} found: "${i.title}" (${i.category}). ${i.description} How do I fix it?`,
        }));
}
