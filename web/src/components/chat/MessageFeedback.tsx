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
            <div role="status" className="mt-2 inline-flex items-center gap-1.5 text-meta text-fg-muted">
                <Check aria-hidden className="size-3.5 text-up" />
                <span>Thanks, feedback saved.</span>
            </div>
        );
    }

    if (state.kind === 'down_pending') {
        return (
            <div className="mt-2 flex max-w-[460px] flex-col gap-1.5">
                <div role="status" className="inline-flex items-center gap-1.5 text-meta text-fg-secondary">
                    <Check aria-hidden className="size-3.5 text-up" />
                    <span>Saved. <span className="text-fg-muted">What was wrong? (optional)</span></span>
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
                        aria-label="What was wrong with this answer?"
                        className="tc-control h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2.5 text-body-sm text-fg placeholder:text-fg-faint transition-colors hover:border-border-strong focus-visible:outline-2"
                    />
                    <button
                        type="button"
                        onClick={() => void handleCommentSubmit()}
                        disabled={submitting}
                        className="h-8 rounded-control border border-border bg-surface px-3 text-body-sm font-medium text-fg shadow-xs transition-colors hover:border-border-strong hover:bg-subtle disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-3 flex items-center gap-2">
            <span className="text-meta text-fg-muted">Was this helpful?</span>
            <button
                type="button"
                onClick={() => void submit('up')}
                disabled={submitting}
                aria-label="Helpful answer"
                title="Helpful"
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-meta font-medium text-fg-secondary transition-colors hover:border-border-strong hover:bg-subtle hover:text-fg disabled:opacity-50"
                data-testid="message-feedback-up"
            >
                <ThumbsUp aria-hidden className="size-3.5" strokeWidth={1.75} />
                <span>Yes</span>
            </button>
            <button
                type="button"
                onClick={() => void submit('down')}
                disabled={submitting}
                aria-label="Unhelpful answer"
                title="Not helpful"
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-meta font-medium text-fg-secondary transition-colors hover:border-border-strong hover:bg-subtle hover:text-fg disabled:opacity-50"
                data-testid="message-feedback-down"
            >
                <ThumbsDown aria-hidden className="size-3.5" strokeWidth={1.75} />
                <span>No</span>
            </button>
            {state.kind === 'error' ? (
                <span role="alert" className="ml-1.5 text-meta text-down">{state.message}</span>
            ) : null}
        </div>
    );
}
