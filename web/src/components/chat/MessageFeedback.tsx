'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Check } from 'lucide-react';

interface MessageFeedbackProps {
    /** chat_messages.id — required to submit. The parent only renders us once
     *  the assistant turn has been persisted and the id has been written back
     *  into ChatMessage state. */
    messageId: number;
    /** Thread id — useful for admin grouping. May be empty if not yet known. */
    threadId?: string;
}

type FeedbackState =
    | { kind: 'idle' }
    | { kind: 'submitted'; rating: 'up' | 'down' }
    | { kind: 'down_pending'; submittedId: number | null }
    | { kind: 'error'; message: string };

/**
 * 👍 / 👎 row mounted under each assistant message body. Behavior:
 *   - Click 👍 → instant submit, both buttons become "submitted" state.
 *   - Click 👎 → submit immediately, then expand a one-line "what was wrong?"
 *     optional text input. On Enter/blur, send a follow-up POST with the
 *     comment. Empty submit dismisses the input.
 *   - Once a rating is submitted, the row is read-only for this session
 *     (no edit). Refresh resets — feedback rows in DB are append-only and
 *     admins see all submissions.
 *
 * Submit path: web /api/chat-store?action=submit_feedback → admin
 * /api/chat/feedback. message_id is required on the admin side; we only
 * render this component when the parent has provided a real id.
 */
export function MessageFeedback({ messageId, threadId }: MessageFeedbackProps) {
    const [state, setState] = useState<FeedbackState>({ kind: 'idle' });
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const submit = async (rating: 'up' | 'down', extra?: { comment?: string }) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/chat-store?action=submit_feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message_id: messageId,
                    thread_id: threadId || undefined,
                    rating,
                    comment: extra?.comment || undefined,
                }),
            });
            if (!res.ok) {
                setState({ kind: 'error', message: `Couldn't save (${res.status})` });
                return;
            }
            if (rating === 'down' && !extra?.comment) {
                setState({ kind: 'down_pending', submittedId: messageId });
            } else {
                setState({ kind: 'submitted', rating });
            }
        } catch {
            setState({ kind: 'error', message: "Couldn't save — check connection" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCommentSubmit = async () => {
        const text = comment.trim();
        if (text.length === 0) {
            // Empty → just dismiss the text field, keep the down rating.
            setState({ kind: 'submitted', rating: 'down' });
            return;
        }
        await submit('down', { comment: text });
    };

    if (state.kind === 'submitted') {
        return (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Check className="h-3 w-3 text-emerald-400" />
                <span>Thanks — feedback saved.</span>
            </div>
        );
    }

    if (state.kind === 'down_pending') {
        return (
            <div className="mt-2 flex max-w-[460px] flex-col gap-1.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span>Saved. <span className="text-zinc-500">What was wrong? (optional)</span></span>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleCommentSubmit();
                            }
                            if (e.key === 'Escape') {
                                setState({ kind: 'submitted', rating: 'down' });
                            }
                        }}
                        placeholder="Too generic / wrong number / missed the point…"
                        autoFocus
                        className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                    />
                    <button
                        type="button"
                        onClick={() => void handleCommentSubmit()}
                        disabled={submitting}
                        className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2 flex items-center gap-1">
            <button
                type="button"
                onClick={() => void submit('up')}
                disabled={submitting}
                aria-label="Helpful answer"
                title="Helpful"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
                data-testid="message-feedback-up"
            >
                <ThumbsUp className="h-3 w-3" />
            </button>
            <button
                type="button"
                onClick={() => void submit('down')}
                disabled={submitting}
                aria-label="Unhelpful answer"
                title="Not helpful"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                data-testid="message-feedback-down"
            >
                <ThumbsDown className="h-3 w-3" />
            </button>
            {state.kind === 'error' ? (
                <span className="ml-1.5 text-[10px] text-red-400">{state.message}</span>
            ) : null}
        </div>
    );
}
