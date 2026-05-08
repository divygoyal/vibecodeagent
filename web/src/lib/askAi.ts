/**
 * Ask-AI navigation helper.
 *
 * Replaces the legacy `window.dispatchEvent(new CustomEvent('trafficclaw:ask-ai',
 * { detail: { question } }))` pattern that opened the floating AIChatbot
 * widget. The widget has been removed; all "Ask AI" entry points now route
 * the user to the dedicated /dashboard/ai-chat page with the question
 * pre-filled via the `?q=` query param. The page's AutoPromptFromQuery
 * component reads the param, auto-sends the message, and scrubs the URL so
 * the question doesn't re-fire on refresh.
 *
 * Use buildAskAiUrl() with `next/link` or a router.push() call.
 */

export function buildAskAiUrl(question: string): string {
    const trimmed = question.trim();
    if (!trimmed) return '/dashboard/ai-chat';
    return `/dashboard/ai-chat?q=${encodeURIComponent(trimmed)}`;
}
