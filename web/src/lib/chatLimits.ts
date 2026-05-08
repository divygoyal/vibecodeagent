/**
 * Single source of truth for AI chat input length thresholds. The same numbers
 * gate both the textarea UI and the server's request validation, so we never
 * end up in a state where the client thinks a message is fine but the server
 * rejects it (or vice versa).
 *
 * MAX_INPUT_CHARS — hard cap. Past this, Send is disabled client-side and the
 * /api/ai-chat route returns 400 with a parseable error code. ~24k chars is
 * roughly 6k tokens, which leaves comfortable headroom for system prompt +
 * history + injected context inside Gemini's input budget AND keeps TTFB well
 * under the client's 60s abort timer.
 *
 * WARN_INPUT_CHARS — soft threshold. Past this we surface a non-blocking
 * counter so the user knows long messages take longer to process before they
 * hit the hard cap.
 */
export const MAX_INPUT_CHARS = 24_000;
export const WARN_INPUT_CHARS = 8_000;

/** Discriminator the client checks for to render a length-specific error. */
export const ERR_MESSAGE_TOO_LONG = 'message_too_long';
