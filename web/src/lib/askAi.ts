/**
 * Ask-AI navigation helper.
 *
 * Replaces the legacy `window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai',
 * { detail: { question } }))` pattern that opened the floating AIChatbot
 * widget. The widget has been removed; all "Ask AI" entry points now route
 * the user to the dedicated /dashboard/ask page with the question
 * pre-filled via the `?q=` query param. The page's QuestionFromQuery
 * component reads the param, sends the message when Ask can answer (or puts it
 * in the composer when it cannot: AI unavailable, no messages left), and scrubs
 * the URL so the question doesn't re-fire on refresh.
 *
 * Pass `{ prefill: true }` to only fill the composer and let the user press
 * Enter (`&prefill=1`), for deep links that should not spend a message.
 *
 * Use buildAskAiUrl() with `next/link` or a router.push() call.
 */

export function buildAskAiUrl(question: string, opts: { prefill?: boolean } = {}): string {
    const trimmed = question.trim();
    if (!trimmed) return '/dashboard/ask';
    return `/dashboard/ask?q=${encodeURIComponent(trimmed)}${opts.prefill ? '&prefill=1' : ''}`;
}
