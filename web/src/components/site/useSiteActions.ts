'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import useSWR from 'swr';

import type { AuditReport } from '@/lib/siteAudit';
import { toast } from '@/components/ui/Toaster';
import { useDemoSession } from '@/components/demo/useDemoSession';
import { rankByImpact } from './lib/actionText';
import { auditActions } from './lib/auditActions';
import type { ActionsResponse, ActionStateRow, ActionStatus, SiteAction } from './lib/types';
import { fetchJson, useJson, useSite, useSiteRange } from './useSiteData';

/**
 * Public live demo (round 7 audit #3): the demo is read-only, so Done / Dismiss never reach the store (the server
 * would refuse them and the visitor saw "Couldn't save that"). They stay in this tab instead, like the home page's
 * sample fix list, and the toast says nothing is saved. One store per tab so the Overview and Actions agree.
 */
const demoStates = new Map<string, ActionStateRow[]>();
const demoListeners = new Set<() => void>();
const EMPTY_STATES: ActionStateRow[] = [];
function subscribeDemoStates(fn: () => void) {
    demoListeners.add(fn);
    return () => { demoListeners.delete(fn); };
}
function setDemoState(host: string, actionId: string, status: ActionStatus) {
    const rest = (demoStates.get(host) ?? []).filter((s) => s.actionId !== actionId);
    demoStates.set(host, status === 'open' ? rest : [{ actionId, status, updatedAt: new Date().toISOString() }, ...rest]);
    for (const fn of demoListeners) fn();
}

export interface SiteActionWithStatus extends SiteAction {
    status: ActionStatus;
    updatedAt: string | null;
}

/**
 * Ranked tasks for the current site and range, with the user's done/dismissed
 * state (admin store) and, optionally, the cached homepage audit's issues.
 * The Overview and Actions both pass includeAudit so their open counts agree
 * (round 4: the Overview said 16 because it left out the 2 audit tasks).
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
    const { demo } = useDemoSession();
    const stateKey = enabled && site.host && !demo ? `/api/site/actions/state?site=${encodeURIComponent(site.host)}` : null;
    const states = useSWR<{ states: ActionStateRow[]; unavailable?: boolean }>(stateKey, fetchJson, { revalidateOnFocus: false });
    const host = site.host;
    const localStates = useSyncExternalStore(subscribeDemoStates, () => demoStates.get(host) ?? EMPTY_STATES, () => EMPTY_STATES);
    const stateRows = demo ? localStates : states.data?.states;
    const audit = useJson<AuditReport>(includeAudit && enabled && site.homeUrl ? `/api/site/audit?url=${encodeURIComponent(site.homeUrl)}` : null, { errorRetryCount: 0, dedupingInterval: 10 * 60_000 });

    const list: SiteActionWithStatus[] = useMemo(() => {
        const byId = new Map((stateRows ?? []).map((s) => [s.actionId, s]));
        const all = [...(actions.data?.actions ?? []), ...auditActions(audit.data, site.siteHost ?? site.label)];
        return all.map((a) => {
            const s = byId.get(a.id);
            return { ...a, status: s?.status ?? 'open', updatedAt: s?.updatedAt ?? null };
        });
    }, [actions.data, audit.data, stateRows, site.siteHost, site.label]);

    /** Open tasks in the one shared order (Overview top 3 = the first 3 rows of Actions). */
    const open = useMemo(() => rankByImpact(list.filter((a) => a.status === 'open')), [list]);
    /** Counts are final: the tasks and (when asked for) the audit have answered, so both pages show the same number. */
    const settled = Boolean(actions.data) && audit.state !== 'loading' && (!stateKey || states.data !== undefined || states.error !== undefined);

    const { mutate: mutateStates } = states;
    /** Save a status (optimistic). Throws when the store refuses. In the demo it only changes this tab. */
    const write = useCallback(async (action: SiteAction, status: ActionStatus) => {
        if (demo) {
            setDemoState(host, action.id, status);
            return;
        }
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
    }, [mutateStates, host, demo]);

    /** Save a status; with `undo`, a toast offers to put the previous status back. */
    const setStatus = useCallback(async (action: SiteAction, status: ActionStatus, opts: { undo?: ActionStatus } = {}) => {
        try {
            await write(action, status);
            if (opts.undo || demo) {
                const undo = opts.undo;
                toast(status === 'done' ? 'Marked done' : status === 'dismissed' ? 'Dismissed' : 'Moved back to open', {
                    ...(demo ? { description: 'Sample data: this tab only, nothing is saved.' } : {}),
                    ...(undo ? { action: { label: 'Undo', onClick: () => { write(action, undo).catch(() => toast.error("Couldn't undo. Try again.")); } } } : {}),
                });
            }
        } catch {
            toast.error("Couldn't save that. Try again.");
        }
    }, [write, demo]);

    return {
        list,
        open,
        settled,
        actions,
        states,
        audit,
        setStatus,
        /** The store is unreachable (no admin API): Done/Dismiss are hidden. */
        saveUnavailable: !demo && Boolean(states.data?.unavailable),
        /** Public demo: Done / Dismiss only change this tab (the toast says so). */
        localOnly: demo,
    };
}
