'use client';

import { History, Loader2, X } from 'lucide-react';

export interface HistoryThread {
    id: string;
    title: string;
    last_message_at: string;
    site_url?: string;
    persona?: string;
    archived?: boolean;
}

interface HistoryPanelProps {
    threads: HistoryThread[];
    loading: boolean;
    onSelect: (id: string) => void;
    onClose: () => void;
}

/**
 * Overlay panel that lists past conversation threads. Renders inside the
 * chat window, not as a separate floating panel — covers the messages
 * area until the user picks a thread or closes.
 *
 * Extracted from AIChatbot.tsx during B5-full split.
 */
export function HistoryPanel({ threads, loading, onSelect, onClose }: HistoryPanelProps) {
    return (
        <div className="absolute inset-x-0 top-[57px] bottom-0 z-40 bg-[var(--sidebar-bg)] border-t border-[var(--card-border)] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[12px] font-semibold text-white">Past conversations</span>
                    <span className="text-[10px] text-zinc-500 tabular-nums">{threads.length}</span>
                </div>
                <button onClick={onClose} className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/[0.04]" aria-label="Close history">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <div className="flex items-center justify-center py-8 text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                )}
                {!loading && threads.length === 0 && (
                    <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
                        No saved conversations yet. Send a message to start one.
                    </div>
                )}
                {!loading && threads.map(t => (
                    <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className="w-full text-left px-4 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] text-zinc-200 truncate font-medium">{t.title || 'Untitled'}</p>
                                <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                    {t.site_url ? t.site_url.replace(/^sc-domain:|^https?:\/\//, '').replace(/\/$/, '') : '—'}
                                    {t.persona ? ` · ${t.persona}` : ''}
                                </p>
                            </div>
                            <span className="text-[9px] text-zinc-600 flex-shrink-0 tabular-nums">
                                {t.last_message_at ? new Date(t.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
