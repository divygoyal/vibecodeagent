'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowRight, Check, Copy, Gift } from 'lucide-react';

import { SettingsRow, SettingsSection } from '@/components/app/SettingsSection';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtFull } from '@/lib/format';
import { useCredits } from '@/lib/useDashboardData';
import { useLocalStorageString } from '@/lib/useLocalStorage';
import { BRAND_NAME } from '@/lib/brand';
import { useDemoSession } from '@/components/demo/useDemoSession';

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; provider?: string };

const PLAN_LABEL: Record<string, string> = { free: 'Free', starter: 'Starter', growth: 'Growth', pro: 'Pro' };

const noopSubscribe = () => () => {};

/** window.location.origin after hydration, '' on the server and during hydration (no mismatch). */
function useOrigin(): string {
    return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
}

export function ProfileTab() {
    const { data: session, status } = useSession();
    const user = session?.user as SessionUser | undefined;
    const { credits, plan, isError, refresh } = useCredits();
    const { demo } = useDemoSession();
    const provider = user?.provider === 'github' ? 'GitHub' : user?.provider === 'google' ? 'Google' : null;

    return (
        <>
            <SettingsSection title="Profile" description="Your name, email and photo come from the account you signed in with.">
                {status === 'loading' ? (
                    <div className="flex items-center gap-4" aria-busy>
                        <Skeleton className="size-14" rounded="full" delay={0} />
                        <div className="flex flex-col gap-2"><Skeleton className="h-4 w-40" delay={0} /><Skeleton className="h-3.5 w-56" delay={0} /></div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <Avatar name={user?.name ?? user?.email} src={user?.image} size={40} />
                        <div className="min-w-0">
                            <p className="truncate text-title-sm text-fg">{user?.name || `${BRAND_NAME} user`}</p>
                            <p className="truncate text-body text-fg-muted">{user?.email || 'Email not available'}</p>
                            {provider ? <p className="mt-1 text-meta text-fg-muted">Signed in with {provider}</p> : null}
                        </div>
                    </div>
                )}
            </SettingsSection>

            <SettingsSection title="Plan" description="Everything in TrafficClaw is free. Paid plans only add Ask messages.">
                <SettingsRow
                    title={
                        <span className="flex items-center gap-2">
                            {PLAN_LABEL[plan] ?? plan}
                            <Pill tone={plan === 'free' ? 'neutral' : 'brand'}>{plan === 'free' ? 'Current plan' : 'Active'}</Pill>
                        </span>
                    }
                    description={credits !== null ? `${fmtFull(credits)} Ask ${credits === 1 ? 'message' : 'messages'} left`
                        : isError ? (
                            <span className="inline-flex flex-wrap items-center gap-x-2">
                                {isError.status === 429 ? 'Too many requests right now.' : "Couldn't load your Ask messages."}
                                <button type="button" onClick={() => void refresh()} className="tap-area font-medium text-brand-text hover:underline">Try again</button>
                            </span>
                        ) : <Skeleton className="h-3.5 w-40" delay={0} />}
                    control={<Button asChild variant="secondary" size="sm" trailingIcon={ArrowRight}><Link href="/dashboard/plan">Plan and billing</Link></Button>}
                />
            </SettingsSection>

            {/* The shared demo user has no invite link worth sharing (round 7 audit #20). */}
            {demo ? null : <InviteSection email={user?.email ?? ''} />}
        </>
    );
}

function InviteSection({ email }: { email: string }) {
    const origin = useOrigin();
    const [copied, setCopied] = useState(false);
    // Local counter: null on the server and during hydration.
    const [storedCount] = useLocalStorageString('tc-referral-count');
    const invited = parseInt(storedCount || '0', 10) || 0;

    let code = 'invite';
    try {
        if (email) code = btoa(email).slice(0, 8).toLowerCase();
    } catch { /* non-latin1 email: keep the generic code */ }
    const link = origin ? `${origin}?ref=${code}` : '';

    const copy = async () => {
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard blocked */ }
    };

    return (
        <SettingsSection title="Invite a friend" description="Share your link. When a friend signs up, you both get 5 free Ask messages.">
            <div className="flex items-center gap-2">
                <code
                    className="min-h-9 min-w-0 flex-1 truncate rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 font-mono text-body-sm text-fg-secondary"
                    aria-label="Your invite link"
                >
                    {link || ' '}
                </code>
                <Button variant="secondary" icon={copied ? Check : Copy} onClick={() => void copy()} disabled={!link}>
                    {copied ? 'Copied' : 'Copy'}
                </Button>
            </div>
            {invited > 0 ? (
                <p className="mt-2 flex items-center gap-1.5 text-meta text-fg-muted tabular-nums"><Gift aria-hidden size={14} />{invited} invited</p>
            ) : null}
        </SettingsSection>
    );
}
