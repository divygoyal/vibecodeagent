'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
    input: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    isLoading: boolean;
    onStop: () => void;
    isExpanded: boolean;
    credits: number | null;
}

/**
 * Bottom input area — textarea + Send/Stop button + low-credit warning.
 * Stop replaces Send while a response is streaming so the user can abort
 * a runaway tool. Forwards ref to the textarea so parent can focus it.
 *
 * Extracted from AIChatbot.tsx during B5-full split.
 */
export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(function ChatInput(
    { input, onChange, onSubmit, isLoading, onStop, isExpanded, credits },
    textareaRef,
) {
    return (
        <div className="px-3 py-3 border-t border-[var(--card-border)] bg-[var(--sidebar-bg)]">
            <div className="flex items-end gap-2 bg-[var(--input-bg)] rounded-2xl px-4 py-3 border border-transparent focus-within:border-[var(--input-border)] transition-colors">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSubmit();
                        }
                    }}
                    placeholder="Ask anything..."
                    className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none leading-relaxed"
                    disabled={isLoading}
                    rows={1}
                    style={{ minHeight: '24px', maxHeight: isExpanded ? '120px' : '80px' }}
                />
                {isLoading ? (
                    <button
                        onClick={onStop}
                        className="w-10 h-10 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 hover:text-red-200 transition-all flex items-center justify-center flex-shrink-0"
                        aria-label="Stop response"
                        title="Stop"
                    >
                        <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                ) : (
                    <button
                        onClick={onSubmit}
                        disabled={!input.trim()}
                        className="w-10 h-10 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 rounded-full bg-zinc-700 flex items-center justify-center enabled:bg-white enabled:text-black text-zinc-500 transition-all enabled:hover:bg-zinc-200 flex-shrink-0"
                        aria-label="Send message"
                    >
                        <Send className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {credits !== null && credits < 30 && (
                <div className="mt-1.5 px-1">
                    <Link href="/dashboard/plan" className="text-[9px] text-amber-500/70 font-medium hover:text-amber-400 transition-colors">
                        Low messages: {credits} — Upgrade for more
                    </Link>
                </div>
            )}
        </div>
    );
});
