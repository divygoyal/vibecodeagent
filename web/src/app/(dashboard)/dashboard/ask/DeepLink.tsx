'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { useRegistration } from '@/components/shell/workspaceContext';

export interface DeepLinkOptions {
    /** Seo-surface tag (`seo:cannibalization`): lets the chat backend pick the first tool. */
    fromTag?: string;
    /** `&prefill=1`: put the question in the composer instead of sending it. */
    prefillOnly?: boolean;
}

/**
 * `/dashboard/ask?q=<question>` deep links (Actions, "Ask AI about this" menus,
 * report emails, the command palette).
 *
 * - The question is handed to `onQuestion` once; the URL is scrubbed straight
 *   away so a refresh or Back does not run it again. The page decides what to do
 *   with it: send it, or, when Ask cannot answer (AI unavailable, no messages
 *   left) or `&prefill=1` is set, put it in the composer.
 * - `&property=<id>&site=<url>` first switches the workspace to that site (report
 *   emails are about one property while the user may be on another), after
 *   checking it still exists in the user's inventory.
 * - Waits for `ready` (workspace and Google data loaded) so the answer is
 *   grounded in the right site.
 *
 * Lives in its own component so `useSearchParams` stays inside a Suspense boundary.
 */
export function QuestionFromQuery({ ready, onQuestion }: { ready: boolean; onQuestion: (q: string, opts: DeepLinkOptions) => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { selectedProperty, selectedSite, saveWorkspace, isWorkspaceLoaded } = useRegistration();
    // The last query string we fired for (not a one-shot boolean): same-route
    // navigation re-renders this page in place, so a boolean would swallow every
    // later ?q=. The ref resets once the URL is scrubbed.
    const firedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isWorkspaceLoaded) return;
        const q = searchParams.get('q');
        if (!q || !q.trim()) {
            if (firedRef.current !== null) firedRef.current = null;
            return;
        }
        if (!ready) return;
        if (firedRef.current === q) return; // strict-mode double invoke, or the scrub has not landed yet
        firedRef.current = q;

        const reqProperty = (searchParams.get('property') || '').trim();
        const reqSite = (searchParams.get('site') || '').trim();
        const reqFromTag = (searchParams.get('__from') || '').trim() || undefined;
        const prefillOnly = searchParams.get('prefill') === '1';
        const needSwitch = (reqProperty && reqProperty !== selectedProperty) || (reqSite && reqSite !== selectedSite);

        const params = new URLSearchParams(searchParams.toString());
        for (const k of ['q', 'property', 'site', '__from', 'prefill']) params.delete(k);
        const qs = params.toString();
        router.replace(`/dashboard/ask${qs ? `?${qs}` : ''}`);

        const labelFromSite = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

        // Confirm the property and site from the email are still in the user's
        // GA4 and Search Console inventory before saving them.
        const validateInventory = async (): Promise<{ propertyOk: boolean; siteOk: boolean }> => {
            try {
                const [propRes, siteRes] = await Promise.all([
                    fetch('/api/analytics/properties', { cache: 'no-store', signal: AbortSignal.timeout(5_000) }),
                    fetch('/api/seo/sites', { cache: 'no-store', signal: AbortSignal.timeout(5_000) }),
                ]);
                const propJson = propRes.ok ? await propRes.json() : null;
                const siteJson = siteRes.ok ? await siteRes.json() : null;
                const properties: unknown[] = Array.isArray(propJson?.properties) ? propJson.properties : [];
                const sites: unknown[] = Array.isArray(siteJson?.sites) ? siteJson.sites : [];
                const propertyIds = properties.map((p) => (p as { property?: string }).property).filter((x): x is string => typeof x === 'string' && x.length > 0);
                const siteUrls = sites.map((s) => (s as { siteUrl?: string }).siteUrl).filter((x): x is string => typeof x === 'string' && x.length > 0);
                return { propertyOk: !reqProperty || propertyIds.includes(reqProperty), siteOk: !reqSite || siteUrls.includes(reqSite) };
            } catch {
                // Inventory unreachable: fail open, like before.
                return { propertyOk: true, siteOk: true };
            }
        };

        const fire = async () => {
            if (needSwitch && reqProperty && reqSite) {
                const { propertyOk, siteOk } = await validateInventory();
                if (!propertyOk || !siteOk) {
                    toast.warning(`${labelFromSite(reqSite)} is no longer available, so this answer uses your current site.`);
                } else {
                    try {
                        const ok = await saveWorkspace({ property: reqProperty, site: reqSite });
                        if (ok) toast.info(`Switched to ${labelFromSite(reqSite)}`);
                    } catch {
                        /* best effort */
                    }
                }
            }
            // Short delay so the workspace change reaches the data hooks.
            setTimeout(() => onQuestion(q, { fromTag: reqFromTag, prefillOnly }), needSwitch ? 350 : 0);
        };
        void fire();
    }, [searchParams, router, onQuestion, saveWorkspace, selectedProperty, selectedSite, isWorkspaceLoaded, ready]);

    return null;
}

/**
 * `?connected=google|github` after a sign-in round trip: register the provider
 * with the admin API, toast, then clean the URL. Other leftover params from the
 * removed GitHub App flow (`installed`, `action`, `why`) are dropped silently.
 */
export function ProviderConnectionCallback({ onConnected }: { onConnected: () => void }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const handledRef = useRef(false);

    useEffect(() => {
        const stale = ['installed', 'action', 'why'].some((k) => searchParams.has(k));
        const connected = searchParams.get('connected');
        if (connected !== 'github' && connected !== 'google') {
            if (stale) {
                const params = new URLSearchParams(searchParams.toString());
                for (const k of ['installed', 'action', 'why']) params.delete(k);
                const qs = params.toString();
                router.replace(`/dashboard/ask${qs ? `?${qs}` : ''}`);
            }
            return;
        }
        if (handledRef.current) return;
        handledRef.current = true;

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/auth/register-provider', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: connected }),
                });
                if (!cancelled) {
                    if (res.ok) {
                        toast.success(connected === 'github' ? 'GitHub connected' : 'Google connected');
                        onConnected();
                    } else {
                        toast.error(`Failed to register ${connected} connection.`);
                    }
                }
            } catch {
                if (!cancelled) toast.error(`Failed to register ${connected} connection.`);
            } finally {
                if (!cancelled) {
                    const params = new URLSearchParams(searchParams.toString());
                    for (const k of ['connected', 'installed', 'action', 'why']) params.delete(k);
                    const qs = params.toString();
                    router.replace(`/dashboard/ask${qs ? `?${qs}` : ''}`);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [searchParams, router, onConnected]);

    return null;
}
