'use client';

import Link from 'next/link';
import { useEffect, type KeyboardEvent, type RefObject } from 'react';
import { ArrowUp, Plug } from 'lucide-react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SiteChip } from '@/components/app/SiteChip';
import { fmtFull } from '@/lib/format';

export interface ComposerProps {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    /** The question cannot be sent right now (busy, AI off, no data, no messages). */
    sendDisabled: boolean;
    /** Typing is blocked as well (busy or waiting for data). */
    inputDisabled: boolean;
    placeholder: string;
    isLoading: boolean;
    unavailable: boolean;
    /** Messages left (null while unknown). */
    credits: number | null;
}

/**
 * Composer, credits line and the states that replace it (DESIGN 5.11):
 * at 0 messages a warning banner takes its place, with a path to Plan and
 * to the free ChatGPT / Claude connection.
 */
export function Composer({ value, onChange, onSend, textareaRef, sendDisabled, inputDisabled, placeholder, isLoading, unavailable, credits }: ComposerProps) {
    // Autosize 1 to 8 lines.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }, [value, textareaRef]);

    const outOfMessages = credits !== null && credits < 1;

    if (outOfMessages && !unavailable) {
        return (
            <Banner
                variant="warn"
                title="You have used all your Ask messages"
                actions={(
                    <>
                        <Button asChild variant="primary" size="sm"><Link href="/dashboard/plan">Get more messages</Link></Button>
                        <Button asChild variant="secondary" size="sm" icon={Plug}><Link href="/dashboard/connect-ai">Use ChatGPT or Claude, free</Link></Button>
                    </>
                )}
            >
                Questions to ChatGPT or Claude through Connect AI do not use these messages.
            </Banner>
        );
    }

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!sendDisabled) onSend();
        }
    };

    return (
        <div>
            <div className="tc-card rounded-card border border-border bg-surface p-3 shadow-card transition-colors duration-120 focus-within:border-border-strong">
                <label htmlFor="ask-composer" className="sr-only">Ask about your traffic</label>
                <textarea
                    id="ask-composer"
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    disabled={inputDisabled}
                    rows={1}
                    className="block max-h-[200px] w-full resize-none bg-transparent px-1 py-1 text-body-lg text-fg outline-none placeholder:text-fg-faint disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <SiteChip disabled={isLoading} />
                    <Button
                        variant="primary"
                        iconOnly
                        icon={ArrowUp}
                        aria-label="Send question"
                        onClick={onSend}
                        disabled={sendDisabled}
                        loading={isLoading}
                        className="size-9 rounded-full"
                    />
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-meta text-fg-muted">
                <p className="tabular-nums" aria-live="polite">
                    {credits === null ? (
                        <span className="inline-block h-3.5 w-28 align-middle" aria-hidden />
                    ) : (
                        <>
                            <span className="font-medium text-fg-secondary">{fmtFull(credits)}</span> {credits === 1 ? 'message' : 'messages'} left
                            {' · '}
                            <Link href="/dashboard/plan" className="text-fg-secondary underline decoration-border-strong underline-offset-2 hover:text-fg">Get more</Link>
                        </>
                    )}
                </p>
                <Link href="/dashboard/connect-ai" className="tap-area inline-flex items-center gap-1 hover:text-fg">
                    Unlimited with ChatGPT or Claude <span aria-hidden>→</span>
                </Link>
            </div>
        </div>
    );
}
