'use client';

import { memo } from 'react';
import ChatMessageRenderer from '../ChatMessageRenderer';
import ChatErrorBoundary from './ChatErrorBoundary';
import type { ChatMessage } from '@/stores/chatStore';
import type { DashboardSnapshot } from './SnapshotChartRenderer';

interface MessageBubbleProps {
    msg: ChatMessage;
    isExpanded: boolean;
    isStreaming?: boolean;
    snapshot?: DashboardSnapshot;
    onSuggestionClick?: (s: string) => void;
}

/**
 * One chat row — renders user message inline or assistant message via the
 * full markdown + tool + chart renderer. Memoized so the entire history
 * doesn't re-render when a new chunk lands on the in-flight message.
 *
 * Extracted from AIChatbot.tsx during B5-full split. Only this component
 * cares about the bubble shape; the parent only tracks whether a row is
 * the streaming row and which suggestion handler to use.
 */
export const MessageBubble = memo(function MessageBubble({
    msg, isExpanded, isStreaming, snapshot, onSuggestionClick,
}: MessageBubbleProps) {
    const isUser = msg.role === 'user';
    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`${isExpanded ? 'max-w-[90%] sm:max-w-[75%]' : 'max-w-[88%]'} text-sm leading-relaxed ${isUser
                ? 'bg-white/[0.07] text-zinc-100 rounded-[20px] rounded-br-md px-3 py-2.5 sm:px-4 sm:py-3'
                : 'text-zinc-300 px-1 py-1'
            }`}>
                {msg.role === 'assistant' ? (
                    <ChatErrorBoundary label="message">
                        {msg.repetition && (
                            <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border border-amber-500/[0.20] bg-amber-500/[0.05] text-amber-300">
                                <span className="text-amber-400">↻</span>
                                You asked this ~{msg.repetition.priorAgeMin}m ago — picking a different angle below.
                            </div>
                        )}
                        <ChatMessageRenderer
                            content={msg.content}
                            tools={msg.tools}
                            thinking={msg.thinking}
                            plan={msg.plan}
                            critic={msg.critic}
                            isStreaming={isStreaming}
                            snapshot={snapshot}
                            onSuggestionClick={onSuggestionClick}
                        />
                    </ChatErrorBoundary>
                ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
                <div className={`text-[10px] text-zinc-600 mt-1.5 select-none ${isUser ? '' : 'px-0'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        </div>
    );
});
