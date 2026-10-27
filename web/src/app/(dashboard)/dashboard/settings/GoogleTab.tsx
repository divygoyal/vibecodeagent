'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState } from 'react';
import { BarChart3, ExternalLink, ListChecks, Search, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';

import { SettingsSection } from '@/components/app/SettingsSection';
import { Avatar } from '@/components/ui/Avatar';
import { Banner } from '@/components/ui/Banner';
import { Button, GoogleMark } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; provider?: string };

const SCOPES = [
    {
        icon: Search,
        title: 'See your Search Console data',
        body: 'Queries, pages, clicks, impressions and position for the sites you have access to. Read only.',
        scope: 'webmasters.readonly',
    },
    {
        icon: BarChart3,
        title: 'See your Google Analytics data',
        body: 'Users, sessions, channels, pages and events for your GA4 properties. Read only.',
        scope: 'analytics.readonly',
    },
    {
        icon: UserRound,
        title: 'Know who you are',
        body: 'Your name, email address and profile photo, to sign you in.',
        scope: 'openid email profile',
    },
] as const;

/** Google connection (DESIGN 5.14): the connected account, Reconnect, and what each permission is for. */
export function GoogleTab({ connected }: { connected: boolean }) {
    const { data: session } = useSession();
    const user = session?.user as SessionUser | undefined;
    const [connecting, setConnecting] = useState(false);
    // The session identity is the Google account only when Google is the sign-in provider.
    const account = user?.provider === 'github' ? null : user?.email ?? null;

    const connect = () => {
        setConnecting(true);
        void signIn('google', { callbackUrl: '/dashboard/settings?tab=google&connected=google' }, { prompt: 'select_account consent' });
    };

    return (
        <>
            <SettingsSection
                title="Google account"
                description="One connection gives TrafficClaw read-only access to Search Console and Analytics."
            >
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
                        {account ? <Avatar name={user?.name ?? account} src={user?.image} size={40} /> : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle"><GoogleMark size={20} /></span>
                        )}
                        <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
                                <span className="truncate">{account ?? 'Google'}</span>
                                <Pill tone={connected ? 'up' : 'warn'} dot>{connected ? 'Connected' : 'Not connected'}</Pill>
                            </p>
                            <p className="mt-0.5 text-body-sm text-fg-muted">
                                {connected ? 'Search Console and Analytics, read only' : 'Connect to see your sites and ask about them'}
                            </p>
                        </div>
                    </div>
                    <Button variant={connected ? 'secondary' : 'google'} loading={connecting} onClick={connect}>
                        {connected ? 'Reconnect' : <><GoogleMark />Connect Google</>}
                    </Button>
                </div>
                {connected ? (
                    <p className="mt-4 text-body-sm text-fg-muted">
                        Reconnect if a site is missing, you switched accounts, or Google asked you to sign in again.{' '}
                        <Link href="/dashboard/setup" className="text-fg-secondary underline decoration-border-strong underline-offset-2 hover:text-fg">Review your sites</Link>
                    </p>
                ) : (
                    <Banner variant="warn" className="mt-4">Without a Google connection there is no data to show. Connect once and every site you can open in Google appears in your portfolio.</Banner>
                )}
            </SettingsSection>

            <SettingsSection title="What you are allowing" description="We ask for the smallest set of permissions that does the job.">
                <ul className="flex flex-col gap-4">
                    {SCOPES.map((s) => {
                        const Icon = s.icon;
                        return (
                            <li key={s.scope} className="flex items-start gap-3">
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                                    <Icon aria-hidden size={16} strokeWidth={1.75} />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-body font-medium text-fg">{s.title}</p>
                                    <p className="mt-0.5 text-body-sm text-fg-muted">{s.body}</p>
                                    <code className="mt-1 inline-block rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">{s.scope}</code>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <div className="mt-5 flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-body-sm text-fg-secondary">
                    <ListChecks aria-hidden size={16} className="mt-0.5 shrink-0 text-fg-muted" />
                    <p>
                        We never change anything in your Google accounts: no editing properties, no verifying sites, no sending email.
                        You can remove our access at any time in your{' '}
                        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text underline underline-offset-2">
                            Google account permissions<ExternalLink aria-hidden size={12} />
                        </a>.
                    </p>
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-meta text-fg-muted"><ShieldCheck aria-hidden size={14} />Tokens are encrypted on our servers.</p>
            </SettingsSection>
        </>
    );
}
