'use client';

import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

interface ThinkingBlockProps {
    /** Reasoning text (model's pre-tool "thinking" emitted in the SSE stream). */
    content: string;
    /** When true the chunk is still streaming — auto-show the latest line. */
    isStreaming?: boolean;
}

/**
 * Collapsible "Thinking…" block. Renders model reasoning that arrives
 * before/between tool calls in a non-distracting expandable section.
 *
 * Default state: collapsed once the answer is done streaming. Auto-open
 * while still streaming so the user can watch the model think.
 *
 * Phase B5-full polish — pairs with the chat route's "always forward
 * chunk.text even when function_calls are present" behavior added in
 * Phase A. Until tools land we render the streamed reasoning right below
 * the tool icons so the user has something to read instead of dead air.
 */
export function ThinkingBlock({ content, isStreaming }: ThinkingBlockProps) {
    const [open, setOpen] = useState(false);
    if (!content || !content.trim()) return null;

    const expanded = open || isStreaming;

    return (
        <div className="my-2 overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
            <button
                onClick={() => setOpen(!open)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-meta text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
            >
                <Brain aria-hidden className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
                <span className="font-medium">{isStreaming ? 'Thinking…' : 'Reasoning'}</span>
                <span className="ml-auto text-caption text-fg-faint tabular-nums">{content.length} chars</span>
                {expanded ? <ChevronDown aria-hidden className="size-3.5 text-fg-faint" /> : <ChevronRight aria-hidden className="size-3.5 text-fg-faint" />}
            </button>
            {expanded && (
                <div className="border-t border-border-subtle px-3 py-2">
                    <p className="whitespace-pre-wrap font-mono text-meta leading-relaxed text-fg-muted">
                        {content}
                    </p>
                </div>
            )}
        </div>
    );
}
