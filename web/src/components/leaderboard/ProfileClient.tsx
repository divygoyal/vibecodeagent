'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Copy, ExternalLink, Linkedin, Send, Share2, Download, Link2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/components/ui/Toaster';
import { ChartCard } from '@/components/charts/ChartCard';
import { Sparkline } from '@/components/charts/Sparkline';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { billingPeriodSuffix, formatCents } from '@/lib/adSlots';
import { fmtDay, fmtFull } from '@/lib/format';
import { OPEN_TO_OPTIONS, RANGES, RANGE_NAMES } from '@/lib/leaderboard/constants';
import type { OpenTo, ProfilePayload, PublicSeries, RangeKey } from '@/lib/leaderboard/types';

// ─── range switch (navigates; the server renders each range) ─────────────────

export function RangeSwitch({ range }: { range: RangeKey }) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    return (
        <SegmentedControl
            ariaLabel="Date range"
            variant="neutral"
            size="sm"
            value={range}
            onChange={(v) => {
                const next = new URLSearchParams(params.toString());
                if (v === '28d') next.delete('range'); else next.set('range', v);
                const qs = next.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
            }}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
    );
}

// ─── live now ────────────────────────────────────────────────────────────────

/** `entryId` is the entry's stable numeric id (slugs change; cached pages must not depend on them). */
export function LiveNow({ entryId, className }: { entryId: number; className?: string }) {
    const [users, setUsers] = useState<number | null>(null);
    useEffect(() => {
        let stopped = false;
        const load = async () => {
            if (document.visibilityState === 'hidden') return;
            try {
                const res = await fetch(`/api/leaderboard/${encodeURIComponent(String(entryId))}/live`, { cache: 'no-store' });
                const data = (await res.json()) as { enabled: boolean; active_users: number | null };
                if (!stopped && data.enabled) setUsers(data.active_users);
            } catch {
                /* keep the last value */
            }
        };
        void load();
        const t = window.setInterval(load, 60_000);
        return () => { stopped = true; window.clearInterval(t); };
    }, [entryId]);
    if (users === null) return null;
    return (
        <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full bg-up-soft px-2.5 text-meta font-semibold text-up', className)} aria-live="polite">
            <span aria-hidden className="size-1.5 animate-live-dot rounded-full bg-current" />
            {fmtFull(users)} online now
        </span>
    );
}

// ─── share ───────────────────────────────────────────────────────────────────

export function ShareButton({ url, title, ogPath }: { url: string; title: string; ogPath: string }) {
    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied');
        } catch {
            toast.error('Could not copy. Select the address bar instead.');
        }
    }, [url]);
    const native = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const text = encodeURIComponent(title);
    const link = encodeURIComponent(url);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md" icon={Share2}>Share</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem icon={Link2} onSelect={copy}>Copy link</DropdownMenuItem>
                {native ? <DropdownMenuItem icon={Share2} onSelect={() => { void navigator.share({ title, url }).catch(() => undefined); }}>Share via…</DropdownMenuItem> : null}
                <DropdownMenuItem icon={ExternalLink} onSelect={() => window.open(`https://twitter.com/intent/tweet?text=${text}&url=${link}`, '_blank', 'noopener,noreferrer')}>Share on X</DropdownMenuItem>
                <DropdownMenuItem icon={Linkedin} onSelect={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${link}`, '_blank', 'noopener,noreferrer')}>Share on LinkedIn</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={Download} onSelect={() => window.open(ogPath, '_blank', 'noopener,noreferrer')}>Open share card image</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ─── charts ──────────────────────────────────────────────────────────────────

function seriesRows(series: PublicSeries, key: string) {
    return series.points.map((p) => ({ date: p.d, [key]: p.v }));
}

function ShapeChart({ series, metric, height }: { series: PublicSeries; metric: 'users' | 'clicks'; height: number }) {
    return (
        <div>
            <Sparkline series={[{ metric, values: series.points.map((p) => p.v) }]} dates={series.points.map((p) => p.d)} height={height} interactive={false} />
            <p className="mt-2 text-meta text-fg-muted">Shape only. The owner shares a range, not exact numbers.</p>
        </div>
    );
}

export function ProfileCharts({ series, range, name }: { series: NonNullable<ProfilePayload['series']>; range: RangeKey; name: string }) {
    const visitors = series.visitors;
    const clicks = series.clicks;
    if (!visitors && !clicks) return null;
    const label = RANGE_NAMES[range];
    const block = (s: PublicSeries, metric: 'users' | 'clicks', title: string, key: string, partial: boolean) => (
        <ChartCard
            key={key}
            title={title}
            subtitle={`${name}, ${label}`}
            height="compact"
            footer={metric === 'clicks' ? 'Search Console data is delayed about 2 days' : undefined}
        >
            {s.mode === 'range' ? (
                <ShapeChart series={s} metric={metric} height={180} />
            ) : (
                <TimeSeriesChart
                    data={seriesRows(s, key)}
                    series={[{ metric, key, label: title }]}
                    height={220}
                    partialFrom={partial && s.points.length > 3 ? s.points.length - 1 : undefined}
                    ariaLabel={`${title} per day, ${fmtDay(s.points[0]?.d)} to ${fmtDay(s.points[s.points.length - 1]?.d)}`}
                />
            )}
        </ChartCard>
    );
    return (
        <div className={cn('grid grid-cols-1 gap-4', visitors && clicks ? 'lg:grid-cols-2' : '')}>
            {visitors ? block(visitors, 'users', 'Visitors', 'users', true) : null}
            {clicks ? block(clicks, 'clicks', 'Search clicks', 'clicks', false) : null}
        </div>
    );
}

// ─── offers (contact form into the ad-slot request pipeline / inquiries) ──────

const KIND_OF: Record<OpenTo, 'sponsorship' | 'acquisition' | 'partnership'> = { sponsorships: 'sponsorship', acquisition: 'acquisition', partnerships: 'partnership' };

export function OfferSection({ idOrSlug, siteName, openTo, slots, initialSlotId }: {
    idOrSlug: string;
    siteName: string;
    openTo: OpenTo[];
    slots: ProfilePayload['ad_slots'];
    initialSlotId?: number | null;
}) {
    const kinds = useMemo(() => OPEN_TO_OPTIONS.filter((o) => openTo.includes(o.value)), [openTo]);
    const [kind, setKind] = useState<OpenTo>(initialSlotId ? 'sponsorships' : kinds[0]?.value ?? 'partnerships');
    const [slotId, setSlotId] = useState<number | ''>(initialSlotId ?? '');
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        const open = (e: Event) => {
            const id = (e as CustomEvent<number>).detail;
            setKind('sponsorships');
            setSlotId(id);
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            window.setTimeout(() => formRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus(), 350);
        };
        window.addEventListener('lb-request-slot', open);
        return () => window.removeEventListener('lb-request-slot', open);
    }, []);

    if (kinds.length === 0) return null;
    const sponsorSlots = slots.filter((s) => s.quantity_open > 0);

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setState('sending');
        setError(null);
        try {
            const res = await fetch(`/api/leaderboard/${encodeURIComponent(idOrSlug)}/inquiry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind: KIND_OF[kind],
                    slot_id: kind === 'sponsorships' && slotId ? slotId : undefined,
                    name: f.get('name'), email: f.get('email'), company: f.get('company'), budget: f.get('budget'),
                    message: f.get('message'),
                    website: f.get('website'), // honeypot
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(data.error || 'Could not send your offer.');
            setState('sent');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send your offer.');
            setState('idle');
        }
    }

    const input = 'tc-control w-full rounded-control border border-border bg-surface px-3 text-fg placeholder:text-fg-faint transition-[border-color,box-shadow] duration-120 hover:border-border-strong focus:border-focus focus:ring-2 focus:ring-focus/25 focus:outline-none';
    return (
        <Card id="offers" className="scroll-mt-24">
            <CardHeader
                title={`Send ${siteName} an offer`}
                description="Goes straight to the owner. Their email address stays private; they reply to you."
            />
            {state === 'sent' ? (
                <Banner variant="success" title="Offer sent">The owner will reply to the email you gave. Check your spam folder if you do not hear back.</Banner>
            ) : (
                <form ref={formRef} onSubmit={submit} className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">What kind of offer?</span>
                        <SegmentedControl
                            ariaLabel="Kind of offer"
                            variant="neutral"
                            value={kind}
                            onChange={(v) => setKind(v)}
                            options={kinds.map((o) => ({ value: o.value, label: o.label }))}
                        />
                    </div>
                    {kind === 'sponsorships' && sponsorSlots.length > 0 ? (
                        <label className="sm:col-span-2">
                            <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Ad slot</span>
                            <select value={slotId} onChange={(e) => setSlotId(e.target.value ? Number(e.target.value) : '')} className={cn(input, 'h-9 text-body')}>
                                <option value="">No specific slot</option>
                                {sponsorSlots.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} · {formatCents(s.price_cents)} {billingPeriodSuffix(s.billing_period)}</option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    <label>
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Your name</span>
                        <input name="name" required maxLength={120} autoComplete="name" className={cn(input, 'h-9 text-body')} />
                    </label>
                    <label>
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Email</span>
                        <input name="email" type="email" required maxLength={255} autoComplete="email" className={cn(input, 'h-9 text-body')} />
                    </label>
                    <label>
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Company <span className="text-fg-muted">(optional)</span></span>
                        <input name="company" maxLength={160} autoComplete="organization" className={cn(input, 'h-9 text-body')} />
                    </label>
                    <label>
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Budget or terms <span className="text-fg-muted">(optional)</span></span>
                        <input name="budget" maxLength={80} placeholder="e.g. $200 per month" className={cn(input, 'h-9 text-body')} />
                    </label>
                    <label className="sm:col-span-2">
                        <span className="mb-1.5 block text-body-sm font-medium text-fg-secondary">Message</span>
                        <textarea name="message" required minLength={10} maxLength={2000} rows={4} className={cn(input, 'py-2 text-body')} placeholder="Tell them who you are and what you have in mind." />
                    </label>
                    {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
                    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
                    </div>
                    {error ? <div className="sm:col-span-2"><Banner variant="danger">{error}</Banner></div> : null}
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                        <Button type="submit" variant="primary" icon={Send} loading={state === 'sending'}>Send offer</Button>
                        <span className="text-meta text-fg-muted">By sending you agree to be contacted by the owner at this address.</span>
                    </div>
                </form>
            )}
        </Card>
    );
}

export function RequestSlotButton({ slotId }: { slotId: number }) {
    return (
        <Button
            variant="secondary"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent('lb-request-slot', { detail: slotId }))}
        >
            Request
        </Button>
    );
}

// ─── embed card ──────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
    const [done, setDone] = useState(false);
    return (
        <div>
            <div className="mb-1 flex items-center justify-between">
                <span className="text-body-sm font-medium text-fg-secondary">{label}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    icon={done ? Check : Copy}
                    onClick={async () => {
                        try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1800); } catch { toast.error('Could not copy'); }
                    }}
                >
                    {done ? 'Copied' : 'Copy'}
                </Button>
            </div>
            <textarea readOnly value={value} rows={3} onFocus={(e) => e.currentTarget.select()} className="w-full resize-none rounded-control border border-border bg-surface-sunken p-2.5 font-mono text-meta text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/30" />
        </div>
    );
}

export function EmbedCard({ origin, slug, id, name, liveEnabled }: { origin: string; slug: string; id: number; name: string; liveEnabled: boolean }) {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [variant, setVariant] = useState<'minimal' | 'stats' | 'live'>(liveEnabled ? 'live' : 'stats');
    const profile = `${origin}/leaderboard/${slug}`;
    // Snippets use the absolute public origin (they are pasted on other sites); the preview
    // loads the same image from this page's own origin so it renders wherever the page is served.
    const imgPath = `/api/badges/${id}?variant=${variant}&theme=${theme}`;
    const img = `${origin}${imgPath}`;
    const alt = `${name} on TrafficClaw`;
    const html = `<a href="${profile}" target="_blank" rel="noopener"><img src="${img}" alt="${alt}" height="${variant === 'minimal' ? 48 : 76}" /></a>`;
    const md = `[![${alt}](${img})](${profile})`;
    const iframe = `<iframe src="${origin}/embed/leaderboard/${slug}?theme=${theme}" width="340" height="168" style="border:0;border-radius:12px" loading="lazy" title="${alt}"></iframe>`;
    return (
        <Card>
            <CardHeader
                title="Embed this profile"
                description="A live verified badge or a small widget for your own site."
                actions={<SegmentedControl ariaLabel="Badge theme" size="sm" variant="neutral" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />}
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <SegmentedControl
                    ariaLabel="Badge style"
                    size="sm"
                    variant="neutral"
                    value={variant}
                    onChange={setVariant}
                    options={[{ value: 'minimal', label: 'Minimal' }, { value: 'stats', label: 'Stats' }, ...(liveEnabled ? [{ value: 'live' as const, label: 'Live' }] : [])]}
                />
            </div>
            <div className={cn('mb-4 flex min-h-24 items-center justify-center rounded-control border border-border-subtle p-4', theme === 'dark' ? 'bg-[#0e1014]' : 'bg-surface-sunken')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img key={imgPath} src={imgPath} alt={alt} height={variant === 'minimal' ? 48 : 76} className="max-w-full" />
            </div>
            <div className="grid gap-3">
                <CopyField label="Badge (HTML)" value={html} />
                <CopyField label="Badge (Markdown)" value={md} />
                <CopyField label="Widget (iframe)" value={iframe} />
            </div>
        </Card>
    );
}

export function PendingBanner({ children }: { children: React.ReactNode }) {
    return <Banner variant="warn" title="Pending verification">{children}</Banner>;
}

export function BackLink() {
    return <Link href="/leaderboard" className="text-body-sm text-fg-muted hover:text-fg hover:underline">Leaderboard</Link>;
}
