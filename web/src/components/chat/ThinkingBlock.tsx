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
        <div className="my-2 rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.025] transition-colors"
            >
                <Brain className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                <span className="font-medium">{isStreaming ? 'Thinking…' : 'Reasoning'}</span>
                <span className="text-[10px] text-zinc-600 tabular-nums ml-auto">{content.length} chars</span>
                {expanded ? <ChevronDown className="w-3 h-3 text-zinc-600" /> : <ChevronRight className="w-3 h-3 text-zinc-600" />}
            </button>
            {expanded && (
                <div className="px-3 py-2 border-t border-white/[0.04]">
                    <p className="text-[12px] text-zinc-400 leading-relaxed whitespace-pre-wrap font-mono">
                        {content}
                    </p>
                </div>
            )}
        </div>
    );
}
