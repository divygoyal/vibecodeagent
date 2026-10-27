'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, ListChecks, RotateCcw } from 'lucide-react';

import { Favicon, GoogleMark, MetricDelta } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtCompact } from '@/lib/format';

export interface StorySite {
    key: string;
    label: string;
    host: string;
    clicks: number;
    prevClicks: number | null;
}

export interface StoryProps {
    totalSites: number;
    sites: StorySite[];
    drop: { label: string; host: string; changePct: number; period: string } | null;
    fix: { title: string; gain: number; page: string } | null;
    fixHref: string;
}

const STEP_MS = 1400;

/**
 * "Show the job": three beats that play once when the section scrolls into view (Connect Google, every site
 * appears, a drop is flagged with its fix). Numbers come from the demo generator. With reduced motion, or
 * before the script runs, all three beats are shown at once.
 */
export function JobStory({ totalSites, sites, drop, fix, fixHref }: StoryProps) {
    const ref = useRef<HTMLOListElement>(null);
    // 3 = everything visible (server render, no JS, reduced motion); the effect rewinds to 0 and plays.
    const [step, setStep] = useState(3);
    const [run, setRun] = useState(0);

    useEffect(() => {
        const el = ref.current;
        if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return;
        const timers: number[] = [];
        let played = false;
        const play = () => {
            setStep(0);
            [1, 2, 3].forEach((s) => timers.push(window.setTimeout(() => setStep(s), 250 + (s - 1) * STEP_MS)));
        };
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting) && !played) {
                played = true;
                play();
                io.disconnect();
            }
        }, { threshold: 0.45 });
        // Above the fold already (short screens): play right away; otherwise wait until it is seen.
        io.observe(el);
        return () => {
            io.disconnect();
            timers.forEach((t) => window.clearTimeout(t));
        };
    }, [run]);

    const beat = (n: number) => cn(
        'relative flex flex-col rounded-card border bg-surface p-5 shadow-card transition-[opacity,transform,border-color] duration-500 ease-standard motion-reduce:transition-none md:p-6',
        step >= n ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-40',
        step === n ? 'border-brand/50' : 'border-border-subtle',
    );

    return (
        <div>
            <ol ref={ref} className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                <li className={beat(1)}>
                    <BeatHead n={1} done={step > 1} title="Sign in with Google" />
                    <div className="mt-4 flex-1 rounded-control border border-border-subtle bg-canvas p-3">
                        <p className="flex items-center gap-2 text-meta text-fg-muted">
                            <GoogleMark size={14} /> TrafficClaw wants to
                        </p>
                        <ul className="mt-2 space-y-1.5">
                            {[
                                { text: 'See your Analytics data', scope: 'analytics.readonly' },
                                { text: 'See your Search Console data', scope: 'webmasters.readonly' },
                            ].map((s, i) => (
                                <li key={s.scope} className="flex items-start gap-2">
                                    <Check aria-hidden size={14} strokeWidth={2.5} className={cn('mt-0.5 shrink-0 text-brand-text transition-opacity duration-300', step >= 1 ? 'opacity-100' : 'opacity-0')} style={{ transitionDelay: `${300 + i * 250}ms` }} />
                                    <span className="min-w-0">
                                        <span className="block text-body-sm text-fg">{s.text}</span>
                                        <code className="font-mono text-caption text-fg-muted">{s.scope}</code>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="mt-3 text-meta text-fg-muted">Read-only. No script on your site.</p>
                </li>

                <li className={beat(2)}>
                    <BeatHead n={2} done={step > 2} title="Every site shows up" />
                    <ul className="mt-4 flex-1 divide-y divide-border-subtle rounded-control border border-border-subtle bg-canvas">
                        {sites.map((s, i) => (
                            <li
                                key={s.key}
                                className={cn('flex items-center gap-2.5 px-3 py-2 transition-[opacity,transform] duration-300 motion-reduce:transition-none', step >= 2 ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0')}
                                style={{ transitionDelay: step >= 2 ? `${i * 160}ms` : '0ms' }}
                            >
                                <Favicon host={s.host} size={16} />
                                <span className="min-w-0 flex-1 truncate text-body-sm text-fg">{s.label}</span>
                                <span className="text-body-sm tabular-nums text-fg">{fmtCompact(s.clicks)}</span>
                                <MetricDelta metric="clicks" current={s.clicks} previous={s.prevClicks} className="w-14 justify-end" />
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-meta text-fg-muted">{totalSites} sites · clicks, last 28 days · sample data</p>
                </li>

                <li className={beat(3)}>
                    <BeatHead n={3} done={false} title="A drop gets flagged, with the fix" />
                    <div className="mt-4 flex flex-1 flex-col gap-2">
                        {drop ? (
                            <div className={cn('flex items-center gap-2.5 rounded-control border border-down/30 bg-down-soft px-3 py-2 ring-down/25 transition-shadow duration-500', step >= 3 ? 'ring-4' : 'ring-0')}>
                                <AlertTriangle aria-hidden size={16} strokeWidth={2} className="shrink-0 text-down" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-body-sm font-medium text-fg">{drop.label}</span>
                                    <span className="block text-meta text-fg-secondary">Clicks down {Math.abs(Math.round(drop.changePct))}% · {drop.period}</span>
                                </span>
                            </div>
                        ) : null}
                        {fix ? (
                            <div
                                className={cn('rounded-control border border-border-subtle bg-canvas px-3 py-2.5 transition-[opacity,transform] duration-500 motion-reduce:transition-none', step >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0')}
                                style={{ transitionDelay: step >= 3 ? '450ms' : '0ms' }}
                            >
                                <p className="flex items-center gap-1.5 text-meta font-medium text-brand-text">
                                    <ListChecks aria-hidden size={14} strokeWidth={1.75} /> Fix next
                                </p>
                                <p className="mt-1 text-body-sm font-medium text-fg">{fix.title}</p>
                                <p className="mt-0.5 text-meta text-fg-muted">
                                    <span className="font-medium text-up">+{fmtCompact(fix.gain)} clicks a month</span> if it reaches position 5
                                </p>
                            </div>
                        ) : null}
                    </div>
                    <Link href={fixHref} className="tap-area mt-3 inline-flex items-center gap-1 self-start text-body-sm font-medium text-brand-text hover:text-fg">
                        See the full fix list <ArrowRight aria-hidden size={14} strokeWidth={1.75} />
                    </Link>
                </li>
            </ol>
            <div className="mt-4 flex justify-center lg:justify-end">
                <button
                    type="button"
                    onClick={() => setRun((r) => r + 1)}
                    className="tap-area inline-flex items-center gap-1.5 text-meta text-fg-muted hover:text-fg motion-reduce:hidden"
                >
                    <RotateCcw aria-hidden size={12} strokeWidth={2} /> Replay
                </button>
            </div>
        </div>
    );
}

function BeatHead({ n, title, done }: { n: number; title: string; done: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <span className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-body-sm font-semibold tabular-nums transition-colors duration-300',
                done ? 'bg-brand text-brand-fg' : 'bg-brand-soft text-brand-soft-fg',
            )}>
                {done ? <Check aria-hidden size={14} strokeWidth={2.5} /> : n}
            </span>
            <h3 className="text-title text-fg">{title}</h3>
        </div>
    );
}
