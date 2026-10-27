'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { ArrowRight, Check } from 'lucide-react';

import { Button, buttonClasses, Pill } from '@/components/ui';
import { cn } from '@/lib/cn';
import { dodoCheckoutUrl, FREE_START_CREDITS, PAID_PLANS, pricePerMessage, type PaidPlan } from '@/lib/plans';
import { ConnectGoogleButton } from '../site/ConnectGoogleButton';

const FREE_FEATURES = [
    'Portfolio of every site, no site limit',
    'Traffic, Search, What to fix next and Audit for each site',
    'Unlimited dashboards, public links and embeds',
    'Public leaderboard profile',
    'ChatGPT & Claude connector (MCP)',
    `${FREE_START_CREDITS} Ask messages to start`,
];

/**
 * Paid plan button. Same checkout as /dashboard/plan: signed in with an email,
 * it opens Dodo's hosted checkout for the plan's product id in a new tab;
 * signed out, it signs in with Google and lands on /dashboard/plan (as before).
 */
function CheckoutButton({ plan }: { plan: PaidPlan }) {
    const { data: session, status } = useSession();
    const [loading, setLoading] = useState(false);
    const variant = plan.recommended ? 'primary' : 'secondary';
    const label = `Get ${plan.name}`;
    const className = 'w-full';

    if (status === 'authenticated') {
        const email = session?.user?.email;
        if (!email) {
            return (
                <Button asChild variant={variant} size="lg" className={className} trailingIcon={ArrowRight}>
                    <Link href="/dashboard/plan">{label}</Link>
                </Button>
            );
        }
        return (
            <a
                href={dodoCheckoutUrl(plan.productId, email)}
                target="_blank"
                rel="noopener noreferrer"
                data-plan={plan.key}
                className={buttonClasses({ variant, size: 'lg', className: cn(className, 'gap-2') })}
            >
                {label}
                <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
            </a>
        );
    }

    return (
        <Button
            variant={variant}
            size="lg"
            className={className}
            loading={loading}
            data-plan={plan.key}
            onClick={() => {
                setLoading(true);
                void signIn('google', { callbackUrl: '/dashboard/plan' }, { prompt: 'select_account consent' }).catch(() => setLoading(false));
            }}
        >
            {label}
        </Button>
    );
}

function PlanCard({ children, recommended, className }: { children: React.ReactNode; recommended?: boolean; className?: string }) {
    return (
        <div
            className={cn(
                'tc-card relative flex flex-col rounded-card bg-surface p-6 shadow-card',
                recommended ? 'border-[1.5px] border-brand' : 'border border-border-subtle',
                className,
            )}
        >
            {children}
        </div>
    );
}

/** Free / Growth / Pro (DESIGN 5.17). Paid plans only add Ask messages. */
export function PricingPlans() {
    return (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <PlanCard>
                <h2 className="text-title text-fg">Free</h2>
                <p className="mt-1 text-body text-fg-secondary">Everything, for every site you own.</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-stat-xl text-fg">$0</span>
                    <span className="text-body text-fg-muted">forever</span>
                </p>
                <p className="mt-1 text-body-sm text-fg-muted">{FREE_START_CREDITS} Ask messages to start · no card</p>
                <div className="mt-6">
                    <ConnectGoogleButton size="lg" variant="secondary" label="Start free" mark className="w-full" />
                </div>
                <ul className="mt-6 space-y-3 border-t border-border-subtle pt-6">
                    {FREE_FEATURES.map((f) => (
                        <li key={f} className="flex gap-2.5 text-body text-fg-secondary">
                            <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-up" />
                            {f}
                        </li>
                    ))}
                </ul>
            </PlanCard>

            {PAID_PLANS.map((plan) => (
                <PlanCard key={plan.key} recommended={plan.recommended}>
                    <div className="flex items-center gap-2">
                        <h2 className="text-title text-fg">{plan.name}</h2>
                        {plan.recommended ? <Pill tone="brand">Recommended</Pill> : null}
                    </div>
                    <p className="mt-1 text-body text-fg-secondary">Everything in Free, plus more Ask messages.</p>
                    <p className="mt-6 flex items-baseline gap-1.5">
                        <span className="text-stat-xl text-fg">${plan.priceUsd}</span>
                        <span className="text-body text-fg-muted">/ month</span>
                    </p>
                    <p className="mt-1 text-body-sm text-fg-muted">
                        {plan.credits} Ask messages a month · {pricePerMessage(plan)} per message
                    </p>
                    <div className="mt-6">
                        <CheckoutButton plan={plan} />
                    </div>
                    <ul className="mt-6 space-y-3 border-t border-border-subtle pt-6">
                        <li className="flex gap-2.5 text-body text-fg-secondary">
                            <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-up" />
                            Everything in Free
                        </li>
                        <li className="flex gap-2.5 text-body font-medium text-fg">
                            <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-up" />
                            {plan.credits} Ask messages every month
                        </li>
                        <li className="flex gap-2.5 text-body text-fg-secondary">
                            <Check aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-up" />
                            Resets each billing cycle, cancel any time
                        </li>
                    </ul>
                </PlanCard>
            ))}
        </div>
    );
}
