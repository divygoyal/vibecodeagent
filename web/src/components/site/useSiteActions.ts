'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

import type { AuditReport } from '@/lib/siteAudit';
import { toast } from '@/components/ui/Toaster';
import { actionId } from './lib/actionText';
import type { ActionsResponse, ActionStateRow, ActionStatus, SiteAction } from './lib/types';
import { fetchJson, useJson, useSite, useSiteRange } from './useSiteData';

export interface SiteActionWithStatus extends SiteAction {
    status: ActionStatus;
    updatedAt: string | null;
}

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
            fix: i.recommendation ? [i.recommendation] : ['Open the audit for details.'],
            page: report.url,
            query: null,
            askPrompt: `The site audit of ${label} found: "${i.title}" (${i.category}). ${i.description} How do I fix it?`,
        }));
}

/**
 * Ranked tasks for the current site and range, with the user's done/dismissed
 * state (admin store) and, optionally, the cached homepage audit's issues.
 */
export function useSiteActions({ includeAudit = false, enabled = true }: { includeAudit?: boolean; enabled?: boolean } = {}) {
    const site = useSite();
    const { gscQuery, ga4Query } = useSiteRange();
    const key = useMemo(() => {
        if (!enabled || (!site.gsc && !site.ga4)) return null;
        const p = new URLSearchParams();
        if (site.gsc) p.set('site', site.gsc);
        if (site.ga4) p.set('property', site.ga4);
        p.set('label', site.siteHost ?? site.label);
        const t = new URLSearchParams(ga4Query);
        const pre = (k: string) => `t${k[0].toUpperCase()}${k.slice(1)}`;
        return `/api/site/actions?${p.toString()}&${gscQuery}&${[...t].map(([k, v]) => `${pre(k)}=${encodeURIComponent(v)}`).join('&')}`;
    }, [enabled, site.gsc, site.ga4, site.siteHost, site.label, gscQuery, ga4Query]);

    const actions = useJson<ActionsResponse>(key);
    const stateKey = enabled && site.host ? `/api/site/actions/state?site=${encodeURIComponent(site.host)}` : null;
    const states = useSWR<{ states: ActionStateRow[]; unavailable?: boolean }>(stateKey, fetchJson, { revalidateOnFocus: false });
    const audit = useJson<AuditReport>(includeAudit && enabled && site.homeUrl ? `/api/site/audit?url=${encodeURIComponent(site.homeUrl)}` : null, { errorRetryCount: 0, dedupingInterval: 10 * 60_000 });

    const list: SiteActionWithStatus[] = useMemo(() => {
        const byId = new Map((states.data?.states ?? []).map((s) => [s.actionId, s]));
        const all = [...(actions.data?.actions ?? []), ...auditActions(audit.data, site.siteHost ?? site.label)];
        return all.map((a) => {
            const s = byId.get(a.id);
            return { ...a, status: s?.status ?? 'open', updatedAt: s?.updatedAt ?? null };
        });
    }, [actions.data, audit.data, states.data, site.siteHost, site.label]);

    const { mutate: mutateStates } = states;
    const host = site.host;
    /** Save a status (optimistic). Throws when the store refuses. */
    const write = useCallback(async (action: SiteAction, status: ActionStatus) => {
        const optimistic = (cur?: { states: ActionStateRow[] }) => {
            const rest = (cur?.states ?? []).filter((s) => s.actionId !== action.id);
            return { states: status === 'open' ? rest : [{ actionId: action.id, status, updatedAt: new Date().toISOString() }, ...rest] };
        };
        await mutateStates(async (cur) => {
            await fetchJson('/api/site/actions/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ site: host, actionId: action.id, status, title: action.title }),
            });
            return optimistic(cur);
        }, { optimisticData: optimistic, rollbackOnError: true, revalidate: false });
    }, [mutateStates, host]);

    /** Save a status; with `undo`, a toast offers to put the previous status back. */
    const setStatus = useCallback(async (action: SiteAction, status: ActionStatus, opts: { undo?: ActionStatus } = {}) => {
        try {
            await write(action, status);
            if (opts.undo) {
                const undo = opts.undo;
                toast(status === 'done' ? 'Marked done' : status === 'dismissed' ? 'Dismissed' : 'Moved back to open', {
                    action: { label: 'Undo', onClick: () => { write(action, undo).catch(() => toast.error("Couldn't undo. Try again.")); } },
                });
            }
        } catch {
            toast.error("Couldn't save that. Try again.");
        }
    }, [write]);

    return {
        list,
        actions,
        states,
        audit,
        setStatus,
        /** The store is unreachable (no admin API): Done/Dismiss are hidden. */
        saveUnavailable: Boolean(states.data?.unavailable),
    };
}
