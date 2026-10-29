/**
 * GA4 conversion events fired from the browser. The server cannot call gtag, so the moment it sees ("MCP approval
 * saved") leaves a short one-shot cookie and the next dashboard page load sends the event and clears it.
 *
 *   sign_up        first app load of a new account (admin welcome_seen = false), params: method google|github + first touch
 *   mcp_connected  first approval of an AI app (ChatGPT, Claude, ...) on the consent page, params: method oauth + first touch
 */
import { signUpParams, type Touch } from './attribution';

export const MCP_EVENT_COOKIE = 'tc_ev_mcp';
export const MCP_SENT_KEY = 'tc_mcp_connected_sent';
const MCP_COOKIE_MAX_AGE_S = 30 * 24 * 3600;

export type SignUpMethod = 'google' | 'github';

export const signUpMethod = (provider: string | null | undefined): SignUpMethod => (provider === 'github' ? 'github' : 'google');

export const signUpEvent = (touch: Touch | null, provider: string | null | undefined) => ({ name: 'sign_up' as const, params: signUpParams(touch, signUpMethod(provider)) });

export const mcpConnectedEvent = (touch: Touch | null) => ({ name: 'mcp_connected' as const, params: { method: 'oauth', ...(touch ?? {}) } });

/** Set-Cookie value written by the consent decision route after an approval was saved (not HttpOnly: the page must read it). */
export function mcpEventSetCookie(secure: boolean): string {
    return `${MCP_EVENT_COOKIE}=1; Max-Age=${MCP_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function hasMcpEventCookie(cookies: string | null | undefined): boolean {
    return (cookies ?? '').split(/;\s*/).some((p) => p === `${MCP_EVENT_COOKIE}=1`);
}

/** document.cookie string that deletes the one-shot cookie. */
export const clearMcpEventCookie = (): string => `${MCP_EVENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
