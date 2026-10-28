'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowUp, BarChart3, FileSearch, Search, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';

import ChatMessageRenderer from '@/components/ChatMessageRenderer';
import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, GoogleMark } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { DemoAskSample } from '@/lib/publicDemo/ask';
import { connectGoogleFromDemo } from './useDemoSession';

const ICONS: Record<string, LucideIcon> = { movers: TrendingUp, queries: Search, channels: BarChart3, 'quick-wins': FileSearch };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/**
 * Ask in the public live demo: no model call. Four suggested questions, each with a sample answer
 * written from the demo data (/api/demo/ask), shown the way Ask shows a real answer. The composer
 * is off, with the way to ask your own questions.
 */
export function DemoAsk() {
    const { data, error } = useSWR<{ samples: DemoAskSample[] }>('/api/demo/ask', fetcher, { revalidateOnFocus: false });
    const [asked, setAsked] = useState<string[]>([]);
    const [typing, setTyping] = useState<string | null>(null);
    const lastRef = useRef<HTMLDivElement>(null);
    const samples = data?.samples ?? [];
    const remaining = samples.filter((s) => !asked.includes(s.id));

    // Bring the new question to the top so its answer reads from the start.
    useEffect(() => {
        if (asked.length) lastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [asked.length]);

    const pick = (id: string) => {
        if (typing || asked.includes(id)) return;
        // A short pause reads as "working on it" without pretending to stream.
        setTyping(id);
        setAsked((prev) => [...prev, id]);
        window.setTimeout(() => setTyping(null), 650);
    };

    return (
        <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col md:min-h-[calc(100dvh-10rem)]">
            <PageHeader title="Ask" subtitle="Ask about your traffic in plain English" />

            <div className="mx-auto flex w-full min-w-0 max-w-[760px] flex-1 flex-col">
                {asked.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                        <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-subtle text-fg-muted">
                            <Sparkles aria-hidden size={20} strokeWidth={1.75} />
                        </span>
                        <h2 className="text-title text-balance text-fg md:text-heading">Ask anything about your sites</h2>
                        <p className="mt-2 max-w-[480px] text-body text-fg-muted">
                            In the demo, pick a question to see a sample answer from the demo data. With your own Google data you can ask anything.
                        </p>
                    </div>
                ) : (
                    <div role="log" aria-label="Conversation" aria-live="polite" className="min-w-0 flex-1 pt-2 pb-6">
                        {asked.map((id, i) => {
                            const s = samples.find((x) => x.id === id);
                            if (!s) return null;
                            return (
                                <div key={id} ref={i === asked.length - 1 ? lastRef : undefined} className="scroll-mt-20">
                                    <div className="mb-6 flex justify-end">
                                        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-subtle px-4 py-2.5 text-body-lg text-fg">{s.question}</p>
                                    </div>
                                    {typing === id ? (
                                        <p className="mb-8 flex items-center gap-2 text-body-sm text-fg-muted">
                                            <Sparkles aria-hidden size={14} strokeWidth={1.75} className="animate-pulse" />
                                            Reading the sample data…
                                        </p>
                                    ) : (
                                        <article aria-label="Sample answer" className="mb-8">
                                            <Badge variant="neutral" className="mb-3">Sample answer · demo data</Badge>
                                            <ChatMessageRenderer content={s.answer} />
                                        </article>
                                    )}
                                </div>
                            );
                        })}
                     </div>
                )}

                {error ? <p className="py-4 text-center text-body-sm text-fg-muted">The sample questions could not be loaded. Reload the page to try again.</p> : null}
                {remaining.length > 0 ? (
                    <div className={cn(asked.length > 0 && 'mb-4')}>
                        {asked.length > 0 ? <p className="mb-2 text-meta font-medium text-fg-muted">More sample questions</p> : null}
                        <ul className="grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
                            {remaining.map((s) => {
                                const Icon = ICONS[s.id] ?? Sparkles;
                                return (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            disabled={Boolean(typing)}
                                            onClick={() => pick(s.id)}
                                            className="tc-card group flex h-full w-full items-start gap-3 rounded-card border border-border-subtle bg-surface p-3.5 text-left shadow-card transition-[border-color,box-shadow] duration-120 ease-standard enabled:hover:border-border enabled:hover:shadow-card-hover disabled:cursor-wait"
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                                                <Icon aria-hidden size={16} strokeWidth={1.75} />
                                            </span>
                                            <span className="min-w-0 self-center text-body font-medium text-fg">{s.question}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}
            </div>

            {/* Composer, off in the demo (not sticky: nothing to type, and it would cover the questions) */}
            <div className="mt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <div className="mx-auto w-full max-w-[760px]">
                    <div className="tc-card rounded-card border border-border bg-surface-sunken p-3">
                        <label htmlFor="ask-composer" className="sr-only">Ask about your traffic</label>
                        <textarea
                            id="ask-composer"
                            disabled
                            rows={1}
                            placeholder="Your own questions work once you connect Google"
                            className="block w-full resize-none bg-transparent px-1 py-1 text-body-lg text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <Button variant="google" size="sm" onClick={connectGoogleFromDemo}><GoogleMark size={16} />Connect Google to ask your own</Button>
                            <Button variant="primary" iconOnly icon={ArrowUp} aria-label="Send question" disabled className="size-9 rounded-full" />
                        </div>
                    </div>
                    <p className="mt-2 px-1 text-meta text-fg-muted">Demo: answers are samples written from the demo data. No AI runs here.</p>
                </div>
            </div>
        </div>
    );
}
