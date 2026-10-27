'use client';

import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { ASK_PROMPTS } from './prompts';

export interface AskEmptyProps {
    siteLabel: string | null;
    disabled: boolean;
    onPick: (question: string) => void;
}

/** First screen of Ask: what it can do and a few questions to start with (DESIGN 5.11). */
export function AskEmpty({ siteLabel, disabled, onPick }: AskEmptyProps) {
    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center py-8 text-center">
            <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-subtle text-fg-muted">
                <Sparkles aria-hidden size={20} strokeWidth={1.75} />
            </span>
            <h2 className="text-title text-fg md:text-heading">
                {siteLabel ? <>Ask anything about <span className="break-all">{siteLabel}</span></> : 'Ask anything about your sites'}
            </h2>
            <p className="mt-2 max-w-[460px] text-body text-fg-muted">
                Answers come from your own Search Console and Analytics data, with charts and numbers you can check.
            </p>
            <ul className="mt-8 grid w-full grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
                {ASK_PROMPTS.map((p, i) => {
                    const Icon = p.icon;
                    return (
                        <li key={p.title} className={cn(i >= 4 && 'max-sm:hidden')}>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => onPick(p.question)}
                                className={cn(
                                    'tc-card group flex w-full items-start gap-3 rounded-card border border-border-subtle bg-surface p-3.5 text-left shadow-card',
                                    'transition-[border-color,box-shadow] duration-120 ease-standard',
                                    'enabled:hover:border-border enabled:hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-60',
                                )}
                            >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-muted">
                                    <Icon aria-hidden size={16} strokeWidth={1.75} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-body font-medium text-fg">{p.title}</span>
                                    <span className="mt-0.5 line-clamp-2 block text-body-sm text-fg-muted">{p.question}</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
