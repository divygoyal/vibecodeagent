'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { ArrowRight, Check, MessageSquare, Plug, Sparkles } from 'lucide-react';

import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { getSafeRedirectUrl } from '@/lib/checkout';
import { fmtDay, fmtDayYear, fmtFull } from '@/lib/format';
import { useCredits } from '@/lib/useDashboardData';
import { FAQ, INCLUDED_IN_ALL, PLANS, planByKey, type PlanDef } from './billing';
import { DemoNotice } from '@/components/demo/DemoNotice';
import { useDemoSession } from '@/components/demo/useDemoSession';

/**
 * Plan and billing (DESIGN 5.15). Everything in TrafficClaw is free; paid plans
 * only add Ask messages. The Dodo checkout links, the cancel call and the
 * credits hook are the ones the page always used.
 */
export default function PlanPage() {
    // Public live demo: nothing to buy or cancel on the shared demo account.
    const { demo } = useDemoSession();
    if (demo) {
        return (
            <div className="space-y-6">
                <PageHeader title="Plan" subtitle="Everything in TrafficClaw is free. Paid plans only add Ask messages." />
                <DemoNotice title="Plans belong to your own account" secondary={{ href: '/pricing', label: 'See pricing' }}>
                    This is the demo, so there is nothing to buy here. Connect Google to see your own sites, free.
                </DemoNotice>
            </div>
        );
    }
    return (
        <Suspense fallback={<PlanSkeleton />}>
            <PlanContent />
        </Suspense>
    );
}

function PlanContent() {
    const { data: session } = useSession();
    const { credits, plan, subscriptionEnd, subscriptionCancelled, refresh: refreshCredits } = useCredits();
    const searchParams = useSearchParams();
    const justUpgraded = useMemo(() => searchParams.get('upgraded') === 'true', [searchParams]);

    const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(justUpgraded);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelSuccess, setCancelSuccess] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    // Back from checkout (?upgraded=true): refresh the balance, show the banner once, clean the URL.
    useEffect(() => {
        if (!justUpgraded) return;
        void refreshCredits();
        window.history.replaceState({}, '', '/dashboard/plan');
        const t = setTimeout(() => setShowUpgradeSuccess(false), 8000);
        return () => clearTimeout(t);
    }, [justUpgraded, refreshCredits]);

    const handleCancelSubscription = async () => {
        setCancelling(true);
        setCancelError(null);
        try {
            const res = await fetch('/api/subscription/cancel', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                setCancelError(data.error || 'Could not cancel the subscription.');
                return;
            }
            setCancelSuccess(true);
            setShowCancelModal(false);
            void refreshCredits();
        } catch {
            setCancelError('Something went wrong. Please try again.');
        } finally {
            setCancelling(false);
        }
    };

    const current = planByKey(plan);
    const paid = plan !== 'free';
    const renewal = subscriptionEnd ? fmtDayYear(subscriptionEnd) : null;

    return (
        <div className="max-w-[1040px]">
            <PageHeader title="Plan" subtitle="Everything in TrafficClaw is free. Paid plans add more messages in Ask." />

            <div className="flex flex-col gap-6">
                {showUpgradeSuccess ? (
                    <Banner variant="success" title="Payment received" onDismiss={() => setShowUpgradeSuccess(false)}>
                        Your plan is being activated. It can take a moment to show up here.
                    </Banner>
                ) : null}
                {cancelSuccess ? (
                    <Banner variant="warn" title="Subscription cancelled" onDismiss={() => setCancelSuccess(false)}>
                        Your plan stays active until {renewal || 'the end of the billing period'}. You will not be charged again.
                    </Banner>
                ) : null}

                <UsageCard
                    current={current}
                    credits={credits}
                    renewal={renewal}
                    cancelled={subscriptionCancelled}
                    onCancel={() => { setCancelError(null); setShowCancelModal(true); }}
                />

                <section aria-labelledby="plans-title">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 id="plans-title" className="text-title text-fg">{paid ? 'Change plan' : 'Get more messages'}</h2>
                            <p className="mt-0.5 text-body-sm text-fg-muted">Every plan has every feature. Pick how many Ask messages you need.</p>
                        </div>
                        <span className="text-meta text-fg-muted">Cancel any time</span>
                    </div>
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                        {PLANS.filter((p) => p.available).map((p) => (
                            <PlanCard key={p.key} def={p} current={plan} email={session?.user?.email ?? ''} />
                        ))}
                    </div>
                    <p className="mt-3 text-center text-meta text-fg-muted">Secure payments by Dodo Payments. Switch plans freely.</p>
                </section>

                <RecentActivity />

                <Faq />
            </div>

            <Modal
                open={showCancelModal}
                onOpenChange={(o) => { setShowCancelModal(o); if (!o) setCancelError(null); }}
                size="sm"
                title="Cancel subscription?"
                description="This stops future renewals. Your plan stays active until the end of the billing period."
                footer={(
                    <>
                        <Button variant="secondary" disabled={cancelling} onClick={() => setShowCancelModal(false)}>Keep my plan</Button>
                        <Button variant="danger" loading={cancelling} onClick={() => void handleCancelSubscription()}>Cancel subscription</Button>
                    </>
                )}
            >
                <p className="text-body text-fg-secondary">
                    Your <span className="font-medium text-fg">{current.label}</span> plan stays active until{' '}
                    <span className="font-medium text-fg">{renewal || 'the end of your billing period'}</span>. After that you move to Free. Messages you have left stay usable until then.
                </p>
                {cancelError ? <Banner variant="danger" className="mt-3">{cancelError}</Banner> : null}
            </Modal>
        </div>
    );
}

/* ─── usage ─── */

function UsageCard({ current, credits, renewal, cancelled, onCancel }: {
    current: PlanDef;
    credits: number | null;
    renewal: string | null;
    cancelled: boolean;
    onCancel: () => void;
}) {
    const paid = current.key !== 'free';
    const max = Math.max(current.messages, credits ?? 0);
    const pct = credits !== null && max > 0 ? Math.max(0, Math.min(100, (credits / max) * 100)) : 0;
    const level = credits === 0 ? 'out' : pct < 20 ? 'low' : 'ok';

    return (
        <Card as="section" aria-labelledby="usage-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="usage-title" className="text-title-sm text-fg">Ask messages</h2>
                    <p className="mt-0.5 text-body-sm text-fg-muted">
                        {paid ? `${current.label} plan · $${current.price} a month` : 'Free plan'}
                    </p>
                </div>
                {paid && renewal ? (
                    <Badge variant={cancelled ? 'warn' : 'outline'} className="normal-case tracking-normal">
                        {cancelled ? `Active until ${renewal}` : `Renews ${renewal}`}
                    </Badge>
                ) : null}
            </div>

            <div className="mt-5">
                {credits === null ? (
                    <Skeleton className="h-9 w-48" delay={0} />
                ) : (
                    <p className="flex flex-wrap items-baseline gap-x-2 text-fg">
                        <span className="text-stat-lg tabular-nums">{fmtFull(credits)}</span>
                        <span className="text-body text-fg-muted">
                            {credits === 1 ? 'message' : 'messages'} left{paid ? ` of ${fmtFull(max)} this month` : ''}
                        </span>
                        {level === 'out' ? <Badge variant="down">Out of messages</Badge> : level === 'low' ? <Badge variant="warn">Running low</Badge> : null}
                    </p>
                )}
                <div
                    role="progressbar"
                    aria-label="Ask messages left"
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-valuenow={credits ?? 0}
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-subtle"
                >
                    <span
                        className={cn('block h-full rounded-full transition-[width] duration-300', level === 'out' ? 'bg-down' : level === 'low' ? 'bg-warn' : 'bg-brand')}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <p className="mt-3 flex items-start gap-2 text-body-sm text-fg-muted">
                    <Plug aria-hidden size={14} className="mt-0.5 shrink-0" />
                    <span>
                        Tip: questions you ask ChatGPT or Claude through{' '}
                        <Link href="/dashboard/connect-ai" className="text-fg-secondary underline decoration-border-strong underline-offset-2 hover:text-fg">Connect AI</Link>{' '}
                        do not use these messages.
                    </span>
                </p>
            </div>

            {paid ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
                    <p className="text-body-sm text-fg-muted">
                        {cancelled ? `Cancelled. Your plan stays active until ${renewal ?? 'the end of the billing period'}.` : 'Messages reset every billing cycle and do not roll over.'}
                    </p>
                    {!cancelled ? <Button variant="ghost" size="sm" onClick={onCancel} className="text-fg-muted hover:text-down">Cancel subscription</Button> : null}
                </div>
            ) : null}
        </Card>
    );
}

/* ─── plan cards ─── */

function PlanCard({ def, current, email }: { def: PlanDef; current: string; email: string }) {
    const isCurrent = def.key === current;
    const isFree = def.key === 'free';
    const returnUrl = getSafeRedirectUrl('/dashboard/plan?upgraded=true');
    const checkoutUrl = def.productId && email
        ? `https://checkout.dodopayments.com/buy/${def.productId}?email=${encodeURIComponent(email)}&redirect_url=${encodeURIComponent(returnUrl)}`
        : '';
    const order = PLANS.filter((p) => p.available).map((p) => p.key);
    const isUpgrade = order.indexOf(current as PlanDef['key']) < order.indexOf(def.key);
    const perMessage = !isFree && def.messages > 0 ? `$${(def.price / def.messages).toFixed(2)} per message` : null;

    return (
        <Card
            as="article"
            aria-label={`${def.label} plan`}
            className={cn('flex flex-col', isCurrent ? 'border-brand ring-1 ring-brand' : undefined)}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-title text-fg">{def.label}</h3>
                {isCurrent ? <Badge variant="brand">Current plan</Badge> : def.recommended ? <Badge variant="neutral">Most popular</Badge> : null}
            </div>
            <p className="mt-0.5 text-body-sm text-fg-muted">{def.blurb}</p>

            <p className="mt-5 flex items-baseline gap-1">
                <span className="text-stat-lg tabular-nums text-fg">${def.price}</span>
                {isFree ? null : <span className="text-body text-fg-muted">/ month</span>}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-body font-medium text-fg">
                <MessageSquare aria-hidden size={14} className="text-fg-muted" />
                {isFree ? `${def.messages} Ask messages to start` : `${def.messages} Ask messages a month`}
            </p>
            {perMessage ? <p className="mt-0.5 text-meta text-fg-muted tabular-nums">{perMessage}</p> : null}

            <div className="mt-5">
                {isCurrent ? (
                    <Button variant="secondary" className="w-full" disabled>Current plan</Button>
                ) : isFree ? (
                    <Button variant="secondary" className="w-full" disabled>Included</Button>
                ) : !checkoutUrl ? (
                    <Button variant="secondary" className="w-full" disabled>Email required</Button>
                ) : (
                    <Button asChild variant={def.recommended ? 'primary' : 'secondary'} className="w-full" trailingIcon={ArrowRight}>
                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                            {isUpgrade || current === 'free' ? `Get ${def.label}` : `Switch to ${def.label}`}
                        </a>
                    </Button>
                )}
            </div>

            <ul className="mt-5 flex flex-col gap-2 border-t border-border-subtle pt-4">
                {!isFree ? (
                    <li className="flex items-start gap-2 text-body-sm font-medium text-fg">
                        <Sparkles aria-hidden size={14} className="mt-0.5 shrink-0 text-fg-muted" />
                        {def.messages} messages that reset every month
                    </li>
                ) : null}
                {INCLUDED_IN_ALL.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-body-sm text-fg-secondary">
                        <Check aria-hidden size={14} className="mt-0.5 shrink-0 text-fg-muted" />
                        {f}
                    </li>
                ))}
            </ul>
        </Card>
    );
}

/* ─── recent activity (Ask conversations kept on the server) ─── */

interface ThreadRow { id: string; title: string; last_message_at: string; site_url?: string }

const threadsFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

function RecentActivity() {
    const { data, isLoading, error } = useSWR<{ threads?: ThreadRow[] }>('/api/chat-store?action=list_threads&limit=10', threadsFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
    const rows = useMemo(() => (Array.isArray(data?.threads) ? data.threads : []), [data]);

    return (
        <section aria-labelledby="activity-title">
            <h2 id="activity-title" className="mb-3 text-title text-fg">Recent questions</h2>
            <Table<ThreadRow>
                density="compact"
                caption="Recent conversations in Ask"
                rows={rows}
                rowKey={(r) => r.id}
                loading={isLoading}
                stickyFirstColumn={false}
                empty={error ? (
                    <EmptyState variant="inline" icon={MessageSquare} title="Could not load your recent questions" description="Try again in a moment." />
                ) : (
                    <EmptyState
                        variant="inline"
                        icon={MessageSquare}
                        title="No questions yet"
                        description="Each question you send in Ask uses one message and shows up here."
                        actions={<Button asChild variant="secondary" size="sm"><Link href="/dashboard/ask">Open Ask</Link></Button>}
                    />
                )}
                columns={[
                    { key: 'date', header: 'Date', width: 110, cell: (r) => (r.last_message_at ? fmtDay(r.last_message_at) : '–') },
                    { key: 'title', header: 'Conversation', cell: (r) => <span className="block max-w-[420px] truncate" title={r.title}>{r.title || 'Untitled'}</span> },
                    { key: 'site', header: 'Site', cell: (r) => <span className="text-fg-muted">{r.site_url ? r.site_url.replace(/^sc-domain:|^https?:\/\//, '').replace(/\/$/, '') : '–'}</span> },
                ]}
            />
        </section>
    );
}

/* ─── FAQ ─── */

function Faq() {
    return (
        <Card as="section" aria-labelledby="faq-title">
            <CardHeader as="h2" title={<span id="faq-title">Questions about plans</span>} />
            <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                {FAQ.map((item) => (
                    <details key={item.q} className="group rounded-control border border-border-subtle open:bg-surface-sunken">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 text-body font-medium text-fg [&::-webkit-details-marker]:hidden">
                            <span>{item.q}</span>
                            <span aria-hidden className="shrink-0 text-title-sm leading-none text-fg-muted transition-transform duration-120 group-open:rotate-45">+</span>
                        </summary>
                        <p className="px-4 pb-3.5 text-body-sm text-fg-muted">{item.a}</p>
                    </details>
                ))}
            </div>
        </Card>
    );
}

function PlanSkeleton() {
    return (
        <div aria-hidden className="max-w-[1040px]">
            <div className="mb-6 flex flex-col gap-2"><Skeleton className="h-7 w-24" /><Skeleton className="h-4 w-80" /></div>
            <Skeleton className="mb-6 h-44 w-full" rounded="card" />
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-80 w-full" rounded="card" />)}
            </div>
        </div>
    );
}
